import json
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from backend import database
from backend.auth import current_user

router = APIRouter(prefix="/rides", tags=["Saved Rides"])
DB_PATH = database.sqlite_database_path(
    Path(__file__).resolve().parent / "astra_users.db"
)


def connect_db():
    """Use PostgreSQL when DATABASE_URL is configured, otherwise local SQLite."""
    return database.connect_db(DB_PATH)


def init_db():
    """Initialize the saved-rides schema for the configured database backend."""
    if database.is_postgres():
        # The shared initializer creates saved_rides together with the other
        # ASTRA tables and indexes. It is safe to call repeatedly.
        database.init_postgres_schema()
        return

    with connect_db() as db:
        db.execute("""
            CREATE TABLE IF NOT EXISTS saved_rides (
                id TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                created_at TEXT NOT NULL,
                ride_date TEXT,
                plan_json TEXT NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        """)
        db.execute("""
            CREATE INDEX IF NOT EXISTS idx_saved_rides_user_created
            ON saved_rides(user_id, created_at DESC)
        """)


init_db()


class SavedRideInput(BaseModel):
    id: str = Field(min_length=1, max_length=100)
    name: str = Field(min_length=1, max_length=160)
    createdAt: str = Field(min_length=1, max_length=80)
    rideDate: str | None = Field(default=None, max_length=80)
    plan: dict


@router.get("")
def list_saved_rides(request: Request):
    user = current_user(request)

    with connect_db() as db:
        rows = db.execute(
            """
            SELECT id, name, created_at, ride_date, plan_json
            FROM saved_rides
            WHERE user_id = ?
            ORDER BY created_at DESC
            """,
            (user["id"],),
        ).fetchall()

    rides = []
    for row in rows:
        try:
            plan = json.loads(row["plan_json"])
        except (TypeError, json.JSONDecodeError):
            continue

        rides.append({
            "id": row["id"],
            "name": row["name"],
            "createdAt": row["created_at"],
            "rideDate": row["ride_date"],
            "plan": plan,
        })

    return {"rides": rides}


@router.post("", status_code=201)
def save_account_ride(data: SavedRideInput, request: Request):
    user = current_user(request)
    name = data.name.strip()

    if not name:
        raise HTTPException(status_code=422, detail="Ride name cannot be blank.")

    created_at = data.createdAt.strip() or datetime.now(timezone.utc).isoformat()
    plan_json = json.dumps(data.plan, separators=(",", ":"), allow_nan=False)

    with connect_db() as db:
        existing = db.execute(
            "SELECT user_id FROM saved_rides WHERE id = ?",
            (data.id,),
        ).fetchone()

        if existing is not None and existing["user_id"] != user["id"]:
            raise HTTPException(status_code=409, detail="This ride ID is already in use.")

        db.execute(
            """
            INSERT INTO saved_rides (id, user_id, name, created_at, ride_date, plan_json)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                name = excluded.name,
                created_at = excluded.created_at,
                ride_date = excluded.ride_date,
                plan_json = excluded.plan_json
            WHERE saved_rides.user_id = excluded.user_id
            """,
            (data.id, user["id"], name, created_at, data.rideDate, plan_json),
        )

    return {"message": "Ride saved.", "id": data.id}


@router.delete("/{ride_id}")
def delete_account_ride(ride_id: str, request: Request):
    user = current_user(request)

    with connect_db() as db:
        cursor = db.execute(
            "DELETE FROM saved_rides WHERE id = ? AND user_id = ?",
            (ride_id, user["id"]),
        )

        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Saved ride not found.")

    return {"message": "Ride deleted."}
