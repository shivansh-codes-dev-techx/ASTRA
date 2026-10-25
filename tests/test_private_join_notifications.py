import asyncio
import importlib.util
import json
import shutil
import sqlite3
import sys
import tempfile
import types
import unittest
from pathlib import Path

from fastapi import FastAPI
from starlette.requests import Request


PROJECT_ROOT = Path(__file__).resolve().parents[1]
JOIN_PATH = "/team-rides/join-by-code"


class ClosingSQLiteConnection(sqlite3.Connection):
    def __exit__(self, exception_type, exception, traceback):
        try:
            return super().__exit__(exception_type, exception, traceback)
        finally:
            self.close()


class PrivateJoinNotificationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls._temp_dir = tempfile.TemporaryDirectory(prefix="astra-private-join-tests-")
        cls._package_dir = Path(cls._temp_dir.name) / "isolated_backend"
        cls._package_dir.mkdir()
        (cls._package_dir / "__init__.py").write_text("", encoding="utf-8")

        # Import-time database initialization must stay inside this temporary package.
        for module_name in ("rides", "team_rides"):
            shutil.copyfile(
                PROJECT_ROOT / "backend" / f"{module_name}.py",
                cls._package_dir / f"{module_name}.py",
            )

        auth_stub = types.ModuleType("backend.auth")
        auth_stub.current_user = lambda request: request.scope["test_user"]
        previous_auth = sys.modules.get("backend.auth")
        sys.modules["backend.auth"] = auth_stub
        original_sqlite_connect = sqlite3.connect

        def connect_with_close(*args, **kwargs):
            kwargs["factory"] = ClosingSQLiteConnection
            return original_sqlite_connect(*args, **kwargs)

        sqlite3.connect = connect_with_close
        try:
            cls.rides = cls._load_module("rides")
            cls.team_rides = cls._load_module("team_rides")
        finally:
            sqlite3.connect = original_sqlite_connect
            if previous_auth is None:
                sys.modules.pop("backend.auth", None)
            else:
                sys.modules["backend.auth"] = previous_auth

        cls._original_connect_db = {
            cls.rides: cls.rides.connect_db,
            cls.team_rides: cls.team_rides.connect_db,
        }
        cls._source_paths = {
            cls.rides: PROJECT_ROOT / "backend" / "rides.py",
            cls.team_rides: PROJECT_ROOT / "backend" / "team_rides.py",
        }

    @classmethod
    def tearDownClass(cls):
        for module_name in ("isolated_backend.rides", "isolated_backend.team_rides", "isolated_backend"):
            sys.modules.pop(module_name, None)
        cls._temp_dir.cleanup()

    @classmethod
    def _load_module(cls, module_name):
        name = f"isolated_backend.{module_name}"
        spec = importlib.util.spec_from_file_location(
            name, cls._package_dir / f"{module_name}.py"
        )
        module = importlib.util.module_from_spec(spec)
        sys.modules[name] = module
        spec.loader.exec_module(module)
        return module

    def setUp(self):
        self.database_path = Path(self._temp_dir.name) / f"{self._testMethodName}.db"
        self.connect_calls = []
        self.team_rides.database.is_postgres = lambda: False
        for module in (self.rides, self.team_rides):
            module.DB_PATH = self.database_path

            def tracked_connect_db(source=self._source_paths[module], path=self.database_path):
                self.connect_calls.append(str(source.resolve()))
                connection = sqlite3.connect(
                    path,
                    timeout=10,
                    factory=ClosingSQLiteConnection,
                )
                connection.row_factory = sqlite3.Row
                connection.execute("PRAGMA foreign_keys = ON")
                return connection

            module.connect_db = tracked_connect_db

        self._initialize_database()
        self.app = FastAPI()
        self.app.include_router(self.team_rides.router)

    def tearDown(self):
        for module, original_connect_db in self._original_connect_db.items():
            module.connect_db = original_connect_db

    def _initialize_database(self):
        db = sqlite3.connect(self.database_path)
        db.execute(
            """
            CREATE TABLE users (
                id INTEGER PRIMARY KEY,
                email TEXT NOT NULL,
                name TEXT NOT NULL,
                password_hash TEXT NOT NULL DEFAULT '',
                created_at INTEGER NOT NULL DEFAULT 0
            )
            """
        )
        db.executemany(
            "INSERT INTO users (id, email, name) VALUES (?, ?, ?)",
            [
                (1, "creator@example.test", "Creator"),
                (2, "rider@example.test", "Rider"),
            ],
        )
        db.execute(
            """
            CREATE TABLE notifications (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                title TEXT NOT NULL,
                message TEXT NOT NULL,
                notification_type TEXT NOT NULL DEFAULT 'general',
                target_url TEXT NOT NULL DEFAULT '/',
                related_ride_id INTEGER,
                is_read INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
            """
        )
        db.commit()
        db.close()

        self.rides.init_db()
        self.team_rides.init_db()

        db = sqlite3.connect(self.database_path)
        db.execute(
            """
            INSERT INTO team_rides (
                id, creator_id, name, origin, destination, departure_at,
                visibility, invite_code, max_riders, created_at
            )
            VALUES (1, 1, 'Test Ride', 'Start', 'Finish',
                    '2099-01-01T00:00:00+00:00', 'private', 'VALID42', 5,
                    '2099-01-01T00:00:00+00:00')
            """
        )
        db.execute(
            """
            INSERT INTO team_ride_members (ride_id, user_id, joined_at)
            VALUES (1, 1, '2099-01-01T00:00:00+00:00')
            """
        )
        db.commit()
        db.close()
        self.connect_calls.clear()

    def _post_join(self, user_id, invite_code):
        path = JOIN_PATH
        body = json.dumps({"invite_code": invite_code}).encode("utf-8")
        incoming = [{"type": "http.request", "body": body, "more_body": False}]
        sent = []

        async def receive():
            if incoming:
                return incoming.pop(0)
            return {"type": "http.disconnect"}

        async def send(event):
            sent.append(event)

        scope = {
            "type": "http",
            "asgi": {"version": "3.0", "spec_version": "2.3"},
            "http_version": "1.1",
            "method": "POST",
            "scheme": "http",
            "path": path,
            "raw_path": path.encode("ascii"),
            "query_string": b"",
            "root_path": "",
            "headers": [(b"content-type", b"application/json")],
            "client": ("127.0.0.1", 12345),
            "server": ("127.0.0.1", 8000),
            "test_user": {
                "id": user_id,
                "name": "Creator" if user_id == 1 else "Rider",
                "email": "creator@example.test" if user_id == 1 else "rider@example.test",
            },
        }
        asyncio.run(self.app(scope, receive, send))
        status = next(event["status"] for event in sent if event["type"] == "http.response.start")
        response_body = b"".join(
            event.get("body", b"")
            for event in sent
            if event["type"] == "http.response.body"
        )
        return status, json.loads(response_body)

    def _rows(self, query, parameters=()):
        db = sqlite3.connect(self.database_path)
        rows = db.execute(query, parameters).fetchall()
        db.close()
        return rows

    def _assert_notification_route_handled(self):
        self.assertEqual(
            self.connect_calls,
            [str((PROJECT_ROOT / "backend" / "team_rides.py").resolve())],
        )

    def test_valid_join_creates_one_creator_notification(self):
        status, response = self._post_join(2, "VALID42")

        self.assertEqual(status, 200)
        self.assertEqual(response["message"], "You joined the private ride.")
        self.assertEqual(self._rows("SELECT user_id FROM team_ride_members WHERE ride_id = 1 AND user_id = 2"), [(2,)])
        self.assertEqual(
            self._rows(
                """
                SELECT user_id, notification_type, related_ride_id
                FROM notifications
                """
            ),
            [(1, "group_join", 1)],
        )
        self._assert_notification_route_handled()

    def test_joining_user_does_not_receive_creator_notification(self):
        status, _ = self._post_join(2, "VALID42")

        self.assertEqual(status, 200)
        self.assertEqual(self._rows("SELECT user_id FROM notifications"), [(1,)])
        self._assert_notification_route_handled()

    def test_rejoining_does_not_create_duplicate_notifications(self):
        first_status, _ = self._post_join(2, "VALID42")
        second_status, second_response = self._post_join(2, "VALID42")

        self.assertEqual(first_status, 200)
        self.assertEqual(second_status, 200)
        self.assertEqual(
            second_response["message"],
            "You are already a member of this private ride.",
        )
        self.assertEqual(self._rows("SELECT COUNT(*) FROM notifications"), [(1,)])
        self.assertEqual(self._rows("SELECT COUNT(*) FROM team_ride_members WHERE ride_id = 1 AND user_id = 2"), [(1,)])
        self.assertEqual(
            self.connect_calls,
            [
                str((PROJECT_ROOT / "backend" / "team_rides.py").resolve()),
                str((PROJECT_ROOT / "backend" / "team_rides.py").resolve()),
            ],
        )

    def test_invalid_invite_does_not_change_memberships_or_notifications(self):
        memberships_before = self._rows("SELECT ride_id, user_id FROM team_ride_members ORDER BY ride_id, user_id")
        notifications_before = self._rows("SELECT id, user_id, notification_type FROM notifications")

        status, response = self._post_join(2, "INVALID1")

        self.assertEqual(status, 404)
        self.assertEqual(response["detail"], "That private invitation code is invalid.")
        self.assertEqual(
            self._rows("SELECT ride_id, user_id FROM team_ride_members ORDER BY ride_id, user_id"),
            memberships_before,
        )
        self.assertEqual(
            self._rows("SELECT id, user_id, notification_type FROM notifications"),
            notifications_before,
        )
        self._assert_notification_route_handled()

    def test_creator_joining_own_ride_does_not_create_self_notification(self):
        db = sqlite3.connect(self.database_path)
        db.execute("DELETE FROM team_ride_members WHERE ride_id = 1 AND user_id = 1")
        db.commit()
        db.close()

        status, response = self._post_join(1, "VALID42")

        self.assertEqual(status, 200)
        self.assertEqual(response["ride"]["is_creator"], True)
        self.assertEqual(self._rows("SELECT user_id FROM team_ride_members WHERE ride_id = 1"), [(1,)])
        self.assertEqual(self._rows("SELECT COUNT(*) FROM notifications"), [(0,)])
        self._assert_notification_route_handled()

    def test_public_ride_member_emails_are_visible_only_to_members(self):
        db = sqlite3.connect(self.database_path)
        db.execute("UPDATE team_rides SET visibility = 'public' WHERE id = 1")
        db.execute(
            """
            INSERT INTO team_ride_members (ride_id, user_id, joined_at)
            VALUES (1, 2, '2099-01-01T00:00:00+00:00')
            """
        )
        db.commit()
        db.close()

        non_member_request = Request({
            "type": "http",
            "test_user": {
                "id": 3,
                "name": "Non-member",
                "email": "non-member@example.test",
            },
        })
        member_request = Request({
            "type": "http",
            "test_user": {
                "id": 2,
                "name": "Rider",
                "email": "rider@example.test",
            },
        })

        non_member_result = self.team_rides.get_ride(1, non_member_request)["ride"]
        member_result = self.team_rides.get_ride(1, member_request)["ride"]

        self.assertNotIn("members", non_member_result)
        self.assertIsNone(non_member_result["invite_code"])
        self.assertEqual(
            sorted(member["email"] for member in member_result["members"]),
            ["creator@example.test", "rider@example.test"],
        )

    def test_new_private_ride_codes_have_128_bits_of_entropy(self):
        request = Request({
            "type": "http",
            "test_user": {
                "id": 1,
                "name": "Creator",
                "email": "creator@example.test",
            },
        })
        data = self.team_rides.TeamRideCreate(
            name="New Private Ride",
            origin="Test Start",
            destination="Test Finish",
            departure_at="2099-01-01T12:00:00Z",
            visibility="private",
            max_riders=5,
        )

        result = self.team_rides.create_ride(data, request)
        invite_code = result["ride"]["invite_code"]

        self.assertRegex(invite_code, r"^[0-9A-F]{32}$")
        self.assertEqual(
            self.team_rides.JoinByCodeInput(invite_code=invite_code).invite_code,
            invite_code,
        )


if __name__ == "__main__":
    unittest.main()
