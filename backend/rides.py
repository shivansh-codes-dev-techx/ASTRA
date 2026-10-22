"""Shared public/private team rides for ASTRA (SQLite + existing auth cookie)."""
from __future__ import annotations

import secrets
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field, validator

from backend.auth import current_user

router = APIRouter(prefix="/team-rides", tags=["Team Riding"])
DB_PATH = Path(__file__).resolve().parent / "astra_users.db"


def connect_db():
    db = sqlite3.connect(DB_PATH, timeout=10)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA foreign_keys = ON")
    return db


def init_db():
    with connect_db() as db:
        db.execute("""
            CREATE TABLE IF NOT EXISTS team_rides (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                creator_id INTEGER NOT NULL,
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
                start_latitude REAL,
                start_longitude REAL,
                created_at TEXT NOT NULL,
                FOREIGN KEY (creator_id) REFERENCES users(id) ON DELETE CASCADE
            )
        """)
        db.execute("""
            CREATE TABLE IF NOT EXISTS team_ride_members (
                ride_id INTEGER NOT NULL,
                user_id INTEGER NOT NULL,
                joined_at TEXT NOT NULL,
                PRIMARY KEY (ride_id, user_id),
                FOREIGN KEY (ride_id) REFERENCES team_rides(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        """)
        db.execute("CREATE INDEX IF NOT EXISTS idx_team_rides_visibility ON team_rides(visibility, created_at)")
        db.execute("CREATE INDEX IF NOT EXISTS idx_team_ride_members_user ON team_ride_members(user_id)")


init_db()


