"""Run opt-in PostgreSQL integration checks against a dedicated test database."""

from __future__ import annotations

import os
import secrets
import sys
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from http.cookies import SimpleCookie
from pathlib import Path
from unittest.mock import patch

REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
if str(REPOSITORY_ROOT) not in sys.path:
    sys.path.insert(0, str(REPOSITORY_ROOT))

import psycopg
from fastapi import HTTPException, Response
from pydantic import ValidationError
from psycopg.conninfo import conninfo_to_dict
from starlette.requests import Request


WRITE_CONFIRMATION = "I_HAVE_VERIFIED_THIS_IS_NON_PRODUCTION"
STAGING_PROJECT_NAME = "ASTRA_STAGING"
CURRENT_PHASE = "configuration"


class RunnerFailure(RuntimeError):
    def __init__(self, category, message):
        super().__init__(message)
        self.category = category
        self.safe_message = message


def _failure_diagnostic(exc, phase=None):
    traceback = exc.__traceback__
    location = None
    while traceback is not None:
        frame = traceback.tb_frame
        location = (
            f"{Path(frame.f_code.co_filename).name}:"
            f"{traceback.tb_lineno} in {frame.f_code.co_name}"
        )
        traceback = traceback.tb_next

    location_suffix = f" at {location}" if location else ""
    if isinstance(exc, RunnerFailure):
        return f"{exc.category} failure: {exc.safe_message}{location_suffix}"

    category = phase or CURRENT_PHASE
    if isinstance(exc, ValidationError):
        model_name = getattr(exc, "title", None)
        if not isinstance(model_name, str) or not model_name.isidentifier():
            model = getattr(exc, "model", None)
            model_name = getattr(model, "__name__", "unknown model")
        fields = sorted(
            {
                (
                    location[0]
                    if location and isinstance(location[0], str)
                    and location[0].isidentifier()
                    else "<root>"
                )
                for location in (error.get("loc", ()) for error in exc.errors())
            }
        )
        field_list = ", ".join(fields) if fields else "unknown"
        return (
            f"{category} failure (ValidationError in {model_name}; "
            f"fields: {field_list}){location_suffix}."
        )

    if isinstance(exc, (psycopg.OperationalError, OSError, TimeoutError)):
        category = "connection/authentication"

    sqlstate = getattr(exc, "sqlstate", None)
    if isinstance(sqlstate, str) and len(sqlstate) == 5 and sqlstate.isalnum():
        return (
            f"{category} failure ({type(exc).__name__}, SQLSTATE {sqlstate})"
            f"{location_suffix}."
        )
    return f"{category} failure ({type(exc).__name__}){location_suffix}."


def _set_phase(phase):
    global CURRENT_PHASE
    CURRENT_PHASE = phase


def _validated(model, operation, **values):
    _set_phase(f"integration tests / {operation}")
    try:
        validated = model(**values)
    except ValidationError:
        raise
    _set_phase("integration tests")
    return validated


def _local_database_target():
    env_file = Path(__file__).resolve().parents[1] / ".env"
    if not env_file.exists():
        return None
    try:
        lines = env_file.read_text(encoding="utf-8").splitlines()
    except OSError as exc:
        raise RunnerFailure(
            "configuration",
            "Unable to verify the local .env database target.",
        ) from exc

    for line in lines:
        key, separator, value = line.partition("=")
        if separator and key.strip().removeprefix("export ").strip() == "DATABASE_URL":
            value = value.strip()
            if len(value) >= 2 and value[0] == value[-1] and value[0] in ("'", '"'):
                value = value[1:-1]
            try:
                return conninfo_to_dict(value)
            except Exception as exc:
                raise RunnerFailure(
                    "configuration",
                    "Unable to parse the local .env database target safely.",
                ) from exc
    return None


def _supabase_project_ref(target):
    """Extract a Supabase project reference from direct or pooler connection info."""
    hosts = target.get("host", "").split(",")
    for host in hosts:
        host = host.strip().lower()
        if host.startswith("db.") and host.endswith(".supabase.co"):
            return host[len("db.") : -len(".supabase.co")]

    username = target.get("user", "")
    if username.startswith("postgres.") and username[len("postgres.") :]:
        return username[len("postgres.") :]
    return None


