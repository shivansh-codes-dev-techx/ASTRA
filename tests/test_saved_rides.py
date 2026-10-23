import importlib.util
import shutil
import sqlite3
import sys
import tempfile
import types
import unittest
from contextlib import closing
from pathlib import Path

from fastapi import HTTPException
from starlette.requests import Request


PROJECT_ROOT = Path(__file__).resolve().parents[1]
MODULE_NAME = "isolated_saved_rides.saved_rides"


class SavedRideSchemaTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls._temporary = tempfile.TemporaryDirectory(prefix="astra-saved-rides-")
        cls._package_dir = Path(cls._temporary.name) / "isolated_saved_rides"
        cls._package_dir.mkdir()
        source = PROJECT_ROOT / "backend" / "saved_rides.py"
        isolated_source = cls._package_dir / "saved_rides.py"
        shutil.copyfile(source, isolated_source)

        auth_stub = types.ModuleType("backend.auth")
        auth_stub.current_user = lambda request: request.scope["test_user"]
        previous_auth = sys.modules.get("backend.auth")
        sys.modules["backend.auth"] = auth_stub
        try:
            spec = importlib.util.spec_from_file_location(
                MODULE_NAME,
                isolated_source,
                submodule_search_locations=[],
            )
            cls.saved_rides = importlib.util.module_from_spec(spec)
            sys.modules[MODULE_NAME] = cls.saved_rides
            spec.loader.exec_module(cls.saved_rides)
        finally:
            if previous_auth is None:
                sys.modules.pop("backend.auth", None)
            else:
                sys.modules["backend.auth"] = previous_auth

    @classmethod
    def tearDownClass(cls):
        sys.modules.pop(MODULE_NAME, None)
        cls._temporary.cleanup()

    def setUp(self):
        self.database_path = Path(self._temporary.name) / f"{self._testMethodName}.db"
        self.saved_rides.DB_PATH = self.database_path
        with closing(sqlite3.connect(self.database_path)) as db:
            db.execute("""
                CREATE TABLE users (
                    id INTEGER PRIMARY KEY,
                    email TEXT NOT NULL UNIQUE
                )
            """)
            db.execute(
                "INSERT INTO users (id, email) VALUES (?, ?)",
                (1, "rider@example.test"),
            )
            db.commit()
        self.saved_rides.init_db()

    @staticmethod
    def request(user_id=1):
        return Request({
            "type": "http",
            "test_user": {"id": user_id},
        })

    def test_schema_initialization_is_idempotent_and_preserves_saved_rides(self):
        ride = self.saved_rides.SavedRideInput(
            id="ride-1",
            name="  Morning ride  ",
            createdAt="2026-10-22T06:00:00Z",
            rideDate="2026-10-23",
            plan={"origin": "A", "destination": "B"},
        )
        self.saved_rides.save_account_ride(ride, self.request())

        self.saved_rides.init_db()
        self.saved_rides.init_db()

        result = self.saved_rides.list_saved_rides(self.request())
        self.assertEqual(
            result["rides"],
            [{
                "id": "ride-1",
                "name": "Morning ride",
                "createdAt": "2026-10-22T06:00:00Z",
                "rideDate": "2026-10-23",
                "plan": {"origin": "A", "destination": "B"},
            }],
        )

        with closing(sqlite3.connect(self.database_path)) as db:
            columns = {
                row[1] for row in db.execute("PRAGMA table_info(saved_rides)")
            }
            foreign_keys = db.execute(
                "PRAGMA foreign_key_list(saved_rides)"
            ).fetchall()
            indexes = {
                row[1] for row in db.execute("PRAGMA index_list(saved_rides)")
            }
        self.assertEqual(
            columns,
            {"id", "user_id", "name", "created_at", "ride_date", "plan_json"},
        )
        self.assertEqual(foreign_keys[0][2:4], ("users", "user_id"))
        self.assertIn("idx_saved_rides_user_created", indexes)

    def test_saved_ride_endpoints_preserve_account_ownership(self):
        ride = self.saved_rides.SavedRideInput(
            id="ride-owned",
            name="Weekend route",
            createdAt="2026-10-22T06:00:00Z",
            plan={"distanceMeters": 1200},
        )
        self.saved_rides.save_account_ride(ride, self.request())

        self.assertEqual(
            self.saved_rides.list_saved_rides(self.request(2))["rides"],
            [],
        )
        with self.assertRaises(HTTPException) as raised:
            self.saved_rides.save_account_ride(
                self.saved_rides.SavedRideInput(
                    id="ride-owned",
                    name="Changed by another account",
                    createdAt="2026-10-22T06:00:00Z",
                    plan={"distanceMeters": 9999},
                ),
                self.request(2),
            )
        self.assertEqual(raised.exception.status_code, 409)
        self.assertEqual(
            self.saved_rides.list_saved_rides(self.request())["rides"][0]["name"],
            "Weekend route",
        )

        with self.assertRaises(HTTPException) as raised:
            self.saved_rides.delete_account_ride("ride-owned", self.request(2))
        self.assertEqual(raised.exception.status_code, 404)
        self.assertEqual(
            self.saved_rides.delete_account_ride("ride-owned", self.request()),
            {"message": "Ride deleted."},
        )
        self.assertEqual(
            self.saved_rides.list_saved_rides(self.request())["rides"],
            [],
        )


if __name__ == "__main__":
    unittest.main()