class TeamRideCreate(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    origin: str = Field(min_length=2, max_length=160)
    destination: str = Field(min_length=2, max_length=160)
    departure_at: str = Field(min_length=1, max_length=80)
    pace: str = Field(default="Moderate", max_length=40)
    meeting_point: str = Field(default="", max_length=200)
    notes: str = Field(default="", max_length=1000)
    visibility: Literal["public", "private"] = "public"
    max_riders: int = Field(default=10, ge=2, le=100)
    start_latitude: float | None = Field(default=None, ge=-90, le=90)
    start_longitude: float | None = Field(default=None, ge=-180, le=180)

    @validator("name", "origin", "destination")
    def trim_required(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("This field cannot be blank.")
        return value

    @validator("departure_at")
    def validate_departure(cls, value: str) -> str:
        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError as exc:
            raise ValueError("Use a valid ISO date/time for departure.") from exc
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc).isoformat()


def _ride_dict(db: sqlite3.Connection, row: sqlite3.Row, user_id: int, include_members: bool = False) -> dict:
    count = db.execute("SELECT COUNT(*) FROM team_ride_members WHERE ride_id = ?", (row["id"],)).fetchone()[0]
    is_creator = int(row["creator_id"]) == user_id
    is_member = db.execute(
        "SELECT 1 FROM team_ride_members WHERE ride_id = ? AND user_id = ?",
        (row["id"], user_id),
    ).fetchone() is not None
    result = {
        "id": row["id"], "name": row["name"], "origin": row["origin"],
        "destination": row["destination"],
        "route_display": f"{row['origin']} → {row['destination']}",
        "departure_at": row["departure_at"], "pace": row["pace"],
        "meeting_point": row["meeting_point"], "notes": row["notes"],
        "visibility": row["visibility"], "max_riders": row["max_riders"],
        "member_count": count, "vacancies": max(0, int(row["max_riders"]) - count),
        "start_latitude": row["start_latitude"], "start_longitude": row["start_longitude"],
        "created_at": row["created_at"], "is_creator": is_creator, "is_member": is_member,
        "invite_code": row["invite_code"] if is_creator else None,
    }
    if include_members:
        result["members"] = [dict(member) for member in db.execute(
            "SELECT u.id, u.email, m.joined_at FROM team_ride_members m JOIN users u ON u.id=m.user_id WHERE m.ride_id=? ORDER BY m.joined_at",
            (row["id"],),
        ).fetchall()]
    return result


def _get_ride(db: sqlite3.Connection, ride_id: int):
    row = db.execute("SELECT * FROM team_rides WHERE id = ?", (ride_id,)).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Ride group not found.")
    return row


def _ensure_private_access(db: sqlite3.Connection, row: sqlite3.Row, user_id: int):
    if row["visibility"] == "private":
        member = db.execute("SELECT 1 FROM team_ride_members WHERE ride_id=? AND user_id=?", (row["id"], user_id)).fetchone()
        if int(row["creator_id"]) != user_id and member is None:
            raise HTTPException(status_code=404, detail="Private ride group not found.")


@router.get("")
def list_public_rides(request: Request):
    user = current_user(request)
    with connect_db() as db:
        rows = db.execute("SELECT * FROM team_rides WHERE visibility='public' ORDER BY departure_at ASC, created_at DESC").fetchall()
        return {"rides": [_ride_dict(db, row, user["id"]) for row in rows]}


@router.get("/mine")
def list_my_rides(request: Request):
    user = current_user(request)
    with connect_db() as db:
        rows = db.execute("""
            SELECT DISTINCT r.* FROM team_rides r
            LEFT JOIN team_ride_members m ON m.ride_id=r.id
            WHERE r.creator_id=? OR m.user_id=?
            ORDER BY r.departure_at ASC, r.created_at DESC
        """, (user["id"], user["id"])).fetchall()
        return {"rides": [_ride_dict(db, row, user["id"], include_members=True) for row in rows]}


@router.post("", status_code=201)
def create_ride(data: TeamRideCreate, request: Request):
    user = current_user(request)
    invite_code = secrets.token_hex(4).upper() if data.visibility == "private" else None
    created_at = datetime.now(timezone.utc).isoformat()
    with connect_db() as db:
        cursor = db.execute("""
            INSERT INTO team_rides
            (creator_id,name,origin,destination,departure_at,pace,meeting_point,notes,visibility,invite_code,max_riders,start_latitude,start_longitude,created_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        """, (user["id"], data.name, data.origin, data.destination, data.departure_at, data.pace.strip(), data.meeting_point.strip(), data.notes.strip(), data.visibility, invite_code, data.max_riders, data.start_latitude, data.start_longitude, created_at))
        ride_id = cursor.lastrowid
        db.execute("INSERT INTO team_ride_members (ride_id,user_id,joined_at) VALUES (?,?,?)", (ride_id, user["id"], created_at))
        row = _get_ride(db, ride_id)
        return {"message": "Ride group created.", "ride": _ride_dict(db, row, user["id"], include_members=True)}


@router.get("/{ride_id}")
def get_ride(ride_id: int, request: Request):
    user = current_user(request)
    with connect_db() as db:
        row = _get_ride(db, ride_id)
        _ensure_private_access(db, row, user["id"])
        return {"ride": _ride_dict(db, row, user["id"], include_members=True)}


@router.post("/{ride_id}/join")
def join_public_ride(ride_id: int, request: Request):
    user = current_user(request)
    with connect_db() as db:
        db.execute("BEGIN IMMEDIATE")
        row = _get_ride(db, ride_id)
        if row["visibility"] != "public":
            raise HTTPException(status_code=403, detail="This group is private. Join using its invitation code.")
        existing = db.execute("SELECT 1 FROM team_ride_members WHERE ride_id=? AND user_id=?", (ride_id, user["id"])).fetchone()
        if existing:
            return {"message": "You are already a member of this ride.", "ride": _ride_dict(db, row, user["id"], include_members=True)}
        count = db.execute("SELECT COUNT(*) FROM team_ride_members WHERE ride_id=?", (ride_id,)).fetchone()[0]
        if count >= row["max_riders"]:
            raise HTTPException(status_code=409, detail="This ride group is full.")
        joined_at = datetime.now(timezone.utc).isoformat()
        db.execute("INSERT INTO team_ride_members (ride_id,user_id,joined_at) VALUES (?,?,?)", (ride_id, user["id"], joined_at))
        row = _get_ride(db, ride_id)
        return {"message": "You joined the public ride.", "ride": _ride_dict(db, row, user["id"], include_members=True)}


@router.post("/{ride_id}/leave")
def leave_ride(ride_id: int, request: Request):
    user = current_user(request)
    with connect_db() as db:
        row = _get_ride(db, ride_id)
        if int(row["creator_id"]) == user["id"]:
            raise HTTPException(status_code=400, detail="The group creator cannot leave. Delete the group instead.")
        cursor = db.execute("DELETE FROM team_ride_members WHERE ride_id=? AND user_id=?", (ride_id, user["id"]))
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="You are not a member of this group.")
        return {"message": "You left the ride group."}


@router.delete("/{ride_id}")
def delete_ride(ride_id: int, request: Request):
    user = current_user(request)
    with connect_db() as db:
        row = _get_ride(db, ride_id)
        if int(row["creator_id"]) != user["id"]:
            raise HTTPException(status_code=403, detail="Only the group creator can delete this ride.")
        db.execute("DELETE FROM team_rides WHERE id=?", (ride_id,))
        return {"message": "Ride group deleted."}
