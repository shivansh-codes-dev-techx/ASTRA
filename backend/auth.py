import base64
import hashlib
import hmac
import html
import json
import logging
import os
import secrets
import time
import sqlite3
import psycopg
from pathlib import Path
from urllib.parse import urlparse
from backend import database
import requests
from fastapi import APIRouter, HTTPException, Request, Response
from fastapi.responses import JSONResponse
from pydantic import BaseModel, EmailStr, Field
router = APIRouter(prefix="/auth", tags=["Authentication"])
DB_PATH = database.sqlite_database_path(
    Path(__file__).resolve().parent / "astra_users.db"
)
TOKEN_TTL = 60 * 60 * 24 * 7
GOOGLE_CSRF_TTL = 60 * 10
EMAIL_VERIFICATION_TTL = 60 * 30
EMAIL_RESEND_COOLDOWN = 60
COOKIE_NAME = "astra_session"
GOOGLE_CSRF_COOKIE_NAME = "astra_google_csrf"
RESEND_API_URL = "https://api.resend.com/emails"
logger = logging.getLogger(__name__)

SECRET = os.getenv("ASTRA_AUTH_SECRET")
if not SECRET:
    SECRET = secrets.token_urlsafe(48)
    print("WARNING: ASTRA_AUTH_SECRET is not set; sessions will become invalid after a restart.")


