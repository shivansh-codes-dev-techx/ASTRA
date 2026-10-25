"""Shared database primitives for ASTRA.

SQLite remains the default for local development and tests.
PostgreSQL is selected only when DATABASE_URL is configured.
"""

import os
import sqlite3
import threading
from pathlib import Path
from typing import Any

import psycopg
from psycopg.rows import dict_row


DEFAULT_SQLITE_PATH = Path(__file__).resolve().parent / "astra_users.db"
_POSTGRES_SCHEMA_LOCK = threading.Lock()
_INITIALIZED_POSTGRES_SCHEMA_URL = None


class ClosingSQLiteConnection(sqlite3.Connection):
    """Close SQLite connections when their transaction context exits."""

    def __exit__(self, exception_type, exception, traceback):
        try:
            return super().__exit__(exception_type, exception, traceback)
        finally:
            self.close()


class HybridRow(dict):
    """Allow PostgreSQL rows to be accessed by column name or position."""

    def __getitem__(self, key: Any) -> Any:
        if isinstance(key, int):
            return tuple(self.values())[key]
        return super().__getitem__(key)


class PostgreSQLCursor:
    """Small compatibility wrapper for cursor results."""

    def __init__(self, cursor):
        self._cursor = cursor

    @property
    def rowcount(self):
        return self._cursor.rowcount

    def fetchone(self):
        row = self._cursor.fetchone()
        return HybridRow(row) if row is not None else None

    def fetchall(self):
        return [HybridRow(row) for row in self._cursor.fetchall()]

    def __iter__(self):
        for row in self._cursor:
            yield HybridRow(row)


class PostgreSQLConnection:
    """Adapt common SQLite-style calls to psycopg."""

    def __init__(self, connection):
        self._connection = connection

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, traceback):
        try:
            if exc_type is None:
                self._connection.commit()
            else:
                self._connection.rollback()
        finally:
            self._connection.close()
        return False

    def close(self):
        self._connection.close()

    def commit(self):
        self._connection.commit()

    def rollback(self):
        self._connection.rollback()

    def execute(self, sql, params=()):
        statement = sql.strip()

        # SQLite's BEGIN IMMEDIATE has no direct PostgreSQL equivalent.
        # Callers that need serialization must explicitly lock the relevant row.
        if statement.upper() == "BEGIN IMMEDIATE":
            statement = "BEGIN"

        statement = _replace_placeholders(statement)
        cursor = self._connection.execute(statement, params)
        return PostgreSQLCursor(cursor)


def _replace_placeholders(sql: str) -> str:
    """Replace unquoted SQLite '?' placeholders with psycopg '%s'."""
    result = []
    quote = None
    i = 0

    while i < len(sql):
        char = sql[i]

        if quote:
            result.append(char)
            if char == quote:
                if i + 1 < len(sql) and sql[i + 1] == quote:
                    result.append(sql[i + 1])
                    i += 1
                else:
                    quote = None
        elif char in ("'", '"', "`"):
            quote = char
            result.append(char)
        elif char == "-" and i + 1 < len(sql) and sql[i + 1] == "-":
            end = sql.find("\n", i)
            if end == -1:
                result.append(sql[i:])
                break
            result.append(sql[i:end + 1])
            i = end
        elif char == "?":
            result.append("%s")
        else:
            result.append(char)

        i += 1

    return "".join(result)


def database_url() -> str:
    return os.getenv("DATABASE_URL", "").strip()


def sqlite_database_path(db_path=None) -> Path:
    configured_path = os.getenv("ASTRA_SQLITE_PATH", "").strip()
    return Path(configured_path or db_path or DEFAULT_SQLITE_PATH)


def is_postgres() -> bool:
    url = database_url()

    if not url:
        return False

    if not url.startswith(("postgres://", "postgresql://")):
        raise RuntimeError(
            "DATABASE_URL must use a PostgreSQL URL scheme."
        )

    return True


def connect_db(db_path=None):
    """Connect to configured PostgreSQL or local SQLite."""
    url = database_url()

    if url:
        if not url.startswith(("postgres://", "postgresql://")):
            raise RuntimeError("DATABASE_URL must use a PostgreSQL URL scheme.")
        return PostgreSQLConnection(psycopg.connect(url, row_factory=dict_row))

    path = Path(db_path) if db_path is not None else sqlite_database_path()
    db = sqlite3.connect(path, timeout=10, factory=ClosingSQLiteConnection)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA foreign_keys = ON")
    return db


