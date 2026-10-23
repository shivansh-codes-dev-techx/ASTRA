import asyncio
import importlib.util
import json
import os
import shutil
import sqlite3
import sys
import tempfile
import time
import types
import unittest
from http.cookies import SimpleCookie
from pathlib import Path
from unittest.mock import MagicMock, Mock, patch

from fastapi import FastAPI, HTTPException


PROJECT_ROOT = Path(__file__).resolve().parents[1]
PRODUCTION_DATABASE = (PROJECT_ROOT / "backend" / "astra_users.db").resolve()


class ClosingSQLiteConnection(sqlite3.Connection):
    def __exit__(self, exception_type, exception, traceback):
        try:
            return super().__exit__(exception_type, exception, traceback)
        finally:
            self.close()


class IsolatedAuthClient:
    def __init__(self, app):
        self.app = app
        self.cookies = {}

    def request(self, method, path, payload=None, headers=None):
        body = b"" if payload is None else json.dumps(payload).encode()
        incoming = [{"type": "http.request", "body": body, "more_body": False}]
        sent = []
        request_headers = []
        if payload is not None:
            request_headers.append((b"content-type", b"application/json"))
        if headers:
            request_headers.extend(
                (name.lower().encode("ascii"), value.encode("ascii"))
                for name, value in headers.items()
            )
        if self.cookies:
            cookie_value = "; ".join(
                f"{key}={value}" for key, value in self.cookies.items()
            )
            request_headers.append((b"cookie", cookie_value.encode("ascii")))

        async def receive():
            return incoming.pop(0) if incoming else {"type": "http.disconnect"}

        async def send(event):
            sent.append(event)

        raw_path = path.encode("ascii")
        scope = {
            "type": "http",
            "asgi": {"version": "3.0", "spec_version": "2.3"},
            "http_version": "1.1",
            "method": method,
            "scheme": "https",
            "path": path,
            "raw_path": raw_path,
            "query_string": b"",
            "root_path": "",
            "headers": request_headers,
            "client": ("127.0.0.1", 12345),
            "server": ("testserver", 443),
        }
        asyncio.run(self.app(scope, receive, send))
        start = next(
            event for event in sent if event["type"] == "http.response.start"
        )
        response_body = b"".join(
            event.get("body", b"")
            for event in sent
            if event["type"] == "http.response.body"
        )
        response_headers = dict(start["headers"])
        for name, value in start["headers"]:
            if name.lower() == b"set-cookie":
                cookie = SimpleCookie()
                cookie.load(value.decode("latin-1"))
                for key, morsel in cookie.items():
                    if morsel.value:
                        self.cookies[key] = morsel.value
                    else:
                        self.cookies.pop(key, None)
        return (
            start["status"],
            json.loads(response_body) if response_body else None,
            response_headers,
        )


class AuthProviderTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls._temporary = tempfile.TemporaryDirectory(prefix="astra-auth-tests-")
        cls._database_env = patch.dict(
            os.environ,
            {
                "DATABASE_URL": "",
                "ASTRA_SQLITE_PATH": str(
                    Path(cls._temporary.name) / "auth-import.db"
                ),
            },
        )
        cls._database_env.start()
        cls.package_dir = Path(cls._temporary.name) / "isolated_auth"
        cls.package_dir.mkdir()
        (cls.package_dir / "__init__.py").write_text("", encoding="utf-8")
        shutil.copyfile(
            PROJECT_ROOT / "backend" / "auth.py",
            cls.package_dir / "auth.py",
        )
        original_connect = sqlite3.connect

        def isolated_connect(database, *args, **kwargs):
            kwargs["factory"] = ClosingSQLiteConnection
            return original_connect(database, *args, **kwargs)

        sqlite3.connect = isolated_connect
        try:
            module_name = "isolated_auth.auth"
            spec = importlib.util.spec_from_file_location(
                module_name, cls.package_dir / "auth.py"
            )
            cls.auth = importlib.util.module_from_spec(spec)
            sys.modules[module_name] = cls.auth
            # Import auth in isolated SQLite mode for these tests only.
            spec.loader.exec_module(cls.auth)
        finally:
            sqlite3.connect = original_connect
    @classmethod
    def tearDownClass(cls):
        sys.modules.pop("isolated_auth.auth", None)
        sys.modules.pop("isolated_auth", None)
        cls._database_env.stop()
        cls._temporary.cleanup()

    def setUp(self):
        self.database_path = (
            Path(self._temporary.name) / f"{self._testMethodName}.db"
        ).resolve()
        self.assertNotEqual(self.database_path, PRODUCTION_DATABASE)
        self.auth.DB_PATH = self.database_path
        self.auth.connect_db = self._connect
        self.auth.init_db()
        self.app = FastAPI()
        self.app.include_router(self.auth.router)
        self.client = IsolatedAuthClient(self.app)

    def tearDown(self):
        self.database_path.unlink(missing_ok=True)

    def _connect(self):
        db = sqlite3.connect(
            self.database_path,
            factory=ClosingSQLiteConnection,
        )
        db.row_factory = sqlite3.Row
        return db

    def _signup(self, email="rider@example.com"):
        return self.client.request(
            "POST",
            "/auth/signup",
            {
                "name": "Test Rider",
                "email": email,
                "password": "test-password-123",
            },
        )

    def _configured_email(self):
        return patch.dict(
            "os.environ",
            {
                "RESEND_API_KEY": "re_test_placeholder",
                "ASTRA_EMAIL_FROM": "ASTRA <test@example.com>",
                "ASTRA_PUBLIC_URL": "https://astra.example.com",
            },
        )

    def _mock_resend(self, token_holder):
        def send(_url, *, json, **_kwargs):
            token_holder.append(json["html"].split("verify-email=")[1].split('"')[0])
            return types.SimpleNamespace(status_code=200)

        return patch.object(self.auth.requests, "post", side_effect=send)

    def test_resend_request_uses_recipient_and_link_and_logs_safe_provider_status(self):
        requests_sent = []

        def accepted(url, *, headers, json, **_kwargs):
            requests_sent.append((url, headers, json))
            return types.SimpleNamespace(status_code=200)

        with self._configured_email(), patch.object(
            self.auth.requests, "post", side_effect=accepted
        ), self.assertLogs(self.auth.__name__, level="INFO") as logs:
            self.auth._send_verification_email(
                "rider@example.com",
                "verification-token-for-test",
            )

        url, headers, payload = requests_sent[0]
        self.assertEqual(url, self.auth.RESEND_API_URL)
        self.assertEqual(headers["Authorization"], "Bearer re_test_placeholder")
        self.assertEqual(payload["to"], ["rider@example.com"])
        self.assertIn(
            "https://astra.example.com/login#verify-email=verification-token-for-test",
            payload["html"],
        )
        self.assertIn("HTTP 200", "\n".join(logs.output))
        self.assertNotIn("rider@example.com", "\n".join(logs.output))
        self.assertNotIn("verification-token-for-test", "\n".join(logs.output))

        with self._configured_email(), patch.object(
            self.auth.requests,
            "post",
            return_value=types.SimpleNamespace(status_code=422),
        ), self.assertLogs(self.auth.__name__, level="ERROR") as failed_logs:
            with self.assertRaises(self.auth.ProviderUnavailable):
                self.auth._send_verification_email(
                    "rider@example.com",
                    "verification-token-for-test",
                )
        self.assertIn("HTTP 422", "\n".join(failed_logs.output))
        self.assertNotIn("rider@example.com", "\n".join(failed_logs.output))
        self.assertNotIn("verification-token-for-test", "\n".join(failed_logs.output))

    def _configured_google(self):
        return patch.dict(
            "os.environ",
            {
                "GOOGLE_CLIENT_ID": "client-id",
                "ASTRA_PUBLIC_URL": "https://astra.example.com",
            },
        )

    def _install_google_verifier(self, side_effect):
        google = types.ModuleType("google")
        google.__path__ = []
        google_auth = types.ModuleType("google.auth")
        google_auth.__path__ = []
        transport = types.ModuleType("google.auth.transport")
        transport.__path__ = []
        transport_requests = types.ModuleType("google.auth.transport.requests")
        transport_requests.Request = lambda: object()
        oauth2 = types.ModuleType("google.oauth2")
        oauth2.__path__ = []
        id_token = types.ModuleType("google.oauth2.id_token")
        if isinstance(side_effect, dict):
            verifier = Mock(return_value=side_effect)
        else:
            verifier = Mock(side_effect=side_effect)
        id_token.verify_oauth2_token = verifier
        modules = {
            "google": google,
            "google.auth": google_auth,
            "google.auth.transport": transport,
            "google.auth.transport.requests": transport_requests,
            "google.oauth2": oauth2,
            "google.oauth2.id_token": id_token,
        }
        return patch.dict(sys.modules, modules), verifier

    def _issue_google_csrf(self):
        status, result, _ = self.client.request(
            "GET",
            "/auth/google/csrf",
            headers={"origin": "https://astra.example.com"},
        )
        if status != 200:
            raise AssertionError(f"CSRF token request failed: {result}")
        return result["csrf_token"]

    def _google_request(
        self,
        credential="a" * 40,
        csrf=None,
        origin="https://astra.example.com",
        include_csrf=True,
    ):
        csrf_token = self._issue_google_csrf() if csrf is None else csrf
        payload = {"credential": credential}
        if include_csrf:
            payload["csrf_token"] = csrf_token
        return self.client.request(
            "POST",
            "/auth/google",
            payload,
            headers={"origin": origin},
        )

    def test_password_signup_is_unverified_and_email_provider_failure_is_explicit(self):
        with patch.dict("os.environ", {}, clear=False):
            for name in (
                "RESEND_API_KEY",
                "ASTRA_EMAIL_FROM",
                "ASTRA_PUBLIC_URL",
            ):
                os.environ.pop(name, None)
            with self.assertLogs(self.auth.__name__, level="ERROR") as logs:
                status, result, _ = self._signup()

        self.assertEqual(status, 503)
        self.assertIn("RESEND_API_KEY", "\n".join(logs.output))
        self.assertNotIn("re_test_placeholder", "\n".join(logs.output))
        self.assertTrue(result["detail"].startswith("Your account was created"))
        self.assertFalse(self.client.cookies)
        with self._connect() as db:
            user = db.execute(
                "SELECT email_verified FROM users WHERE email = ?",
                ("rider@example.com",),
            ).fetchone()
            token_count = db.execute(
                "SELECT COUNT(*) FROM email_verification_tokens"
            ).fetchone()[0]
        self.assertEqual(user["email_verified"], 0)
        self.assertEqual(token_count, 0)

        with self._configured_email(), patch.object(
            self.auth.requests,
            "post",
            side_effect=self.auth.requests.RequestException("provider unavailable"),
        ), self.assertLogs(self.auth.__name__, level="ERROR") as logs:
            failure_status, failure, _ = self._signup("failed@example.com")
        self.assertEqual(failure_status, 503)
        self.assertIn("RequestException", "\n".join(logs.output))
        self.assertNotIn("provider unavailable", failure["detail"])
        self.assertFalse(self.client.cookies)

    def test_valid_email_token_verifies_once_and_login_keeps_session_contract(self):
        issued_tokens = []
        with self._configured_email(), self._mock_resend(issued_tokens):
            status, result, _ = self._signup()
        self.assertEqual(status, 201, result)
        self.assertTrue(result["verification_pending"])
        self.assertEqual(
            result["message"],
            "Account created. Check your email to verify your account before signing in.",
        )
        self.assertFalse(self.client.cookies)
        with self._connect() as db:
            user = db.execute(
                "SELECT id, email_verified FROM users WHERE email = ?",
                ("rider@example.com",),
            ).fetchone()
            stored_hash = db.execute(
                "SELECT token_hash FROM email_verification_tokens WHERE user_id = ?",
                (user["id"],),
            ).fetchone()["token_hash"]
        self.assertEqual(user["email_verified"], 0)
        self.assertEqual(
            stored_hash,
            self.auth.hashlib.sha256(issued_tokens[0].encode()).hexdigest(),
        )

        status, login_result, _ = self.client.request(
            "POST",
            "/auth/login",
            {"email": "rider@example.com", "password": "test-password-123"},
        )
        self.assertEqual(status, 403, login_result)
        self.assertFalse(self.client.cookies)

        status, verified, _ = self.client.request(
            "POST", "/auth/verify-email", {"token": issued_tokens[0]}
        )
        self.assertEqual(status, 200, verified)
        status, reused, _ = self.client.request(
            "POST", "/auth/verify-email", {"token": issued_tokens[0]}
        )
        self.assertEqual(status, 400)
        self.assertIn("invalid or expired", reused["detail"])

        status, login_result, login_headers = self.client.request(
            "POST",
            "/auth/login",
            {"email": "rider@example.com", "password": "test-password-123"},
        )
        self.assertEqual(status, 200, login_result)
        self.assertIn(self.auth.COOKIE_NAME, self.client.cookies)
        session_cookie = login_headers[b"set-cookie"].decode("latin-1")
        cookie_attributes = session_cookie.lower()
        self.assertIn("httponly", cookie_attributes)
        self.assertIn("secure", cookie_attributes)
        self.assertIn("samesite=lax", cookie_attributes)
        self.assertIn("path=/", cookie_attributes)
        status, me_result, _ = self.client.request("GET", "/auth/me")
        self.assertEqual(status, 200)
        self.assertEqual(me_result["user"]["name"], "Test Rider")

    def test_logout_revokes_existing_session_token(self):
        # Create a test account.
        with self._connect() as db:
            db.execute(
                """
                INSERT INTO users (name, email, password_hash, created_at)
                VALUES (?, ?, ?, ?)
                """,
                (
                    "Logout Test Rider",
                    "logout-test@example.com",
                    self.auth.hash_password("correct-test-password"),
                    1,
                ),
            )

        # Log in and capture the session cookie.
        status, _, headers = self.client.request(
            "POST",
            "/auth/login",
            payload={
                   "email": "logout-test@example.com",
                   "password": "correct-test-password",
            },
        )
        self.assertEqual(status, 200)

        session_cookie = headers[b"set-cookie"].decode("latin-1")
        self.assertTrue(
            session_cookie.startswith(f"{self.auth.COOKIE_NAME}=")
        )
        token = session_cookie.split(";", 1)[0].split("=", 1)[1]

        # The token must work before logout.
        status, _, _ = self.client.request(
            "GET", "/auth/me", headers={"Cookie": f"{self.auth.COOKIE_NAME}={token}"}
        )
        self.assertEqual(status, 200)

        # Logout using the same session.
        status, result, _ = self.client.request(
            "POST",
            "/auth/logout",
            headers={
                "Cookie": f"{self.auth.COOKIE_NAME}={token}"
            },
        )
        self.assertEqual(status, 200)
        self.assertEqual(result["message"], "Logged out.")

        # Replaying the old token must fail, even without the browser cookie.
        status, _, _ = self.client.request(
            "GET", "/auth/me", headers={"Cookie": f"{self.auth.COOKIE_NAME}={token}"}
        )
        self.assertEqual(status, 401)
    def test_logout_database_failure_returns_503_and_clears_cookie(self):
        token = self.auth.create_token(1)
        body, signature = token.rsplit(".", 1)

        with patch.object(
            self.auth,
            "connect_db",
            side_effect=sqlite3.OperationalError("database unavailable"),
        ):
            status, result, headers = self.client.request(
                "POST",
                "/auth/logout",
                headers={
                    "Cookie": f"{self.auth.COOKIE_NAME}={token}"
                },
            )

        self.assertEqual(status, 503)
        self.assertEqual(
            result["detail"],
            "Unable to complete logout. Please try again.",
        )

        set_cookie = headers.get(b"set-cookie", b"").decode("latin-1").lower()
        self.assertIn(f"{self.auth.COOKIE_NAME}=", set_cookie)
        self.assertIn("max-age=0", set_cookie)
    def test_me_returns_503_when_session_database_is_unavailable(self):
        token = self.auth.create_token(1)

        with patch.object(
            self.auth,
            "connect_db",
            side_effect=sqlite3.OperationalError("database unavailable"),
        ):
            status, result, _ = self.client.request(
                "GET",
                "/auth/me",
                headers={
                    "Cookie": f"{self.auth.COOKIE_NAME}={token}"
                },
            )

        self.assertEqual(status, 503)
    def test_me_returns_503_when_user_lookup_database_fails(self):
        token = self.auth.create_token(1)
        original_connect = self.auth.connect_db
        calls = 0

        def fail_on_second_connection():
            nonlocal calls
            calls += 1
            if calls == 2:
                raise sqlite3.OperationalError("database unavailable")
            return original_connect()

        with patch.object(
            self.auth,
            "connect_db",
            side_effect=fail_on_second_connection,
        ):
            status, result, _ = self.client.request(
                "GET",
                "/auth/me",
                headers={
                    "Cookie": f"{self.auth.COOKIE_NAME}={token}"
                },
            )

        self.assertEqual(status, 503)
        self.assertEqual(
            result["detail"],
            "Authentication service temporarily unavailable.",
        )


    def test_failed_password_login_does_not_create_session_or_change_account(self):
        with self._connect() as db:
            db.execute(
                """
                INSERT INTO users (name, email, password_hash, created_at)
                VALUES (?, ?, ?, ?)
                """,
                (
                    "Test Account",
                    "login-test@example.com",
                    self.auth.hash_password("correct-test-password"),
                    1,
                ),
            )

        status, result, _ = self.client.request(
            "POST",
            "/auth/login",
            {"email": "login-test@example.com", "password": "wrong-test-password"},
        )

        self.assertEqual(status, 401, result)
        self.assertNotIn(self.auth.COOKIE_NAME, self.client.cookies)
        with self._connect() as db:
            user = db.execute(
                "SELECT email, email_verified FROM users WHERE email = ?",
                ("login-test@example.com",),
            ).fetchone()
            self.assertEqual(
                db.execute("SELECT COUNT(*) FROM users").fetchone()[0],
                1,
            )
        self.assertEqual(user["email"], "login-test@example.com")
        self.assertEqual(user["email_verified"], 1)

    def test_invalid_and_expired_verification_tokens_fail(self):
        issued_tokens = []
        with self._configured_email(), self._mock_resend(issued_tokens):
            status, _, _ = self._signup()
        self.assertEqual(status, 201)
        status, invalid, _ = self.client.request(
            "POST", "/auth/verify-email", {"token": "x" * 40}
        )
        self.assertEqual(status, 400)
        self.assertIn("invalid or expired", invalid["detail"])

        with self._connect() as db:
            db.execute(
                "UPDATE email_verification_tokens SET expires_at = 1"
            )
        status, expired, _ = self.client.request(
            "POST", "/auth/verify-email", {"token": issued_tokens[0]}
        )
        self.assertEqual(status, 400)
        self.assertIn("invalid or expired", expired["detail"])

    def test_resend_is_cooldown_limited_and_non_enumerating(self):
        issued_tokens = []
        with self._configured_email(), self._mock_resend(issued_tokens):
            self.assertEqual(self._signup()[0], 201)
            status, result, _ = self.client.request(
                "POST",
                "/auth/resend-verification",
                {"email": "rider@example.com"},
            )
        self.assertEqual(status, 202)
        self.assertIn("Delivery is not confirmed", result["message"])
        self.assertEqual(len(issued_tokens), 1)

        unknown_status, unknown, _ = self.client.request(
            "POST",
            "/auth/resend-verification",
            {"email": "missing@example.com"},
        )
        self.assertEqual(unknown_status, 202)
        self.assertEqual(unknown["message"], result["message"])

    def test_postgres_verification_locks_token_row(self):
        db = MagicMock()
        db.__enter__.return_value = db
        selected_row = MagicMock()
        selected_row.fetchone.return_value = {
            "user_id": 7,
            "expires_at": int(time.time()) + 60,
        }
        db.execute.side_effect = [MagicMock(), selected_row, MagicMock(), MagicMock()]

        with patch.object(self.auth, "connect_db", return_value=db), patch.object(
            self.auth.database, "is_postgres", return_value=True
        ):
            result = self.auth.verify_email(
                self.auth.VerifyEmailInput(token="verification-token-" + "x" * 32)
            )

        verification_query = db.execute.call_args_list[1].args[0]
        self.assertIn("FOR UPDATE", verification_query)
        self.assertEqual(result, {"message": "Email verified. You can now sign in."})

    def test_postgres_resend_locks_user_row_before_cooldown_check(self):
        db = MagicMock()
        db.__enter__.return_value = db
        selected_row = MagicMock()
        selected_row.fetchone.return_value = {
            "id": 7,
            "email_verified": 0,
            "email_verification_last_sent_at": 0,
        }
        db.execute.side_effect = [MagicMock(), selected_row, MagicMock(), MagicMock()]

        with patch.object(self.auth, "connect_db", return_value=db), patch.object(
            self.auth.database, "is_postgres", return_value=True
        ), patch.object(self.auth, "_send_verification_email") as send_email:
            result = self.auth.resend_verification(
                self.auth.EmailInput(email="rider@example.com")
            )

        resend_query = db.execute.call_args_list[1].args[0]
        self.assertIn("FOR UPDATE", resend_query)
        send_email.assert_called_once()
        self.assertIn("Delivery is not confirmed", result["message"])

    def test_google_csrf_token_cookie_is_http_only_secure_and_same_site(self):
        status, result, headers = self.client.request(
            "GET",
            "/auth/google/csrf",
            headers={"origin": "https://astra.example.com"},
        )
        self.assertEqual(status, 200, result)
        self.assertGreaterEqual(len(result["csrf_token"]), 16)
        self.assertIn(self.auth.GOOGLE_CSRF_COOKIE_NAME, self.client.cookies)
        set_cookie = headers[b"set-cookie"].decode("latin-1").lower()
        self.assertIn("httponly", set_cookie)
        self.assertIn("secure", set_cookie)
        self.assertIn("samesite=lax", set_cookie)
        self.assertIn("path=/", set_cookie)

    def test_google_login_rejects_missing_or_invalid_csrf_without_creating_session(self):
        def assert_no_session_or_account():
            self.assertNotIn(self.auth.COOKIE_NAME, self.client.cookies)
            with self._connect() as db:
                self.assertEqual(
                    db.execute("SELECT COUNT(*) FROM users").fetchone()[0],
                    0,
                )
                self.assertEqual(
                    db.execute("SELECT COUNT(*) FROM google_identities").fetchone()[0],
                    0,
                )

        with self._configured_google(), patch.object(
            self.auth,
            "_verify_google_credential",
            return_value=("test-subject", "test@example.com", "Test User"),
        ) as verify_credential:
            # Missing body token is rejected by input validation before the route runs.
            status, result, _ = self._google_request(include_csrf=False)
            self.assertEqual(status, 422, result)
            assert_no_session_or_account()

            # A valid body token cannot be used without its browser-bound cookie.
            token = self._issue_google_csrf()
            self.client.cookies.pop(self.auth.GOOGLE_CSRF_COOKIE_NAME)
            status, result, _ = self._google_request(csrf=token)
            self.assertEqual(status, 400, result)
            assert_no_session_or_account()

            # The cookie and body must contain the same signed server-issued token.
            token = self._issue_google_csrf()
            self.client.cookies[self.auth.GOOGLE_CSRF_COOKIE_NAME] = token
            status, result, _ = self._google_request(csrf="mismatched-test-token")
            self.assertEqual(status, 400, result)
            assert_no_session_or_account()

            # A matching but tampered cookie/body pair still fails the HMAC check.
            token = self._issue_google_csrf()
            body, signature = token.rsplit(".", 1)
            tampered = body + "." + ("0" if signature[0] != "0" else "1") + signature[1:]
            self.client.cookies[self.auth.GOOGLE_CSRF_COOKIE_NAME] = tampered
            status, result, _ = self._google_request(csrf=tampered)
            self.assertEqual(status, 400, result)
            assert_no_session_or_account()

            # A correctly signed token is rejected after its server-side expiry.
            issued_at = int(self.auth.time.time())
            token = self._issue_google_csrf()
            with patch.object(
                self.auth.time,
                "time",
                return_value=issued_at + self.auth.GOOGLE_CSRF_TTL + 1,
            ):
                status, result, _ = self._google_request(csrf=token)
            self.assertEqual(status, 400, result)
            assert_no_session_or_account()

            # Origin is still checked before credential verification or account creation.
            status, result, _ = self._google_request(origin="https://untrusted.example")
            self.assertEqual(status, 400, result)
            self.assertIn("could not be validated", result["detail"])
            assert_no_session_or_account()
            verify_credential.assert_not_called()

        with self._configured_google():
            for failure in (
                ValueError("invalid signature"),
                ValueError("wrong audience"),
                ValueError("expired"),
            ):
                context, verifier = self._install_google_verifier(failure)
                with context:
                    status, result, _ = self._google_request()
                self.assertEqual(status, 401, result)
                verifier.assert_called_once()
                self.assertEqual(verifier.call_args.kwargs["audience"], "client-id")
                assert_no_session_or_account()

        with self._configured_google(), patch.object(
            self.auth,
            "_verify_google_credential",
            side_effect=self.auth.ProviderUnavailable(
                "Google credential verification is temporarily unavailable."
            ),
        ):
            status, result, _ = self._google_request()
        self.assertEqual(status, 503)
        self.assertIn("temporarily unavailable", result["detail"])
        assert_no_session_or_account()

    def test_google_identity_creates_and_reuses_account_without_email_linking(self):
        claims = {
            "sub": "google-subject-123",
            "email": "google@example.com",
            "email_verified": True,
            "name": "Google Rider",
        }
        context, verifier = self._install_google_verifier(claims)
        with self._configured_google(), context:
            first_status, first, _ = self._google_request()
            first_user_id = first["user"]["id"]
            self.client.cookies.clear()
            second_status, second, _ = self._google_request()
        self.assertEqual(first_status, 200, first)
        self.assertEqual(second_status, 200, second)
        self.assertEqual(second["user"]["id"], first_user_id)
        self.assertEqual(second["user"]["name"], "Google Rider")
        self.assertIn(self.auth.COOKIE_NAME, self.client.cookies)
        self.assertNotIn(self.auth.GOOGLE_CSRF_COOKIE_NAME, self.client.cookies)
        self.assertEqual(verifier.call_count, 2)
        with self._connect() as db:
            self.assertEqual(
                db.execute("SELECT COUNT(*) FROM users").fetchone()[0],
                1,
            )

        password_user, _, _ = self._signup("google@example.com")
        self.assertEqual(password_user, 409)
        with self._connect() as db:
            existing_email = db.execute(
                "SELECT email_verified FROM users WHERE email = ?",
                ("google@example.com",),
            ).fetchone()
        self.assertEqual(existing_email["email_verified"], 1)

        # A different Google subject cannot claim the existing verified email.
        other_claims = {**claims, "sub": "different-google-sub"}
        other_context, _ = self._install_google_verifier(other_claims)
        with self._configured_google(), other_context:
            status, conflict, _ = self._google_request()
        self.assertEqual(status, 409)
        self.assertIn("automatic account linking is not supported", conflict["detail"])
        self.assertEqual(first_user_id, second["user"]["id"])

    def test_google_unverified_email_is_rejected(self):
        claims = {
            "sub": "google-subject-456",
            "email": "unverified@example.com",
            "email_verified": False,
            "name": "Unverified Rider",
        }
        context, _ = self._install_google_verifier(claims)
        with self._configured_google(), context:
            status, result, _ = self._google_request()
        self.assertEqual(status, 401)
        self.assertIn("unverified", result["detail"])
        with self._connect() as db:
            self.assertEqual(db.execute("SELECT COUNT(*) FROM users").fetchone()[0], 0)

    def test_legacy_accounts_remain_verified_after_additive_migration(self):
        with self._connect() as db:
            db.execute("DROP TABLE email_verification_tokens")
            db.execute("DROP TABLE google_identities")
            db.execute("ALTER TABLE users DROP COLUMN email_verified")
            db.execute(
                """
                INSERT INTO users (name, email, password_hash, created_at)
                VALUES (?, ?, ?, ?)
                """,
                (
                    "Legacy Rider",
                    "legacy@example.com",
                    self.auth.hash_password("legacy-password"),
                    1,
                ),
            )
        self.auth.init_db()
        status, result, _ = self.client.request(
            "POST",
            "/auth/login",
            {"email": "legacy@example.com", "password": "legacy-password"},
        )
        self.assertEqual(status, 200, result)
        self.assertEqual(result["user"]["name"], "Legacy Rider")
        self.assertIn(self.auth.COOKIE_NAME, self.client.cookies)

    def test_unconfigured_google_provider_is_not_reported_as_available(self):
        with patch.dict("os.environ", {}, clear=False):
            os.environ.pop("GOOGLE_CLIENT_ID", None)
            status, config, _ = self.client.request("GET", "/auth/config")
        self.assertEqual(status, 200)
        self.assertIsNone(config["google_client_id"])


if __name__ == "__main__":
    unittest.main()