class SignupInput(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class LoginInput(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class EmailInput(BaseModel):
    email: EmailStr


class VerifyEmailInput(BaseModel):
    token: str = Field(min_length=32, max_length=200)


class GoogleLoginInput(BaseModel):
    credential: str = Field(min_length=20, max_length=10000)
    csrf_token: str = Field(min_length=16, max_length=512)


class ProviderUnavailable(Exception):
    pass


def connect_db():
    return database.connect_db(DB_PATH)


def init_db():
    if database.is_postgres():
        database.init_postgres_schema()
        return

    with connect_db() as db:
        db.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                name TEXT,
                email_verified INTEGER NOT NULL DEFAULT 1,
                email_verification_last_sent_at INTEGER NOT NULL DEFAULT 0
            )
        """)
        columns = {
            row["name"] for row in db.execute("PRAGMA table_info(users)").fetchall()
        }
        if "name" not in columns:
            db.execute("ALTER TABLE users ADD COLUMN name TEXT")
        if "email_verified" not in columns:
            # Existing accounts predate verification and retain access.
            db.execute(
                "ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 1"
            )
        if "email_verification_last_sent_at" not in columns:
            db.execute(
                "ALTER TABLE users ADD COLUMN email_verification_last_sent_at INTEGER NOT NULL DEFAULT 0"
            )
        db.execute("""
            CREATE TABLE IF NOT EXISTS email_verification_tokens (
                user_id INTEGER PRIMARY KEY,
                token_hash TEXT NOT NULL UNIQUE,
                expires_at INTEGER NOT NULL,
                last_sent_at INTEGER NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        """)
        db.execute("""
            CREATE TABLE IF NOT EXISTS google_identities (
                google_sub TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL UNIQUE,
                created_at INTEGER NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        """)
        db.execute("""
            CREATE TABLE IF NOT EXISTS auth_sessions (
                session_id TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL,
                expires_at INTEGER NOT NULL,
                revoked_at INTEGER,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        """)
        db.execute("""
            CREATE INDEX IF NOT EXISTS idx_auth_sessions_user
            ON auth_sessions(user_id)
        """)


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(
        password.encode("utf-8"), salt=salt, n=2**14, r=8, p=1, dklen=32
    )
    return f"{salt.hex()}:{digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        salt_hex, digest_hex = stored.split(":", 1)
        salt = bytes.fromhex(salt_hex)
        expected = bytes.fromhex(digest_hex)
        actual = hashlib.scrypt(
            password.encode("utf-8"),
            salt=salt,
            n=2**14,
            r=8,
            p=1,
            dklen=len(expected),
        )
        return hmac.compare_digest(actual, expected)
    except (ValueError, TypeError):
        return False


def create_token(user_id: int) -> str:
    session_id = secrets.token_urlsafe(32)
    expires_at = int(time.time()) + TOKEN_TTL

    with connect_db() as db:
        db.execute(
            """
            INSERT INTO auth_sessions (session_id, user_id, expires_at, revoked_at)
            VALUES (?, ?, ?, NULL)
            """,
            (session_id, int(user_id), expires_at),
        )

    payload = {
        "sub": int(user_id),
        "exp": expires_at,
        "nonce": session_id,
    }
    body = base64.urlsafe_b64encode(
        json.dumps(payload, separators=(",", ":")).encode()
    ).decode().rstrip("=")
    signature = hmac.new(
        SECRET.encode(), body.encode(), hashlib.sha256
    ).hexdigest()
    return f"{body}.{signature}"


def _create_google_csrf_token():
    payload = {
        "exp": int(time.time()) + GOOGLE_CSRF_TTL,
        "nonce": secrets.token_urlsafe(32),
    }
    body = base64.urlsafe_b64encode(
        json.dumps(payload, separators=(",", ":")).encode()
    ).decode().rstrip("=")
    signature = hmac.new(SECRET.encode(), body.encode(), hashlib.sha256).hexdigest()
    return f"{body}.{signature}"


def _valid_google_csrf_token(cookie_token: str, submitted_token: str):
    if not cookie_token or not hmac.compare_digest(cookie_token, submitted_token):
        return False
    try:
        body, signature = cookie_token.rsplit(".", 1)
        expected = hmac.new(SECRET.encode(), body.encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(signature, expected):
            return False
        padded = body + "=" * (-len(body) % 4)
        payload = json.loads(base64.urlsafe_b64decode(padded.encode()))
        return int(payload["exp"]) > int(time.time())
    except (ValueError, KeyError, TypeError, json.JSONDecodeError):
        return False


def read_token(token: str):
    try:
        body, signature = token.rsplit(".", 1)
        expected = hmac.new(
            SECRET.encode(), body.encode(), hashlib.sha256
        ).hexdigest()
        if not hmac.compare_digest(signature, expected):
            return None

        padded = body + "=" * (-len(body) % 4)
        payload = json.loads(base64.urlsafe_b64decode(padded.encode()))
        user_id = int(payload["sub"])
        expires_at = int(payload["exp"])
        session_id = payload["nonce"]

        if expires_at <= int(time.time()):
            return None

        try:
            with connect_db() as db:
                session = db.execute(
                    """
                    SELECT user_id, expires_at, revoked_at
                    FROM auth_sessions
                    WHERE session_id = ?
                    """,
                    (session_id,),
                ).fetchone()
        except (sqlite3.Error, psycopg.Error) as exc:
            raise HTTPException(
                status_code=503,
                detail="Authentication service temporarily unavailable.",
            ) from exc

        if (
            session is None
            or int(session["user_id"]) != user_id
            or int(session["expires_at"]) <= int(time.time())
            or session["revoked_at"] is not None
        ):
            return None

        return user_id
    except (
        ValueError,
        KeyError,
        TypeError,
        json.JSONDecodeError,
    ):
        return None



def _secure_cookie_setting(request: Request):
    configured_secure = os.getenv("ASTRA_COOKIE_SECURE")
    return (
        configured_secure.lower() == "true"
        if configured_secure is not None
        else request.url.hostname not in {"localhost", "127.0.0.1", "::1"}
    )


def set_session_cookie(response: Response, user_id: int, request: Request):
    response.set_cookie(
        key=COOKIE_NAME,
        value=create_token(user_id),
        httponly=True,
        secure=_secure_cookie_setting(request),
        samesite="lax",
        max_age=TOKEN_TTL,
        path="/",
    )


def current_user(request: Request):
    token = request.cookies.get(COOKIE_NAME)
    user_id = read_token(token) if token else None
    if user_id is None:
        raise HTTPException(status_code=401, detail="Please log in.")
    try:
        with connect_db() as db:
            user = db.execute(
                "SELECT id, email, name FROM users WHERE id = ?",
                (user_id,),
            ).fetchone()
    except (sqlite3.Error, psycopg.Error) as exc:
        raise HTTPException(
            status_code=503,
            detail="Authentication service temporarily unavailable.",
        ) from exc
    if user is None:
        raise HTTPException(status_code=401, detail="Account not found.")
    return {"id": user["id"], "email": user["email"], "name": user["name"]}


def _email_configuration():
    api_key = os.getenv("SENDLIBERTY_API_KEY", "").strip()
    sender = os.getenv("SENDLIBERTY_EMAIL_FROM", "").strip()
    public_url = os.getenv("ASTRA_PUBLIC_URL", "").strip()

    missing = [
        name
        for name, value in (
            ("SENDLIBERTY_API_KEY", api_key),
            ("SENDLIBERTY_EMAIL_FROM", sender),
            ("ASTRA_PUBLIC_URL", public_url),
        )
        if not value
    ]
    if missing:
        logger.error(
            "Sendliberty verification email not configured; "
            "missing variables: %s",
            ", ".join(missing),
        )
        raise ProviderUnavailable("Email verification is not configured.")

    parsed = urlparse(public_url)
    local_http = parsed.hostname in {"localhost", "127.0.0.1", "::1"}
    if parsed.scheme != "https" and not (
        parsed.scheme == "http" and local_http
    ):
        raise ProviderUnavailable("Email verification URL must use HTTPS.")

    if (
        not parsed.netloc
        or parsed.username
        or parsed.password
        or parsed.query
        or parsed.fragment
    ):
        raise ProviderUnavailable("Email verification URL is invalid.")

    return api_key, sender, public_url.rstrip("/")


def _send_verification_email(email: str, token: str):
    api_key, sender, public_url = _email_configuration()
    verification_url = f"{public_url}/login#verify-email={token}"

    try:
        result = requests.post(
            "https://sendliberty.com/api/send",
            headers={"Authorization": f"Bearer {api_key}"},
            json={
                "from": sender,
                "to": email,
                "subject": "Verify your ASTRA account",
                "html": (
                    "<p>Verify your ASTRA email address:</p>"
                    f'<p><a href="{html.escape(verification_url, quote=True)}">'
                    "Verify email address</a></p>"
                    "<p>This link expires in 30 minutes and can only be used once.</p>"
                ),
            },
            timeout=10,
        )
    except requests.RequestException as exc:
        logger.error(
            "Sendliberty verification request failed (%s)",
            type(exc).__name__,
        )
        raise ProviderUnavailable("Verification email could not be sent.") from exc

    if not 200 <= result.status_code < 300:
        logger.error(
            "Sendliberty rejected verification email request "
            "(HTTP %s): %s | Request ID: %s",
            result.status_code,
            result.text[:1000],
            result.headers.get("X-Request-ID", "unavailable"),
        )
        raise ProviderUnavailable("Verification email could not be sent.")
    try:
        payload = result.json()
    except ValueError as exc:
        logger.error("Sendliberty returned an invalid JSON response.")
        raise ProviderUnavailable("Verification email could not be sent.") from exc

    if payload.get("success") is not True:
        logger.error("Sendliberty did not accept the verification email.")
        raise ProviderUnavailable("Verification email could not be sent.")

    logger.info(
        "Sendliberty accepted verification email request (HTTP %s)",
        result.status_code,
    )



def _new_verification_token():
    token = secrets.token_urlsafe(32)
    return token, hashlib.sha256(token.encode("utf-8")).hexdigest()


def _google_client_id():
    return os.getenv("GOOGLE_CLIENT_ID", "").strip()


def _configured_public_origin():
    public_url = os.getenv("ASTRA_PUBLIC_URL", "").strip()
    parsed = urlparse(public_url)
    local_http = parsed.hostname in {"localhost", "127.0.0.1", "::1"}
    if (
        parsed.scheme != "https"
        and not (parsed.scheme == "http" and local_http)
    ) or not parsed.netloc or parsed.username or parsed.password:
        return None
    return f"{parsed.scheme}://{parsed.netloc}"


def _verify_google_credential(credential: str):
    client_id = _google_client_id()
    if not client_id:
        raise ProviderUnavailable("Google Sign-In is not configured.")
    try:
        from google.auth.transport.requests import Request as GoogleRequest
        from google.oauth2 import id_token

        claims = id_token.verify_oauth2_token(
            credential,
            GoogleRequest(),
            audience=client_id,
        )
    except ImportError as exc:
        raise ProviderUnavailable("Google Sign-In verification is unavailable.") from exc
    except ValueError as exc:
        raise HTTPException(
            status_code=401,
            detail="Google credential is invalid or expired.",
        ) from exc
    except requests.RequestException as exc:
        raise ProviderUnavailable(
            "Google credential verification is temporarily unavailable."
        ) from exc
    except Exception as exc:
        # Google-auth transport failures must not be mistaken for a valid identity.
        if exc.__class__.__module__.startswith("google.auth"):
            raise ProviderUnavailable(
                "Google credential verification is temporarily unavailable."
            ) from exc
        raise

    email = claims.get("email")
    name = claims.get("name")
    subject = claims.get("sub")
    if (
        not isinstance(subject, str)
        or not subject
        or not isinstance(email, str)
        or not email
        or claims.get("email_verified") is not True
        or not isinstance(name, str)
        or not name.strip()
    ):
        raise HTTPException(
            status_code=401,
            detail="Google account identity is incomplete or unverified.",
        )
    return subject, email.strip().lower(), name.strip()


init_db()


@router.get("/config")
def auth_config():
    client_id = _google_client_id()
    return {
        "google_client_id": (
            client_id if client_id and _configured_public_origin() else None
        )
    }


@router.post("/signup", status_code=201)
def signup(data: SignupInput):
    email = str(data.email).strip().lower()
    name = " ".join(data.name.split())
    if len(name) < 2:
        raise HTTPException(status_code=422, detail="Please enter your full name.")

    token, token_hash = _new_verification_token()
    now = int(time.time())
    try:
        with connect_db() as db:
            db.execute("BEGIN IMMEDIATE")
            user_id = database.insert_returning_id(
                db,
                """
                INSERT INTO users (
                    name, email, password_hash, created_at, email_verified,
                    email_verification_last_sent_at
                ) VALUES (?, ?, ?, ?, 0, ?)
                """,
                (name, email, hash_password(data.password), now, now),
            )
            db.execute(
                """
                INSERT INTO email_verification_tokens
                    (user_id, token_hash, expires_at, last_sent_at)
                VALUES (?, ?, ?, ?)
                """,
                (user_id, token_hash, now + EMAIL_VERIFICATION_TTL, now),
            )
    except database.integrity_error_types() as exc:
        if not database.is_unique_violation(exc):
            raise
        raise HTTPException(
            status_code=409,
            detail="An account with this email already exists.",
        ) from exc

    try:
        _send_verification_email(email, token)
    except ProviderUnavailable as exc:
        with connect_db() as db:
            db.execute(
                """
                DELETE FROM email_verification_tokens
                WHERE user_id = ? AND token_hash = ?
                """,
                (user_id, token_hash),
            )
        raise HTTPException(
            status_code=503,
            detail="Your account was created but email verification could not be sent. Request another verification email.",
            headers={"X-ASTRA-Verification-Pending": "true"},
        ) from exc

    return {
        "message": "Account created. Check your email to verify your account before signing in.",
        "verification_pending": True,
        "email": email,
        "user": {"id": user_id, "email": email, "name": name},
    }


@router.post("/verify-email")
def verify_email(data: VerifyEmailInput):
    token_hash = hashlib.sha256(data.token.encode("utf-8")).hexdigest()
    now = int(time.time())
    with connect_db() as db:
        db.execute("BEGIN IMMEDIATE")
        row = db.execute(
            """
            SELECT user_id, expires_at FROM email_verification_tokens
            WHERE token_hash = ?
            """ + (" FOR UPDATE" if database.is_postgres() else ""),
            (token_hash,),
        ).fetchone()
        if row is None or int(row["expires_at"]) <= now:
            raise HTTPException(status_code=400, detail="Verification link is invalid or expired.")
        db.execute(
            "UPDATE users SET email_verified = 1 WHERE id = ?",
            (row["user_id"],),
        )
        db.execute(
            "DELETE FROM email_verification_tokens WHERE user_id = ?",
            (row["user_id"],),
        )
    return {"message": "Email verified. You can now sign in."}


@router.post("/resend-verification", status_code=202)
def resend_verification(data: EmailInput):
    email = str(data.email).strip().lower()
    now = int(time.time())
    with connect_db() as db:
        db.execute("BEGIN IMMEDIATE")
        user = db.execute(
            """
            SELECT id, email_verified, email_verification_last_sent_at
            FROM users WHERE email = ?
            """ + (" FOR UPDATE" if database.is_postgres() else ""),
            (email,),
        ).fetchone()
        if user is None or user["email_verified"]:
            return {
                "message": "If this address belongs to a pending account and delivery is available, a verification email will be sent. Delivery is not confirmed by this response."
            }
        if now - int(user["email_verification_last_sent_at"]) < EMAIL_RESEND_COOLDOWN:
            return {
                "message": "If this address belongs to a pending account and delivery is available, a verification email will be sent. Delivery is not confirmed by this response."
            }
        token, token_hash = _new_verification_token()
        db.execute(
            "UPDATE users SET email_verification_last_sent_at = ? WHERE id = ?",
            (now, user["id"]),
        )
        db.execute(
            """
            INSERT INTO email_verification_tokens
                (user_id, token_hash, expires_at, last_sent_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(user_id) DO UPDATE SET
                token_hash = excluded.token_hash,
                expires_at = excluded.expires_at,
                last_sent_at = excluded.last_sent_at
            """,
            (user["id"], token_hash, now + EMAIL_VERIFICATION_TTL, now),
        )

    try:
        _send_verification_email(email, token)
    except ProviderUnavailable:
        with connect_db() as db:
            db.execute(
                "DELETE FROM email_verification_tokens WHERE user_id = ? AND token_hash = ?",
                (user["id"], token_hash),
            )
    return {
        "message": "If this address belongs to a pending account and delivery is available, a verification email will be sent. Delivery is not confirmed by this response."
    }


@router.post("/login")
def login(data: LoginInput, response: Response, request: Request):
    email = str(data.email).strip().lower()
    with connect_db() as db:
        user = db.execute(
            "SELECT id, email, password_hash, name, email_verified FROM users WHERE email = ?",
            (email,),
        ).fetchone()
    if user is None or not verify_password(data.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password.")
    if not user["email_verified"]:
        raise HTTPException(
            status_code=403,
            detail="Verify your email address before signing in.",
            headers={"X-ASTRA-Verification-Required": "true"},
        )
    set_session_cookie(response, user["id"], request)
    return {
        "message": "Login successful.",
        "user": {"id": user["id"], "email": user["email"], "name": user["name"]},
    }


@router.post("/google")
def google_login(data: GoogleLoginInput, request: Request, response: Response):
    expected_origin = _configured_public_origin()
    request_origin = request.headers.get("origin", "").rstrip("/")
    if not expected_origin or request_origin != expected_origin:
        raise HTTPException(status_code=400, detail="Google sign-in request could not be validated.")

    csrf_cookie = request.cookies.get(GOOGLE_CSRF_COOKIE_NAME, "")
    if not _valid_google_csrf_token(csrf_cookie, data.csrf_token):
        raise HTTPException(status_code=400, detail="Google sign-in request could not be validated.")
    try:
        subject, email, name = _verify_google_credential(data.credential)
    except ProviderUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    now = int(time.time())
    with connect_db() as db:
        db.execute("BEGIN IMMEDIATE")
        identity = db.execute(
            """
            SELECT u.id, u.email, u.name FROM google_identities g
            JOIN users u ON u.id = g.user_id
            WHERE g.google_sub = ?
            """,
            (subject,),
        ).fetchone()
        if identity is None:
            existing_user = db.execute(
                "SELECT id FROM users WHERE email = ?", (email,)
            ).fetchone()
            if existing_user is not None:
                raise HTTPException(
                    status_code=409,
                    detail="An account with this email already exists. Sign in using that account; automatic account linking is not supported.",
                )
            try:
                user_id = database.insert_returning_id(
                    db,
                    """
                    INSERT INTO users (
                        name, email, password_hash, created_at, email_verified,
                        email_verification_last_sent_at
                    ) VALUES (?, ?, ?, ?, 1, 0)
                    """,
                    (name, email, hash_password(secrets.token_urlsafe(48)), now),
                )
                db.execute(
                    """
                    INSERT INTO google_identities (google_sub, user_id, created_at)
                    VALUES (?, ?, ?)
                    """,
                    (subject, user_id, now),
                )
            except database.integrity_error_types() as exc:
                if not database.is_unique_violation(exc):
                    raise
                raise HTTPException(
                    status_code=409,
                    detail="This Google identity could not be linked to an ASTRA account.",
                ) from exc
            identity = {"id": user_id, "email": email, "name": name}

    set_session_cookie(response, identity["id"], request)
    response.delete_cookie(
        key=GOOGLE_CSRF_COOKIE_NAME,
        httponly=True,
        secure=_secure_cookie_setting(request),
        samesite="lax",
        path="/",
    )
    return {
        "message": "Google sign-in successful.",
        "user": {
            "id": identity["id"],
            "email": identity["email"],
            "name": identity["name"],
        },
    }


@router.get("/google/csrf")
def google_csrf(response: Response, request: Request):
    token = _create_google_csrf_token()
    response.set_cookie(
        key=GOOGLE_CSRF_COOKIE_NAME,
        value=token,
        httponly=True,
        secure=_secure_cookie_setting(request),
        samesite="lax",
        max_age=GOOGLE_CSRF_TTL,
        path="/",
    )
    return {"csrf_token": token}


@router.get("/me")
def me(request: Request):
    return {"user": current_user(request)}




@router.post("/logout")
def logout(request: Request, response: Response):
    token = request.cookies.get(COOKIE_NAME)

    try:
        if token:
            try:
                body, signature = token.rsplit(".", 1)
                expected = hmac.new(
                    SECRET.encode(), body.encode(), hashlib.sha256
                ).hexdigest()

                if hmac.compare_digest(signature, expected):
                    padded = body + "=" * (-len(body) % 4)
                    payload = json.loads(
                        base64.urlsafe_b64decode(padded.encode())
                    )
                    session_id = payload.get("nonce")

                    if isinstance(session_id, str) and session_id:
                        with connect_db() as db:
                            db.execute(
                                """
                                UPDATE auth_sessions
                                SET revoked_at = ?
                                WHERE session_id = ? AND revoked_at IS NULL
                                """,
                                (int(time.time()), session_id),
                            )
            except (ValueError, TypeError, json.JSONDecodeError):
                pass
    except Exception:
        logger.exception("Logout failed while revoking session.")
        error_response = JSONResponse(
            status_code=503,
            content={"detail": "Unable to complete logout. Please try again."},
        )
        error_response.delete_cookie(
            key=COOKIE_NAME,
            path="/",
            httponly=True,
            samesite="lax",
            secure=_secure_cookie_setting(request),
        )
        return error_response
    response.delete_cookie(
        key=COOKIE_NAME,
        path="/",
        httponly=True,
        samesite="lax",
        secure=_secure_cookie_setting(request),
    )
    return {"message": "Logged out."}