def integrity_error_types():
    """Return the integrity-error types for the active backend."""
    if is_postgres():
        return (psycopg.IntegrityError,)
    return (sqlite3.IntegrityError,)


def is_unique_violation(error: Exception) -> bool:
    """Distinguish uniqueness conflicts from other database integrity failures."""
    if isinstance(error, psycopg.IntegrityError):
        return getattr(error, "sqlstate", None) == "23505"
    if isinstance(error, sqlite3.IntegrityError):
        return str(error).startswith("UNIQUE constraint failed:")
    return False


def insert_returning_id(db, sql: str, params=(), id_column: str = "id") -> int:
    """Insert a row and return its generated ID on SQLite or PostgreSQL."""
    if not id_column.isidentifier():
        raise ValueError("Invalid ID column name.")

    if is_postgres():
        statement = sql.rstrip().rstrip(";")
        if "RETURNING" in statement.upper():
            raise ValueError("SQL already contains a RETURNING clause.")
        row = db.execute(
            f"{statement} RETURNING {id_column}", params
        ).fetchone()
        if row is None:
            raise RuntimeError("Insert did not return a generated ID.")
        return int(row[id_column])

    cursor = db.execute(sql, params)
    if cursor.lastrowid is None:
        raise RuntimeError("SQLite insert did not return a generated ID.")
    return int(cursor.lastrowid)


def _postgres_schema_statements():
    """Return base PostgreSQL tables/indexes for a fresh installation."""
    return [
        """
        CREATE TABLE IF NOT EXISTS users (
            id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
            email TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            created_at BIGINT NOT NULL,
            name TEXT,
            email_verified SMALLINT NOT NULL DEFAULT 1,
            email_verification_last_sent_at BIGINT NOT NULL DEFAULT 0
        )
        """,
        """
        CREATE TABLE IF NOT EXISTS email_verification_tokens (
            user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
            token_hash TEXT NOT NULL UNIQUE,
            expires_at BIGINT NOT NULL,
            last_sent_at BIGINT NOT NULL
        )
        """,
        """
        CREATE TABLE IF NOT EXISTS google_identities (
            google_sub TEXT PRIMARY KEY,
            user_id BIGINT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
            created_at BIGINT NOT NULL
        )
        """,
        """
        CREATE TABLE IF NOT EXISTS auth_sessions (
            session_id TEXT PRIMARY KEY,
            user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            expires_at BIGINT NOT NULL,
            revoked_at BIGINT
        )
        """,
        """
        CREATE TABLE IF NOT EXISTS saved_rides (
            id TEXT PRIMARY KEY,
            user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            created_at TEXT NOT NULL,
            ride_date TEXT,
            plan_json TEXT NOT NULL
        )
        """,
        """
        CREATE TABLE IF NOT EXISTS notifications (
            id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
            user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            title TEXT NOT NULL,
            message TEXT NOT NULL,
            notification_type TEXT NOT NULL DEFAULT 'general',
            target_url TEXT NOT NULL DEFAULT '/',
            related_ride_id BIGINT,
            is_read SMALLINT NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL
        )
        """,
        """
        CREATE TABLE IF NOT EXISTS team_rides (
            id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
            creator_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            origin TEXT NOT NULL,
            destination TEXT NOT NULL,
            departure_at TEXT NOT NULL,
            pace TEXT NOT NULL DEFAULT 'Moderate',
            meeting_point TEXT NOT NULL DEFAULT '',
            notes TEXT NOT NULL DEFAULT '',
            visibility TEXT NOT NULL CHECK (visibility IN ('public', 'private')),
            invite_code TEXT UNIQUE,
            max_riders INTEGER NOT NULL CHECK (max_riders BETWEEN 2 AND 100),
            start_latitude DOUBLE PRECISION,
            start_longitude DOUBLE PRECISION,
            created_at TEXT NOT NULL
        )
        """,
        """
        CREATE TABLE IF NOT EXISTS team_ride_members (
            ride_id BIGINT NOT NULL REFERENCES team_rides(id) ON DELETE CASCADE,
            user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            joined_at TEXT NOT NULL,
            PRIMARY KEY (ride_id, user_id)
        )
        """,
        """
        CREATE TABLE IF NOT EXISTS pending_signups (
            email TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            password_hash TEXT NOT NULL,
            created_at BIGINT NOT NULL,
            email_verification_last_sent_at BIGINT NOT NULL DEFAULT 0,
            token_hash TEXT UNIQUE,
            expires_at BIGINT,
            last_sent_at BIGINT
        )
        """,
        """
        CREATE INDEX IF NOT EXISTS idx_auth_sessions_user
        ON auth_sessions(user_id)
        """,
        """
        CREATE INDEX IF NOT EXISTS idx_saved_rides_user_created
        ON saved_rides(user_id, created_at DESC)
        """,
        """
        CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
        ON notifications(user_id, is_read, created_at)
        """,
        """
        CREATE INDEX IF NOT EXISTS idx_team_rides_visibility
        ON team_rides(visibility, created_at)
        """,
        """
        CREATE INDEX IF NOT EXISTS idx_team_ride_members_user
        ON team_ride_members(user_id)
        """,
    ]