def _database_target_match(first, second):
    first_project = _supabase_project_ref(first)
    second_project = _supabase_project_ref(second)
    if first_project is not None and second_project is not None:
        return (
            "Supabase project reference"
            if first_project == second_project
            else None
        )

    first_host = first.get("host", "").split(",")[0].strip().lower()
    second_host = second.get("host", "").split(",")[0].strip().lower()
    if first_host == second_host and first.get("dbname", "") == second.get("dbname", ""):
        return "exact host and database name"
    return None


def _safe_target():
    if os.getenv("ASTRA_TEST_DATABASE_PROJECT") != STAGING_PROJECT_NAME:
        raise RunnerFailure(
            "configuration",
            "Set ASTRA_TEST_DATABASE_PROJECT=ASTRA_STAGING to select the verified staging project."
        )
    if os.getenv("ASTRA_RUN_POSTGRES_INTEGRATION") != "1":
        raise RunnerFailure(
            "configuration",
            "Set ASTRA_RUN_POSTGRES_INTEGRATION=1 to opt in.",
        )
    if os.getenv("ASTRA_ALLOW_POSTGRES_TEST_WRITES") != WRITE_CONFIRMATION:
        raise RunnerFailure(
            "configuration",
            "Set ASTRA_ALLOW_POSTGRES_TEST_WRITES to the documented confirmation value."
        )

    url = os.getenv("ASTRA_TEST_DATABASE_URL", "").strip()
    expected_host = os.getenv("ASTRA_TEST_DATABASE_HOST", "").strip()
    expected_name = os.getenv("ASTRA_TEST_DATABASE_NAME", "").strip()
    expected_project_ref = os.getenv("ASTRA_TEST_DATABASE_PROJECT_REF", "").strip()
    if not url or not expected_host or not expected_name or not expected_project_ref:
        raise RunnerFailure(
            "configuration",
            "ASTRA_TEST_DATABASE_URL, ASTRA_TEST_DATABASE_HOST, "
            "ASTRA_TEST_DATABASE_NAME, and ASTRA_TEST_DATABASE_PROJECT_REF are required."
        )

    try:
        target = conninfo_to_dict(url)
    except Exception as exc:
        raise RunnerFailure(
            "configuration",
            "ASTRA_TEST_DATABASE_URL is malformed or incomplete.",
        ) from exc
    host = target.get("host", "").split(",")[0].strip()
    database_name = target.get("dbname", "")
    project_ref = _supabase_project_ref(target)
    if project_ref is None or project_ref != expected_project_ref:
        raise RunnerFailure(
            "target validation",
            "The PostgreSQL URL does not match the explicitly confirmed Supabase project reference."
        )
    if host.lower() != expected_host.lower() or database_name != expected_name:
        raise RunnerFailure(
            "target validation",
            "The PostgreSQL URL does not match the explicitly confirmed host and database name."
        )
    configured_url = os.getenv("DATABASE_URL", "").strip()
    if configured_url:
        try:
            configured = conninfo_to_dict(configured_url)
        except Exception as exc:
            raise RunnerFailure(
                "configuration",
                "DATABASE_URL is malformed; refusing to bypass the production-target safety check.",
            ) from exc
        match = _database_target_match(configured, target)
        if match:
            raise RunnerFailure(
                "target validation",
                f"Refusing to use the same target as DATABASE_URL (matched by {match})."
            )

    local_target = _local_database_target()
    match = (
        _database_target_match(local_target, target)
        if local_target
        else None
    )
    if match:
        raise RunnerFailure(
            "target validation",
            f"Refusing to use the same target configured in local .env (matched by {match})."
        )

    return url, host, database_name


def _request(*, user=None, origin=None, cookie=None):
    headers = []
    if origin:
        headers.append((b"origin", origin.encode("ascii")))
    if cookie:
        headers.append((b"cookie", cookie.encode("ascii")))
    scope = {
        "type": "http",
        "asgi": {"version": "3.0", "spec_version": "2.3"},
        "http_version": "1.1",
        "method": "POST",
        "scheme": "https",
        "path": "/",
        "raw_path": b"/",
        "query_string": b"",
        "root_path": "",
        "headers": headers,
        "client": ("127.0.0.1", 12345),
        "server": ("testserver", 443),
    }
    if user is not None:
        scope["test_user"] = user
    return Request(scope)


def _assert(condition, message):
    if not condition:
        raise AssertionError(message)


def _test_emails(run_id):
    return {
        f"{purpose}-{run_id}@example.com"
        for purpose in (
            "signup",
            "resend",
            "expired",
            "google",
            "owner",
            "rider-a",
            "rider-b",
            "rollback",
        )
    }


