import asyncio
import importlib.util
import json
import shutil
import sqlite3
import sys
import tempfile
import unittest
import types
from http.cookies import SimpleCookie
from pathlib import Path
from unittest.mock import patch

from fastapi import FastAPI


PROJECT_ROOT = Path(__file__).resolve().parents[1]
PRODUCTION_DATABASE = (PROJECT_ROOT / "backend" / "astra_users.db").resolve()
ISOLATED_MODULES = ("auth", "rides", "team_rides", "notifications")


class ClosingSQLiteConnection(sqlite3.Connection):
    def __exit__(self, exception_type, exception, traceback):
        try:
            return super().__exit__(exception_type, exception, traceback)
        finally:
            self.close()


class IsolatedASGIClient:
    def __init__(self, app):
        self.app = app
        self.cookies = {}

    def request(self, method, path, payload=None):
        body = b"" if payload is None else json.dumps(payload).encode("utf-8")
        incoming = [{"type": "http.request", "body": body, "more_body": False}]
        sent = []
        headers = []
        if payload is not None:
            headers.append((b"content-type", b"application/json"))
        if self.cookies:
            cookie_header = "; ".join(
                f"{name}={value}" for name, value in self.cookies.items()
            )
            headers.append((b"cookie", cookie_header.encode("ascii")))

        async def receive():
            if incoming:
                return incoming.pop(0)
            return {"type": "http.disconnect"}

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
            "headers": headers,
            "client": ("127.0.0.1", 12345),
            "server": ("testserver", 443),
        }
        asyncio.run(self.app(scope, receive, send))

        start = next(event for event in sent if event["type"] == "http.response.start")
        response_body = b"".join(
            event.get("body", b"")
            for event in sent
            if event["type"] == "http.response.body"
        )
        for name, value in start["headers"]:
            if name.lower() == b"set-cookie":
                cookie = SimpleCookie()
                cookie.load(value.decode("latin-1"))
                for key, morsel in cookie.items():
                    if morsel.value:
                        self.cookies[key] = morsel.value
                    else:
                        self.cookies.pop(key, None)

        return start["status"], json.loads(response_body) if response_body else None


class AuthenticatedPrivateJoinEndToEndTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls._temp_dir = tempfile.TemporaryDirectory(
            prefix="astra-authenticated-join-e2e-"
        )
        cls._package_dir = Path(cls._temp_dir.name) / "isolated_backend"
        cls._package_dir.mkdir()
        (cls._package_dir / "__init__.py").write_text("", encoding="utf-8")

        for module_name in ISOLATED_MODULES:
            shutil.copyfile(
                PROJECT_ROOT / "backend" / f"{module_name}.py",
                cls._package_dir / f"{module_name}.py",
            )

        original_connect = sqlite3.connect

        def isolated_connect(database, *args, **kwargs):
            kwargs["factory"] = ClosingSQLiteConnection
            return original_connect(database, *args, **kwargs)

        previous_backend_auth = sys.modules.get("backend.auth")
        sqlite3.connect = isolated_connect
        try:
            cls.auth = cls._load_module("auth")
            sys.modules["backend.auth"] = cls.auth
            cls.rides = cls._load_module("rides")
            cls.team_rides = cls._load_module("team_rides")
            cls.notifications = cls._load_module("notifications")
        finally:
            sqlite3.connect = original_connect
            if previous_backend_auth is None:
                sys.modules.pop("backend.auth", None)
            else:
                sys.modules["backend.auth"] = previous_backend_auth

        cls.database_path = (cls._package_dir / "astra_users.db").resolve()
        if cls.database_path == PRODUCTION_DATABASE:
            raise RuntimeError("End-to-end test database resolved to the production database.")

        for module in (cls.auth, cls.rides, cls.team_rides, cls.notifications):
            module.DB_PATH = cls.database_path
            module.connect_db = cls._isolated_connect_db

        cls.app = FastAPI()
        cls.app.include_router(cls.auth.router)
        cls.app.include_router(cls.team_rides.router)
        cls.app.include_router(cls.notifications.router)

    @classmethod
    def tearDownClass(cls):
        for module_name in (
            *(f"isolated_backend.{name}" for name in ISOLATED_MODULES),
            "isolated_backend",
        ):
            sys.modules.pop(module_name, None)
        cls._temp_dir.cleanup()

    @classmethod
    def _load_module(cls, module_name):
        qualified_name = f"isolated_backend.{module_name}"
        spec = importlib.util.spec_from_file_location(
            qualified_name,
            cls._package_dir / f"{module_name}.py",
        )
        module = importlib.util.module_from_spec(spec)
        sys.modules[qualified_name] = module
        spec.loader.exec_module(module)
        return module

    @classmethod
    def _isolated_connect_db(cls):
        database_path = cls._package_dir / "astra_users.db"
        if database_path.resolve() == PRODUCTION_DATABASE:
            raise RuntimeError("Refusing to connect to the production database.")
        db = sqlite3.connect(
            database_path,
            timeout=10,
            factory=ClosingSQLiteConnection,
        )
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA foreign_keys = ON")
        return db

    def test_signup_create_private_join_and_creator_notification_retrieval(self):
        self.assertNotEqual(self.database_path, PRODUCTION_DATABASE)
        creator = IsolatedASGIClient(self.app)
        rider = IsolatedASGIClient(self.app)
        verification_tokens = []

        def send_verification(_url, *, json, **_kwargs):
            token = json["html"].split("#verify-email=")[1].split('"')[0]
            verification_tokens.append(token)
            return types.SimpleNamespace(status_code=200)

        with patch.dict(
            "os.environ",
            {
                "RESEND_API_KEY": "re_test_placeholder",
                "ASTRA_EMAIL_FROM": "ASTRA <test@example.com>",
                "ASTRA_PUBLIC_URL": "https://astra.example.com",
            },
        ), patch.object(self.auth.requests, "post", side_effect=send_verification):
            creator_status, creator_signup = creator.request(
                "POST",
                "/auth/signup",
                {
                    "name": "E2E Ride Creator",
                    "email": "creator.e2e@example.com",
                    "password": "test-password-creator",
                },
            )
            rider_status, rider_signup = rider.request(
                "POST",
                "/auth/signup",
                {
                    "name": "E2E Ride Member",
                    "email": "rider.e2e@example.com",
                    "password": "test-password-rider",
                },
            )
        self.assertEqual(creator_status, 201, creator_signup)
        self.assertEqual(rider_status, 201, rider_signup)
        self.assertEqual(len(verification_tokens), 2)
        self.assertFalse(creator.cookies)
        self.assertFalse(rider.cookies)
        for client, token in zip((creator, rider), verification_tokens):
            verify_status, verified = client.request(
                "POST",
                "/auth/verify-email",
                {"token": token},
            )
            self.assertEqual(verify_status, 200, verified)
        for client, email, password in (
            (creator, "creator.e2e@example.com", "test-password-creator"),
            (rider, "rider.e2e@example.com", "test-password-rider"),
        ):
            login_status, login = client.request(
                "POST",
                "/auth/login",
                {"email": email, "password": password},
            )
            self.assertEqual(login_status, 200, login)
            self.assertIn(self.auth.COOKIE_NAME, client.cookies)

        creator_me_status, creator_me = creator.request("GET", "/auth/me")
        rider_me_status, rider_me = rider.request("GET", "/auth/me")
        self.assertEqual(creator_me_status, 200, creator_me)
        self.assertEqual(rider_me_status, 200, rider_me)
        creator_id = creator_me["user"]["id"]
        rider_id = rider_me["user"]["id"]
        self.assertNotEqual(creator_id, rider_id)

        create_status, created = creator.request(
            "POST",
            "/team-rides",
            {
                "name": "Isolated Notification Ride",
                "origin": "Test Start",
                "destination": "Test Finish",
                "departure_at": "2099-01-01T12:00:00Z",
                "visibility": "private",
                "max_riders": 5,
            },
        )
        self.assertEqual(create_status, 201, created)
        ride = created["ride"]
        ride_id = ride["id"]
        invite_code = ride["invite_code"]
        self.assertEqual(ride["visibility"], "private")
        self.assertTrue(invite_code)

        join_status, joined = rider.request(
            "POST",
            "/team-rides/join-by-code",
            {"invite_code": invite_code},
        )
        self.assertEqual(join_status, 200, joined)
        self.assertEqual(joined["message"], "You joined the private ride.")
        self.assertEqual(joined["ride"]["id"], ride_id)

        creator_notifications_status, creator_notifications = creator.request(
            "GET", "/notifications"
        )
        rider_notifications_status, rider_notifications = rider.request(
            "GET", "/notifications"
        )
        self.assertEqual(creator_notifications_status, 200, creator_notifications)
        self.assertEqual(rider_notifications_status, 200, rider_notifications)
        self.assertEqual(creator_notifications["unread_count"], 1)
        self.assertEqual(
            len(creator_notifications["notifications"]),
            1,
            creator_notifications,
        )
        notification = creator_notifications["notifications"][0]
        self.assertEqual(notification["notification_type"], "group_join")
        self.assertEqual(notification["related_ride_id"], ride_id)
        self.assertIn("E2E Ride Member", notification["message"])
        self.assertEqual(len(rider_notifications["notifications"]), 0)

        db = sqlite3.connect(self.database_path)
        try:
            members = db.execute(
                """
                SELECT user_id FROM team_ride_members
                WHERE ride_id = ? ORDER BY user_id
                """,
                (ride_id,),
            ).fetchall()
            stored_notifications = db.execute(
                """
                SELECT user_id, notification_type, related_ride_id
                FROM notifications
                WHERE related_ride_id = ?
                """,
                (ride_id,),
            ).fetchall()
        finally:
            db.close()
        self.assertEqual(members, [(creator_id,), (rider_id,)])
        self.assertEqual(
            stored_notifications,
            [(creator_id, "group_join", ride_id)],
        )

    def test_clear_notifications_only_removes_authenticated_users_records(self):
        creator = IsolatedASGIClient(self.app)
        other_user = IsolatedASGIClient(self.app)
        anonymous = IsolatedASGIClient(self.app)

        anonymous_status, anonymous_result = anonymous.request(
            "DELETE", "/notifications"
        )
        self.assertEqual(anonymous_status, 401, anonymous_result)

        verification_tokens = []

        def send_verification(_url, *, json, **_kwargs):
            token = json["html"].split("#verify-email=")[1].split('"')[0]
            verification_tokens.append(token)
            return types.SimpleNamespace(status_code=200)

        test_users = (
            (creator, "Clear Test Creator", "clear.creator@example.com"),
            (other_user, "Clear Test Other", "clear.other@example.com"),
        )
        with patch.dict(
            "os.environ",
            {
                "RESEND_API_KEY": "re_test_placeholder",
                "ASTRA_EMAIL_FROM": "ASTRA <test@example.com>",
                "ASTRA_PUBLIC_URL": "https://astra.example.com",
            },
        ), patch.object(self.auth.requests, "post", side_effect=send_verification):
            for client, name, email in test_users:
                status, payload = client.request(
                    "POST",
                    "/auth/signup",
                    {
                        "name": name,
                        "email": email,
                        "password": "test-password",
                    },
                )
                self.assertEqual(status, 201, payload)

        self.assertEqual(len(verification_tokens), len(test_users))
        for (client, _, email), token in zip(test_users, verification_tokens):
            verify_status, verified = client.request(
                "POST",
                "/auth/verify-email",
                {"token": token},
            )
            self.assertEqual(verify_status, 200, verified)
            login_status, login = client.request(
                "POST",
                "/auth/login",
                {"email": email, "password": "test-password"},
            )
            self.assertEqual(login_status, 200, login)

        creator_me_status, creator_me = creator.request("GET", "/auth/me")
        other_me_status, other_me = other_user.request("GET", "/auth/me")
        self.assertEqual(creator_me_status, 200, creator_me)
        self.assertEqual(other_me_status, 200, other_me)
        creator_id = creator_me["user"]["id"]
        other_user_id = other_me["user"]["id"]

        with self._isolated_connect_db() as db:
            db.executemany(
                """
                INSERT INTO notifications (
                    user_id, title, message, notification_type, target_url,
                    is_read, created_at
                ) VALUES (?, ?, ?, ?, ?, 0, ?)
                """,
                [
                    (
                        creator_id,
                        "Creator notification",
                        "Owned by the caller.",
                        "general",
                        "/",
                        "2099-01-01T00:00:00+00:00",
                    ),
                    (
                        other_user_id,
                        "Other notification",
                        "Must remain private.",
                        "general",
                        "/",
                        "2099-01-01T00:00:00+00:00",
                    ),
                ],
            )

        clear_status, clear_result = creator.request("DELETE", "/notifications")
        self.assertEqual(clear_status, 200, clear_result)
        self.assertEqual(clear_result["deleted_count"], 1)

        creator_status, creator_result = creator.request("GET", "/notifications")
        other_status, other_result = other_user.request("GET", "/notifications")
        self.assertEqual(creator_status, 200, creator_result)
        self.assertEqual(other_status, 200, other_result)
        self.assertEqual(creator_result["notifications"], [])
        self.assertEqual(creator_result["unread_count"], 0)
        self.assertEqual(
            [item["title"] for item in other_result["notifications"]],
            ["Other notification"],
        )


if __name__ == "__main__":
    unittest.main()