def _postgres_additive_migrations():
    """Add known later-version columns without dropping or recreating data.

    These ALTER statements are intentionally additive. They are safe to rerun,
    but they cannot repair arbitrary type mismatches or missing primary keys.
    """
    return [
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS name TEXT",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified SMALLINT NOT NULL DEFAULT 1",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verification_last_sent_at BIGINT NOT NULL DEFAULT 0",
        "ALTER TABLE saved_rides ADD COLUMN IF NOT EXISTS ride_date TEXT",
        "ALTER TABLE notifications ADD COLUMN IF NOT EXISTS notification_type TEXT NOT NULL DEFAULT 'general'",
        "ALTER TABLE notifications ADD COLUMN IF NOT EXISTS target_url TEXT NOT NULL DEFAULT '/'",
        "ALTER TABLE notifications ADD COLUMN IF NOT EXISTS related_ride_id BIGINT",
        "ALTER TABLE notifications ADD COLUMN IF NOT EXISTS is_read SMALLINT NOT NULL DEFAULT 0",
        "ALTER TABLE team_rides ADD COLUMN IF NOT EXISTS pace TEXT NOT NULL DEFAULT 'Moderate'",
        "ALTER TABLE team_rides ADD COLUMN IF NOT EXISTS meeting_point TEXT NOT NULL DEFAULT ''",
        "ALTER TABLE team_rides ADD COLUMN IF NOT EXISTS notes TEXT NOT NULL DEFAULT ''",
        "ALTER TABLE team_rides ADD COLUMN IF NOT EXISTS invite_code TEXT",
        "ALTER TABLE team_rides ADD COLUMN IF NOT EXISTS start_latitude DOUBLE PRECISION",
        "ALTER TABLE team_rides ADD COLUMN IF NOT EXISTS start_longitude DOUBLE PRECISION",
    ]


def init_postgres_schema():
    """Create ASTRA's PostgreSQL schema and apply safe additive migrations."""
    if not is_postgres():
        raise RuntimeError(
            "PostgreSQL schema initialization requires DATABASE_URL."
        )

    global _INITIALIZED_POSTGRES_SCHEMA_URL
    url = database_url()
    with _POSTGRES_SCHEMA_LOCK:
        if _INITIALIZED_POSTGRES_SCHEMA_URL == url:
            return

        with connect_db() as db:
            db.execute(
                "SELECT pg_advisory_xact_lock(hashtext('astra_schema_init'))"
            )
            statements = _postgres_schema_statements()
            # Create tables first; index creation is delayed until additive columns
            # have been added to any existing tables.
            for statement in statements[:7]:
                db.execute(statement)
            for statement in _postgres_additive_migrations():
                db.execute(statement)
            for statement in statements[7:]:
                db.execute(statement)

            # A unique index backs invite-code lookup/uniqueness for older schemas
            # where the column was added by an additive migration.
            db.execute("""
                CREATE UNIQUE INDEX IF NOT EXISTS idx_team_rides_invite_code_unique
                ON team_rides(invite_code)
            """)
        _INITIALIZED_POSTGRES_SCHEMA_URL = url
