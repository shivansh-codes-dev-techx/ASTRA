import json

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from backend.auth import connect_db, current_user

router = APIRouter(prefix="/rides", tags=["Saved Rides"])


def init_rides_db():
    with connect_db() as db:
        db.execute("""
            CREATE TABLE IF NOT EXISTS saved_rides (
                id TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                created_at TEXT NOT NULL,
                ride_date TEXT,
                plan_json TEXT NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users(id)
                    ON DELETE CASCADE
            )
        """)


init_rides_db()


class RideInput(BaseModel):
    id: str = Field(min_length=1, max_length=100)
    name: str = Field(min_length=1, max_length=250)
    createdAt: str = Field(min_length=1, max_length=100)
    rideDate: str | None = Field(default=None, max_length=50)
    plan: dict


def serialize_ride(row):
    return {
        "id": row["id"],
        "name": row["name"],
        "createdAt": row["created_at"],
        "rideDate": row["ride_date"],
        "plan": json.loads(row["plan_json"]),
    }


@router.get("")
def list_rides(user: dict = Depends(current_user)):
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

    return {"rides": [serialize_ride(row) for row in rows]}


@router.post("", status_code=201)
def create_ride(
    ride: RideInput,
    user: dict = Depends(current_user),
):
    try:
        plan_json = json.dumps(
            ride.plan,
            separators=(",", ":"),
            allow_nan=False,
        )
    except (TypeError, ValueError) as exc:
        raise HTTPException(
            status_code=422,
            detail="Invalid route plan.",
        ) from exc

    with connect_db() as db:
        existing = db.execute(
            "SELECT user_id FROM saved_rides WHERE id = ?",
            (ride.id,),
        ).fetchone()

        if existing:
            if existing["user_id"] != user["id"]:
                raise HTTPException(
                    status_code=409,
                    detail="This ride ID already exists.",
                )

            db.execute(
                """
                UPDATE saved_rides
                SET name = ?, created_at = ?, ride_date = ?, plan_json = ?
                WHERE id = ? AND user_id = ?
                """,
                (
                    ride.name,
                    ride.createdAt,
                    ride.rideDate,
                    plan_json,
                    ride.id,
                    user["id"],
                ),
            )
        else:
            db.execute(
                """
                INSERT INTO saved_rides
                    (id, user_id, name, created_at, ride_date, plan_json)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    ride.id,
                    user["id"],
                    ride.name,
                    ride.createdAt,
                    ride.rideDate,
                    plan_json,
                ),
            )

    return {"message": "Ride saved.", "id": ride.id}


@router.delete("/{ride_id}")
def remove_ride(
    ride_id: str,
    user: dict = Depends(current_user),
):
    with connect_db() as db:
        cursor = db.execute(
            "DELETE FROM saved_rides WHERE id = ? AND user_id = ?",
            (ride_id, user["id"]),
        )

        if cursor.rowcount == 0:
            raise HTTPException(
                status_code=404,
                detail="Ride not found in your account.",
            )

    return {"message": "Ride deleted."}
