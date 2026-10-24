
import unittest
import os
import sqlite3
import tempfile
from pathlib import Path
from unittest.mock import Mock, patch, call, MagicMock

from psycopg.errors import ForeignKeyViolation, UniqueViolation

from backend.database import (
    PostgreSQLConnection,
    _replace_placeholders,
    connect_db,
    insert_returning_id,
    is_unique_violation,
    is_postgres,
)
from backend.database import init_postgres_schema
from backend import database

class DatabaseAdapterTests(unittest.TestCase):
    def test_replaces_parameter_placeholders(self):
        sql = "SELECT * FROM users WHERE email = ? AND id = ?"
        self.assertEqual(
            _replace_placeholders(sql),
            "SELECT * FROM users WHERE email = %s AND id = %s",
        )
    @patch.dict("os.environ", {"DATABASE_URL": "mysql://invalid"})
    def test_invalid_database_url_is_rejected(self):
        with self.assertRaisesRegex(
            RuntimeError, "PostgreSQL URL scheme"
        ):
            is_postgres()

    def test_integrity_error_classification_only_maps_unique_violations(self):
        with self.assertRaises(sqlite3.IntegrityError) as unique_error:
            with sqlite3.connect(":memory:") as db:
                db.execute("CREATE TABLE unique_test (value TEXT UNIQUE)")
                db.execute("INSERT INTO unique_test VALUES ('same')")
                db.execute("INSERT INTO unique_test VALUES ('same')")
        self.assertTrue(is_unique_violation(unique_error.exception))
        self.assertFalse(
            is_unique_violation(sqlite3.IntegrityError("FOREIGN KEY constraint failed"))
        )
        self.assertTrue(is_unique_violation(UniqueViolation("duplicate")))
        self.assertFalse(
            is_unique_violation(ForeignKeyViolation("foreign key violation"))
        )

    @patch.dict("os.environ", {}, clear=True)
    def test_missing_database_url_keeps_sqlite_mode(self):
        with patch("backend.database.database_url", return_value=""):
            self.assertFalse(is_postgres())

    def test_preserves_question_marks_in_quoted_strings(self):
        sql = "SELECT * FROM users WHERE note = '?' AND id = ?"
        self.assertEqual(
            _replace_placeholders(sql),
            "SELECT * FROM users WHERE note = '?' AND id = %s",
        )

    def test_preserves_question_marks_in_sql_comments(self):
        sql = "SELECT * FROM users -- ignore ?\nWHERE id = ?"
        self.assertEqual(
            _replace_placeholders(sql),
            "SELECT * FROM users -- ignore ?\nWHERE id = %s",
        )

    def test_postgres_connection_converts_parameters_and_maps_rows(self):
        raw_connection = MagicMock()
        raw_connection.execute.return_value.fetchone.return_value = {
            "id": 42,
            "email": "rider@example.test",
        }
        db = PostgreSQLConnection(raw_connection)

        row = db.execute(
            "SELECT id, email FROM users WHERE email = ?",
            ("rider@example.test",),
        ).fetchone()

        raw_connection.execute.assert_called_once_with(
            "SELECT id, email FROM users WHERE email = %s",
            ("rider@example.test",),
        )
        self.assertEqual(row["id"], 42)
        self.assertEqual(row[0], 42)

    def test_postgres_context_commits_on_success_and_rolls_back_on_error(self):
        successful_connection = MagicMock()
        with PostgreSQLConnection(successful_connection):
            pass
        successful_connection.commit.assert_called_once()
        successful_connection.rollback.assert_not_called()
        successful_connection.close.assert_called_once()

        failed_connection = MagicMock()
        with self.assertRaisesRegex(RuntimeError, "rollback"):
            with PostgreSQLConnection(failed_connection):
                raise RuntimeError("rollback")
        failed_connection.rollback.assert_called_once()
        failed_connection.commit.assert_not_called()
        failed_connection.close.assert_called_once()

    def test_sqlite_path_override_enables_foreign_keys_and_closes(self):
        with tempfile.TemporaryDirectory(prefix="astra-db-adapter-") as temp_dir:
            db_path = Path(temp_dir) / "isolated.sqlite3"
            with patch.dict(
                os.environ,
                {"ASTRA_SQLITE_PATH": str(db_path)},
                clear=True,
            ):
                with connect_db() as db:
                    self.assertEqual(
                        db.execute("PRAGMA foreign_keys").fetchone()[0],
                        1,
                    )
                with self.assertRaises(sqlite3.ProgrammingError):
                    db.execute("SELECT 1")
            self.assertTrue(db_path.exists())

    @patch("backend.database.is_postgres", return_value=False)
    def test_insert_returning_id_uses_sqlite_lastrowid(self, _):
        db = Mock()
        db.execute.return_value.lastrowid = 42

        result = insert_returning_id(
            db,
            "INSERT INTO users (email) VALUES (?)",
            ("rider@example.com",),
        )

        self.assertEqual(result, 42)
        db.execute.assert_called_once_with(
            "INSERT INTO users (email) VALUES (?)",
            ("rider@example.com",),
        )

    @patch("backend.database.is_postgres", return_value=True)
    def test_insert_returning_id_uses_postgres_returning(self, _):
        db = Mock()
        db.execute.return_value.fetchone.return_value = {"id": 42}

        result = insert_returning_id(
            db,
            "INSERT INTO users (email) VALUES (?)",
            ("rider@example.com",),
        )

        self.assertEqual(result, 42)
        executed_sql = db.execute.call_args.args[0]
        self.assertIn("RETURNING ID", executed_sql.upper())
    def test_postgres_schema_requires_postgres_backend(self):
        with patch("backend.database.is_postgres", return_value=False):
            with self.assertRaisesRegex(RuntimeError, "requires DATABASE_URL"):
                init_postgres_schema()

    @patch("backend.database.is_postgres", return_value=True)
    @patch("backend.database.connect_db")
    def test_postgres_schema_creates_all_required_tables_and_indexes(
        self, mock_connect_db, _mock_is_postgres
    ):

        mock_db = MagicMock()
        mock_connect_db.return_value.__enter__.return_value = mock_db
        previous_url = database._INITIALIZED_POSTGRES_SCHEMA_URL
        database._INITIALIZED_POSTGRES_SCHEMA_URL = None
        try:
            with patch(
                "backend.database.database_url",
                return_value="postgresql://unit-test/astra_test",
            ):
                init_postgres_schema()
        finally:
            database._INITIALIZED_POSTGRES_SCHEMA_URL = previous_url

        statements = [
            call.args[0]
            for call in mock_db.execute.call_args_list
        ]
        combined_sql = "\n".join(statements).lower()

        for table in (
            "users",
            "email_verification_tokens",
            "google_identities",
            "auth_sessions",
            "saved_rides",
            "notifications",
            "team_rides",
            "team_ride_members",
        ):
            self.assertIn(f"create table if not exists {table}", combined_sql)

        self.assertIn("pg_advisory_xact_lock", combined_sql)
        self.assertIn("idx_saved_rides_user_created", combined_sql)
        self.assertIn("idx_notifications_user_unread", combined_sql)
        self.assertIn("idx_team_rides_visibility", combined_sql)
        self.assertIn("idx_team_ride_members_user", combined_sql)

    @patch("backend.database.is_postgres", return_value=True)
    @patch("backend.database.connect_db")
    def test_postgres_schema_initializes_once_per_database_url(
        self, mock_connect_db, _mock_is_postgres
    ):
        mock_db = MagicMock()
        mock_connect_db.return_value.__enter__.return_value = mock_db
        previous_url = database._INITIALIZED_POSTGRES_SCHEMA_URL
        database._INITIALIZED_POSTGRES_SCHEMA_URL = None
        try:
            with patch(
                "backend.database.database_url",
                return_value="postgresql://unit-test/astra_test",
            ):
                init_postgres_schema()
                init_postgres_schema()
            mock_connect_db.assert_called_once_with()
        finally:
            database._INITIALIZED_POSTGRES_SCHEMA_URL = previous_url


if __name__ == "__main__":
    unittest.main()