def _assert_test_emails_absent(db, emails):
    rows = db.execute(
        "SELECT email FROM users WHERE email = ANY(%s)",
        (list(emails),),
    ).fetchall()
    if rows:
        raise RuntimeError(
            "A generated PostgreSQL integration-test email already exists; "
            "aborting before test writes."
        )


def _cleanup_test_users(database, user_ids):
    failures = []
    for user_id in sorted(set(user_ids)):
        try:
            with database.connect_db() as db:
                db.execute("DELETE FROM users WHERE id = ?", (user_id,))
        except Exception as exc:
            failures.append((user_id, type(exc).__name__))
    return failures


def _create_user(database, email, name):
    with database.connect_db() as db:
        return database.insert_returning_id(
            db,
            """
            INSERT INTO users (
                name, email, password_hash, created_at, email_verified,
                email_verification_last_sent_at
            ) VALUES (?, ?, ?, ?, 1, 0)
            """,
            (name, email, "integration-test", int(time.time())),
        )


def run():
    _set_phase("configuration")
    url, expected_host, expected_name = _safe_target()
    run_id = uuid.uuid4().hex
    emails = _test_emails(run_id)
    _set_phase("connection/authentication")
    with psycopg.connect(url) as connection:
        target_name = connection.execute("SELECT current_database()").fetchone()[0]
        actual_host = connection.info.host
    if target_name != expected_name:
        raise RunnerFailure(
            "target validation",
            "Connected PostgreSQL database name did not match the confirmed staging database.",
        )
    if actual_host.lower() != expected_host.lower():
        raise RunnerFailure(
            "target validation",
            "Connected PostgreSQL host did not match the confirmed staging host.",
        )
    _set_phase("target preflight")
    with psycopg.connect(url) as connection:
        users_table_exists = connection.execute(
            """
            SELECT EXISTS (
                SELECT 1 FROM information_schema.tables
                WHERE table_schema = current_schema() AND table_name = 'users'
            )
            """
        ).fetchone()[0]
        if users_table_exists:
            _assert_test_emails_absent(connection, emails)

    os.environ["DATABASE_URL"] = url
    os.environ["ASTRA_AUTH_SECRET"] = secrets.token_urlsafe(48)
    os.environ["ASTRA_PUBLIC_URL"] = "https://astra-test.invalid"
    os.environ["ASTRA_COOKIE_SECURE"] = "true"
    os.environ["RESEND_API_KEY"] = "integration-test-placeholder"
    os.environ["ASTRA_EMAIL_FROM"] = "ASTRA <test@example.invalid>"

    _set_phase("schema initialization")
    from backend import auth, database, notifications, saved_rides, team_rides

    database.init_postgres_schema()
    with database.connect_db() as db:
        _assert_test_emails_absent(db, emails)
        table_rows = db.execute(
            """
            SELECT table_name FROM information_schema.tables
            WHERE table_schema = current_schema()
            """
        ).fetchall()
    tables = {row["table_name"] for row in table_rows}
    expected_tables = {
        "users",
        "email_verification_tokens",
        "google_identities",
        "team_rides",
        "team_ride_members",
        "saved_rides",
        "notifications",
    }
    if not expected_tables <= tables:
        raise RunnerFailure(
            "schema initialization",
            "One or more required ASTRA PostgreSQL tables are missing after initialization.",
        )

    created_user_ids = []
    try:
        _set_phase("integration tests")
        with database.connect_db() as db:
            db.execute("SELECT 1")
        _assert(True, "PostgreSQL adapter connection succeeded.")

        rollback_email = f"rollback-{run_id}@example.com"
        try:
            with database.connect_db() as db:
                database.insert_returning_id(
                    db,
                    """
                    INSERT INTO users (
                        name, email, password_hash, created_at, email_verified,
                        email_verification_last_sent_at
                    ) VALUES (?, ?, ?, ?, 1, 0)
                    """,
                    (
                        "Rollback Rider",
                        rollback_email,
                        "integration-test",
                        int(time.time()),
                    ),
                )
                raise RuntimeError("force transaction rollback")
        except RuntimeError as exc:
            if str(exc) != "force transaction rollback":
                raise
        with database.connect_db() as db:
            count = db.execute(
                "SELECT COUNT(*) FROM users WHERE email = ?",
                (rollback_email,),
            ).fetchone()[0]
        _assert(count == 0, "Failed transaction left its user row behind.")

        signup_email = f"signup-{run_id}@example.com"
        tokens = []
        with patch_send(auth, tokens):
            created = auth.signup(
                _validated(auth.SignupInput, "signup input",
                    name="Postgres Rider",
                    email=signup_email,
                    password="test-password-123",
                )
            )
            user_id = created["user"]["id"]
            created_user_ids.append(user_id)
        _assert(created["verification_pending"], "Signup did not return pending verification.")

        try:
            auth.signup(
                _validated(auth.SignupInput, "duplicate signup input",
                    name="Duplicate Rider",
                    email=signup_email,
                    password="test-password-123",
                )
            )
        except HTTPException as exc:
            _assert(exc.status_code == 409, "Duplicate email was not rejected as a conflict.")
        else:
            raise AssertionError("Duplicate email was accepted.")

        token = tokens[-1]
        auth.verify_email(
            _validated(
                auth.VerifyEmailInput,
                "signup verification token",
                token=token,
            )
        )
        try:
            auth.verify_email(
                _validated(
                    auth.VerifyEmailInput,
                    "verification token replay",
                    token=token,
                )
            )
        except HTTPException as exc:
            _assert(exc.status_code == 400, "Reused verification token returned the wrong status.")
        else:
            raise AssertionError("A verification token was accepted more than once.")

        login_response = Response()
        auth.login(
            _validated(auth.LoginInput, "login input",email=signup_email, password="test-password-123"),
            login_response,
            _request(),
        )
        cookie = SimpleCookie()
        cookie.load(login_response.headers["set-cookie"])
        session_cookie = cookie[auth.COOKIE_NAME].value
        _assert(
            cookie[auth.COOKIE_NAME]["httponly"]
            and cookie[auth.COOKIE_NAME]["secure"],
            "Session cookie did not retain secure HttpOnly settings.",
        )
        current = auth.me(_request(cookie=f"{auth.COOKIE_NAME}={session_cookie}"))
        _assert(current["user"]["id"] == user_id, "PostgreSQL session lookup failed.")

        resend_email = f"resend-{run_id}@example.com"
        resend_tokens = []
        with patch_send(auth, resend_tokens):
            resend_signup = auth.signup(
                _validated(auth.SignupInput, "resend signup input",
                    name="Resend Rider",
                    email=resend_email,
                    password="test-password-123",
                )
            )
            created_user_ids.append(resend_signup["user"]["id"])
        with database.connect_db() as db:
            db.execute(
                "UPDATE users SET email_verification_last_sent_at = 0 WHERE email = ?",
                (resend_email,),
            )
        resend_calls = []
        resend_lock = threading.Lock()

        def capture_resend(email, token):
            with resend_lock:
                resend_calls.append((email, token))

        _set_phase("integration tests / concurrent verification resend")
        with patch.object(auth, "_send_verification_email", side_effect=capture_resend):
            with ThreadPoolExecutor(max_workers=2) as executor:
                results = list(executor.map(
                    lambda _: auth.resend_verification(
                        _validated(
                            auth.EmailInput,
                            "resend email input",
                            email=resend_email,
                        )
                    ),
                    range(2),
                ))
        _assert(len(results) == 2, "Concurrent resend requests did not finish.")
        _assert(len(resend_calls) == 1, "Concurrent resend bypassed the cooldown.")
        _assert(
            resend_calls[0][0] == resend_email,
            "Resend provider received an unexpected email address.",
        )
        _assert(len(resend_tokens) == 1, "Signup token capture was not deterministic.")
        replacement_token = resend_calls[0][1]
        with database.connect_db() as db:
            stored_token_hash = db.execute(
                """
                SELECT token_hash FROM email_verification_tokens
                WHERE user_id = (SELECT id FROM users WHERE email = ?)
                """,
                (resend_email,),
            ).fetchone()["token_hash"]
        _assert(
            stored_token_hash == auth.hashlib.sha256(replacement_token.encode()).hexdigest(),
            "Resend did not replace the previous verification token.",
        )
        try:
            auth.verify_email(
                _validated(
                    auth.VerifyEmailInput,
                    "replaced verification token",
                    token=resend_tokens[0],
                )
            )
        except HTTPException as exc:
            _assert(exc.status_code == 400, "Replaced verification token was not invalidated.")
        else:
            raise AssertionError("The replaced verification token was accepted.")
        auth.verify_email(
            _validated(
                auth.VerifyEmailInput,
                "replacement verification token",
                token=replacement_token,
            )
        )

        expired_email = f"expired-{run_id}@example.com"
        expired_tokens = []
        with patch_send(auth, expired_tokens):
            expired_signup = auth.signup(
                _validated(auth.SignupInput, "expired-token signup input",
                    name="Expired Rider",
                    email=expired_email,
                    password="test-password-123",
                )
            )
            created_user_ids.append(expired_signup["user"]["id"])
        with database.connect_db() as db:
            db.execute(
                """
                UPDATE email_verification_tokens
                SET expires_at = 1
                WHERE user_id = (SELECT id FROM users WHERE email = ?)
                """,
                (expired_email,),
            )
        try:
            auth.verify_email(
                _validated(
                    auth.VerifyEmailInput,
                    "expired verification token",
                    token=expired_tokens[0],
                )
            )
        except HTTPException as exc:
            _assert(exc.status_code == 400, "Expired verification token returned the wrong status.")
        else:
            raise AssertionError("An expired verification token was accepted.")

        google_email = f"google-{run_id}@example.com"
        google_claims = ("google-sub-" + run_id, google_email, "Google Rider")
        _set_phase("integration tests / Google sign-in")
        with patch.object(auth, "_verify_google_credential", return_value=google_claims):
            google_response = Response()
            google_result = auth.google_login(
                _validated(auth.GoogleLoginInput, "Google sign-in input",
                    credential="g" * 40,
                    csrf_token="c" * 24,
                ),
                _request(origin="https://astra-test.invalid"),
                google_response,
            )
            created_user_ids.append(google_result["user"]["id"])
            repeated_google_result = auth.google_login(
                _validated(auth.GoogleLoginInput, "repeated Google sign-in input",
                    credential="g" * 40,
                    csrf_token="c" * 24,
                ),
                _request(origin="https://astra-test.invalid"),
                Response(),
            )
        _assert(
            repeated_google_result["user"]["id"] == google_result["user"]["id"],
            "Repeated Google sign-in returned a different user.",
        )
        _assert(
            auth.COOKIE_NAME in google_response.headers["set-cookie"],
            "Mocked Google sign-in did not establish a session cookie.",
        )
        with database.connect_db() as db:
            google_count = db.execute(
                "SELECT COUNT(*) FROM users WHERE email = ?",
                (google_email,),
            ).fetchone()[0]
        _assert(google_count == 1, "Repeated Google sign-in duplicated the account.")
        _set_phase("integration tests / Google account-linking protection")
        with patch.object(
            auth,
            "_verify_google_credential",
            return_value=("different-sub-" + run_id, google_email, "Google Rider"),
        ):
            try:
                auth.google_login(
                    _validated(auth.GoogleLoginInput, "Google account-linking input",
                        credential="g" * 40,
                        csrf_token="c" * 24,
                    ),
                    _request(origin="https://astra-test.invalid"),
                    Response(),
                )
            except HTTPException as exc:
                _assert(exc.status_code == 409, "Google account linking was not rejected.")
            else:
                raise AssertionError("Google sign-in linked to an existing email.")

        owner_email = f"owner-{run_id}@example.com"
        rider_a_email = f"rider-a-{run_id}@example.com"
        rider_b_email = f"rider-b-{run_id}@example.com"
        owner_id = _create_user(database, owner_email, "Ride Owner")
        created_user_ids.append(owner_id)
        rider_a_id = _create_user(database, rider_a_email, "Rider A")
        created_user_ids.append(rider_a_id)
        rider_b_id = _create_user(database, rider_b_email, "Rider B")
        created_user_ids.append(rider_b_id)
        owner = {"id": owner_id, "email": owner_email, "name": "Ride Owner"}

        _set_phase("integration tests / concurrent team-ride joins")
        with patch.object(
            team_rides, "current_user", side_effect=lambda request: request.scope["test_user"]
        ):
            created_ride = team_rides.create_ride(
                _validated(team_rides.TeamRideCreate, "team-ride creation input",
                    name=f"PostgreSQL capacity test {run_id}",
                    origin="Origin",
                    destination="Destination",
                    departure_at="2026-10-23T10:00:00Z",
                    max_riders=2,
                ),
                _request(user=owner),
            )
            ride_id = created_ride["ride"]["id"]

            def attempt_join(rider_id, email, name):
                rider = {"id": rider_id, "email": email, "name": name}
                try:
                    team_rides.join_public_ride(
                        ride_id,
                        _request(user=rider),
                    )
                    return 200
                except HTTPException as exc:
                    return exc.status_code

            with ThreadPoolExecutor(max_workers=2) as executor:
                join_statuses = list(executor.map(
                    lambda args: attempt_join(*args),
                    [
                        (rider_a_id, rider_a_email, "Rider A"),
                        (rider_b_id, rider_b_email, "Rider B"),
                    ],
                ))
        _assert(
            sorted(join_statuses) == [200, 409],
            "Concurrent joins exceeded capacity or returned unexpected statuses.",
        )

        ride_data = _validated(
            saved_rides.SavedRideInput,
            "saved-ride input",
            id="saved-" + run_id,
            name=f"Saved PostgreSQL ride {run_id}",
            createdAt="2026-10-22T00:00:00Z",
            plan={"origin": "A", "destination": "B"},
        )
        _set_phase("integration tests / saved-ride ownership")
        with patch.object(
            saved_rides, "current_user", side_effect=lambda request: request.scope["test_user"]
        ):
            saved_rides.save_account_ride(ride_data, _request(user=owner))
            _assert(
                len(saved_rides.list_saved_rides(_request(user=owner))["rides"]) == 1,
                "Saved ride was not returned to its owner.",
            )
            _assert(
                saved_rides.list_saved_rides(
                    _request(user={"id": rider_a_id, "email": rider_a_email, "name": "Rider A"})
                )["rides"] == [],
                "Saved ride leaked to another user.",
            )
            try:
                saved_rides.delete_account_ride(
                    ride_data.id,
                    _request(user={"id": rider_a_id, "email": rider_a_email, "name": "Rider A"}),
                )
            except HTTPException as exc:
                _assert(exc.status_code == 404, "Another user could delete a saved ride.")
            else:
                raise AssertionError("Another user deleted a saved ride.")
            saved_rides.delete_account_ride(ride_data.id, _request(user=owner))
            _assert(
                saved_rides.list_saved_rides(_request(user=owner))["rides"] == [],
                "Saved ride deletion did not persist.",
            )

        _set_phase("integration tests / notification ownership")
        with patch.object(
            notifications,
            "current_user",
            side_effect=lambda request: request.scope["test_user"],
        ):
            owner_notifications = notifications.list_notifications(_request(user=owner))
            _assert(
                owner_notifications["unread_count"] == 1,
                "Team-join notification was not persisted for the ride owner.",
            )
            notification_id = owner_notifications["notifications"][0]["id"]
            notifications.mark_notification_read(notification_id, _request(user=owner))
            _assert(
                notifications.list_notifications(_request(user=owner))["unread_count"] == 0,
                "Notification read state did not persist.",
            )
            other_notifications = notifications.list_notifications(
                _request(user={"id": rider_a_id, "email": rider_a_email, "name": "Rider A"})
            )
            _assert(
                other_notifications["notifications"] == [],
                "Notification leaked to another user.",
            )
            cleared = notifications.clear_notifications(_request(user=owner))
            _assert(
                cleared["deleted_count"] == 1,
                "Notification deletion did not remove the owner's notification.",
            )

        print("PostgreSQL integration checks passed for the explicitly confirmed test database.")
    finally:
        test_failed = sys.exc_info()[0] is not None
        _set_phase("cleanup")
        cleanup_failures = _cleanup_test_users(database, created_user_ids)
        if test_failed:
            _set_phase("integration tests")
        if cleanup_failures:
            error_types = ", ".join(
                sorted({error_type for _, error_type in cleanup_failures})
            )
            print(
                f"Cleanup failed for {len(cleanup_failures)} test user(s); "
                f"error types: {error_types}."
            )
            if not test_failed:
                raise RunnerFailure(
                    "cleanup",
                    f"Cleanup failed for {len(cleanup_failures)} tracked test user(s); "
                    f"error types: {error_types}.",
                )


def patch_send(auth, tokens):
    return patch.object(
        auth,
        "_send_verification_email",
        side_effect=lambda _email, token: tokens.append(token),
    )


if __name__ == "__main__":
    try:
        run()
    except Exception as exc:
        print(
            f"PostgreSQL integration check failed: {_failure_diagnostic(exc)}",
            file=sys.stderr,
            flush=True,
        )
        raise SystemExit(1) from None
