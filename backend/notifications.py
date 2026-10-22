"""ASTRA notifications with SQLite local/test and PostgreSQL support."""
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request

from backend import database
from backend.auth import current_user

router = APIRouter(prefix="/notifications", tags=["Notifications"])
DB_PATH = database.sqlite_database_path(
    Path(__file__).resolve().parent / "astra_users.db"
)


def connect_db():
    """Use PostgreSQL when DATABASE_URL is configured; otherwise SQLite."""
    return database.connect_db(DB_PATH)


def init_db():
    """Initialize the notifications table and index for the active database."""
    if database.is_postgres():
        # The shared schema initializer creates notifications and its indexes.
        database.init_postgres_schema()
        return

    with connect_db() as db:
        db.execute("""
            CREATE TABLE IF NOT EXISTS notifications (
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
        """)
        db.execute("""
            CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
            ON notifications(user_id, is_read, created_at)
        """)


init_db()


@router.get("")
def list_notifications(request: Request, limit: int = 30):
    user = current_user(request)
    limit = max(1, min(limit, 100))

    with connect_db() as db:
        rows = db.execute("""
            SELECT id, title, message, notification_type, target_url,
                   related_ride_id, is_read, created_at
            FROM notifications
            WHERE user_id = ?
            ORDER BY created_at DESC, id DESC
            LIMIT ?
        """, (user["id"], limit)).fetchall()

        unread_count = db.execute("""
            SELECT COUNT(*) FROM notifications
            WHERE user_id = ? AND is_read = 0
        """, (user["id"],)).fetchone()[0]

    return {
        "notifications": [dict(row) for row in rows],
        "unread_count": unread_count,
    }


@router.delete("")
def clear_notifications(request: Request):
    user = current_user(request)

    with connect_db() as db:
        cursor = db.execute(
            "DELETE FROM notifications WHERE user_id = ?",
            (user["id"],),
        )

    return {
        "message": "Notifications cleared.",
        "deleted_count": cursor.rowcount,
    }


@router.post("/{notification_id}/read")
def mark_notification_read(notification_id: int, request: Request):
    user = current_user(request)

    with connect_db() as db:
        cursor = db.execute("""
            UPDATE notifications
            SET is_read = 1
            WHERE id = ? AND user_id = ?
        """, (notification_id, user["id"]))

        if cursor.rowcount == 0:
            raise HTTPException(
                status_code=404,
                detail="Notification not found."
            )

    return {"message": "Notification marked as read."}


@router.post("/read-all")
def mark_all_notifications_read(request: Request):
    user = current_user(request)

    with connect_db() as db:
        db.execute("""
            UPDATE notifications
            SET is_read = 1
            WHERE user_id = ? AND is_read = 0
        """, (user["id"],))

    return {"message": "All notifications marked as read."}
