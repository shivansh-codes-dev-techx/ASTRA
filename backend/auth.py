import base64
import hashlib
import hmac
import json
import os
import secrets
import sqlite3
import time
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel, EmailStr, Field

router = APIRouter(prefix="/auth", tags=["Authentication"])
DB_PATH = Path(__file__).resolve().parent / "astra_users.db"
TOKEN_TTL = 60 * 60 * 24 * 7
COOKIE_NAME = "astra_session"

# Configure a stable, random secret in the environment for persistent sessions.
SECRET = os.getenv("ASTRA_AUTH_SECRET")
if not SECRET:
    SECRET = secrets.token_urlsafe(48)
    print("WARNING: ASTRA_AUTH_SECRET is not set; sessions will become invalid after a restart.")


class SignupInput(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class LoginInput(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


def connect_db():
    db = sqlite3.connect(DB_PATH, timeout=10)
    db.row_factory = sqlite3.Row
    return db


def init_db():
    with connect_db() as db:
        db.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                created_at INTEGER NOT NULL
            )
        """)


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode("utf-8"), salt=salt, n=2**14, r=8, p=1, dklen=32)
    return f"{salt.hex()}:{digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        salt_hex, digest_hex = stored.split(":", 1)
        salt = bytes.fromhex(salt_hex)
        expected = bytes.fromhex(digest_hex)
        actual = hashlib.scrypt(password.encode("utf-8"), salt=salt, n=2**14, r=8, p=1, dklen=len(expected))
        return hmac.compare_digest(actual, expected)
    except (ValueError, TypeError):
        return False


def create_token(user_id: int) -> str:
    payload = {"sub": int(user_id), "exp": int(time.time()) + TOKEN_TTL, "nonce": secrets.token_urlsafe(12)}
    body = base64.urlsafe_b64encode(json.dumps(payload, separators=(",", ":")).encode()).decode().rstrip("=")
    signature = hmac.new(SECRET.encode(), body.encode(), hashlib.sha256).hexdigest()
    return f"{body}.{signature}"


def read_token(token: str):
    try:
        body, signature = token.rsplit(".", 1)
        expected = hmac.new(SECRET.encode(), body.encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(signature, expected):
            return None
        padded = body + "=" * (-len(body) % 4)
        payload = json.loads(base64.urlsafe_b64decode(padded.encode()))
        if int(payload["exp"]) <= int(time.time()):
            return None
        return int(payload["sub"])
    except (ValueError, KeyError, TypeError, json.JSONDecodeError):
        return None


def set_session_cookie(response: Response, user_id: int):
    response.set_cookie(
        key=COOKIE_NAME,
        value=create_token(user_id),
        httponly=True,
        secure=os.getenv("ASTRA_COOKIE_SECURE", "false").lower() == "true",
        samesite="lax",
        max_age=TOKEN_TTL,
        path="/",
    )


def current_user(request: Request):
    token = request.cookies.get(COOKIE_NAME)
    user_id = read_token(token) if token else None
    if user_id is None:
        raise HTTPException(status_code=401, detail="Please log in.")
    with connect_db() as db:
        user = db.execute("SELECT id, email FROM users WHERE id = ?", (user_id,)).fetchone()
    if user is None:
        raise HTTPException(status_code=401, detail="Account not found.")
    return {"id": user["id"], "email": user["email"]}


init_db()


@router.post("/signup", status_code=201)
def signup(data: SignupInput, response: Response):
    email = str(data.email).strip().lower()
    try:
        with connect_db() as db:
            cursor = db.execute(
                "INSERT INTO users (email, password_hash, created_at) VALUES (?, ?, ?)",
                (email, hash_password(data.password), int(time.time())),
            )
            user_id = cursor.lastrowid
    except sqlite3.IntegrityError as exc:
        raise HTTPException(status_code=409, detail="An account with this email already exists.") from exc
    set_session_cookie(response, user_id)
    return {"message": "Account created.", "user": {"id": user_id, "email": email}}


@router.post("/login")
def login(data: LoginInput, response: Response):
    email = str(data.email).strip().lower()
    with connect_db() as db:
        user = db.execute("SELECT id, email, password_hash FROM users WHERE email = ?", (email,)).fetchone()
    if user is None or not verify_password(data.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password.")
    set_session_cookie(response, user["id"])
    return {"message": "Login successful.", "user": {"id": user["id"], "email": user["email"]}}


@router.get("/me")
def me(request: Request):
    return {"user": current_user(request)}


@router.post("/logout")
def logout(response: Response):
    response.delete_cookie(key=COOKIE_NAME, path="/", httponly=True, samesite="lax")
    return {"message": "Logged out."}
