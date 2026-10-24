# ASTRA
AI-powered extreme weather and disaster management platform.

## Frontend deployment

The Vercel frontend uses a same-origin API proxy: `vercel.ts` rewrites
`/api/*` to the production Render backend, or to a separately configured
staging backend for Preview deployments, over HTTPS before applying the SPA fallback.
Set `VITE_ASTRA_API_URL=/api` in Vercel's frontend build environment.
Production builds reject missing or non-`/api` values, so browser API and
authentication requests stay on the Vercel origin. Proxy responses are marked
`no-store` to avoid caching user-specific API data.

Keep this frontend build setting separate from the backend's `ASTRA_PUBLIC_URL`,
which must be the public frontend origin used for verification links and Google
origin checks.

## Database configuration and verification

The backend uses SQLite by default. Set `ASTRA_SQLITE_PATH` to override the
default local database file. Set `DATABASE_URL` to a PostgreSQL connection URI
to enable the PostgreSQL adapter; SQLite remains used by the isolated unit
tests.

Install test dependencies and run the normal suite with:

```powershell
python -m pip install -r requirements-dev.txt
python -m pytest -q
```

The standard suite uses temporary SQLite databases and mocked external
providers. It does not verify a real PostgreSQL deployment.

### Opt-in PostgreSQL integration checks

`scripts/verify_postgres.py` exercises PostgreSQL schema setup, transaction
rollback, authentication and verification, resend cooldown concurrency, Google
identity handling with a mocked verifier, saved-ride and notification
ownership, and concurrent team-ride capacity. Email delivery is mocked. The
script generates a single unique run ID for its test email addresses, checks
all of them against `users` before schema initialization when that table
already exists, and checks again after initialization but before test-record
writes. A collision aborts without test writes. It tracks primary keys returned
by successful test-user creation and cleanup deletes only those exact IDs,
continuing through cleanup failures. Related test records are removed only by
their user foreign-key cascades. It never drops tables or truncates data;
schema setup is additive.

Run it only against the separate `ASTRA_STAGING` Supabase project after
independently verifying its project reference, host, database, and test-only
purpose. The runner requires the project confirmation label, matching Supabase
project reference, both write opt-in flags, and separately supplied expected
host/database values. It also refuses the same local `DATABASE_URL` target.
Supabase project references are compared before host/database names because
regional pooler hosts can be shared by different projects. If both project
references are available and differ, a shared pooler host and database name
are not treated as the same project; if a reference is unavailable, the runner
falls back to an exact host/database comparison.
These checks do not prove the project identity or that it is non-production.
Never point the runner at `ASTRA_DB`. To run from PowerShell without echoing
the connection URI or placing it in command history, set the target as follows
after copying the host and database name from the ASTRA_STAGING dashboard:

The runner adds the repository root to Python's import path itself, so the
backend package is importable when the script is started by file path. Always
invoke it with the repository virtual environment's interpreter as shown below;
that environment must have the runtime dependencies from `requirements.txt`.

```powershell
$env:ASTRA_TEST_DATABASE_PROJECT = "ASTRA_STAGING"
$env:ASTRA_TEST_DATABASE_PROJECT_REF = "txfwrmltqlxgxbenlcek"
$env:ASTRA_TEST_DATABASE_HOST = "aws-0-ap-northeast-1.pooler.supabase.com"
$env:ASTRA_TEST_DATABASE_NAME = "postgres"
$secret = Read-Host "Paste ASTRA_STAGING connection URI" -AsSecureString
$credential = [System.Net.NetworkCredential]::new("", $secret)
try {
    $env:ASTRA_TEST_DATABASE_URL = $credential.Password
    $env:ASTRA_RUN_POSTGRES_INTEGRATION = "1"
    $env:ASTRA_ALLOW_POSTGRES_TEST_WRITES = "I_HAVE_VERIFIED_THIS_IS_NON_PRODUCTION"
    & .venv\Scripts\python.exe scripts\verify_postgres.py 2>&1 |
        ForEach-Object { Write-Host $_ }
    $runnerExitCode = $LASTEXITCODE
    if ($runnerExitCode -ne 0) {
        throw "PostgreSQL integration runner exited with code $runnerExitCode; review the safe diagnostic above."
    }
}
finally {
    Remove-Item Env:ASTRA_TEST_DATABASE_URL -ErrorAction SilentlyContinue
    Remove-Item Env:ASTRA_TEST_DATABASE_PROJECT -ErrorAction SilentlyContinue
    Remove-Item Env:ASTRA_TEST_DATABASE_PROJECT_REF -ErrorAction SilentlyContinue
    Remove-Item Env:ASTRA_TEST_DATABASE_HOST -ErrorAction SilentlyContinue
    Remove-Item Env:ASTRA_TEST_DATABASE_NAME -ErrorAction SilentlyContinue
    Remove-Item Env:ASTRA_RUN_POSTGRES_INTEGRATION -ErrorAction SilentlyContinue
    Remove-Item Env:ASTRA_ALLOW_POSTGRES_TEST_WRITES -ErrorAction SilentlyContinue
    $secret.Dispose()
}
```

Required runner environment variables are `ASTRA_TEST_DATABASE_PROJECT`,
`ASTRA_TEST_DATABASE_PROJECT_REF`, `ASTRA_TEST_DATABASE_URL`,
`ASTRA_TEST_DATABASE_HOST`, `ASTRA_TEST_DATABASE_NAME`,
`ASTRA_RUN_POSTGRES_INTEGRATION`, and `ASTRA_ALLOW_POSTGRES_TEST_WRITES`. The
project variable must be exactly `ASTRA_STAGING`; the project reference, host,
and database name must match values in the connection URI. The two opt-in values must be `1` and
`I_HAVE_VERIFIED_THIS_IS_NON_PRODUCTION`, respectively. The host and database
name must exactly match the connection URI. The URL is entered through a
hidden secure prompt and is never printed by the runner. If the project
reference in local `.env` differs from ASTRA_STAGING, the runner can recognize
that distinction even when both URLs use the same regional pooler hostname and
database name. Do not run if a connection alias hides the project reference or
you cannot independently verify which project it targets. Verify project
reference, purpose, permissions, and data independently before enabling
writes. A concurrent external process could also create a matching email after the
preflight check; the database's unique email constraint should reject the
test insert, and a failed creation is not added to the cleanup ID list.

Runner failures report a safe category such as configuration, target
validation, connection/authentication, schema initialization, integration
tests, or cleanup. Database exception output includes only the exception class
and, when available, SQLSTATE; it never prints the exception message, URI,
credentials, or tokens. A failed run's category distinguishes the phase that
failed, while cleanup failures are separately reported by count and exception
class.

For deployment, configure the Render service's `DATABASE_URL` with the
intended PostgreSQL connection URI and a stable private `ASTRA_AUTH_SECRET`.
Verify the deployed service and backup/rollback plan separately; these local
checks do not migrate Render or prove production readiness.

## Render and Vercel deployment checklist

### Render backend configuration

The repository has no `render.yaml` or `Procfile`, so confirm the service
settings in the Render dashboard. The application import path is
`backend.main:app`; use this start command unless the service has an intentional
equivalent:

```text
uvicorn backend.main:app --host 0.0.0.0 --port $PORT
```

`requirements.txt` includes FastAPI, Uvicorn, `psycopg[binary]`, and the other
runtime imports. `pytest` is isolated in `requirements-dev.txt`; no additional
runtime dependency is identified for the PostgreSQL adapter.

Configure these variables privately in the Render service. Use actual values
from the relevant provider dashboards; do not put secrets in Git or paste
connection strings into logs or support messages.

| Variable | Requirement |
| --- | --- |
| `DATABASE_URL` | Set to the verified Supabase PostgreSQL connection URI to select PostgreSQL. Confirm the project, host, database, network mode, and backup before saving it. |
| `ASTRA_AUTH_SECRET` | Required operationally: generate a strong random secret and keep it stable across restarts and instances. Rotating it invalidates existing signed sessions. |
| `ASTRA_PUBLIC_URL` | Set to the canonical HTTPS Vercel frontend origin, with no path. It is used for verification links, Google origin checks, and the allowed CORS origin. |
| `ASTRA_COOKIE_SECURE` | Set to `true` for HTTPS production so session cookies are Secure, HttpOnly, and SameSite=Lax. |
| `RESEND_API_KEY` | Required for password-signup verification and resend email delivery. Use the production provider key privately. |
| `ASTRA_EMAIL_FROM` | Required sender identity accepted by the configured email provider. |
| `GOOGLE_CLIENT_ID` | Required only if Google sign-in is offered. Configure the matching web client to allow the exact `ASTRA_PUBLIC_URL` JavaScript origin. |
| `WEATHER_API_KEY` | Optional WeatherAPI fallback key. Open-Meteo is tried first; this key is used only if that provider fails. |

Render supplies `PORT`; do not put a literal port in the start command. Confirm
the command, environment, and Python runtime in the dashboard before deploying.
Dashboard inspection found one existing Production service named `ASTRA`,
running Node. No existing Render settings have been changed.

For staging, create a separate Render Web Service from this repository and
select branch `integration/replit-ui`. Use the build command
`pip install -r requirements.txt` and start command
`uvicorn backend.main:app --host 0.0.0.0 --port $PORT`. Set `DATABASE_URL`
privately to the ASTRA_STAGING URI, and use a unique stable staging
`ASTRA_AUTH_SECRET`. Set `ASTRA_COOKIE_SECURE=true`,
`ASTRA_PUBLIC_URL` to the staging frontend origin, and configure the Resend
credentials/sender for an owned staging mailbox. `GOOGLE_CLIENT_ID` is
optional; if enabled, authorize the exact staging frontend origin. Render
provides `PORT`; do not set a fixed port. Do not reuse production service
environment values or credentials.

### PostgreSQL target and startup behavior

When `DATABASE_URL` is configured, importing the active routers invokes the
shared PostgreSQL schema initializer. It takes a transaction-scoped advisory
lock, creates missing ASTRA tables, applies additive `IF NOT EXISTS` columns,
then creates indexes. It does not drop tables or truncate rows. This is still a
schema write at application startup: take and verify a Supabase backup before
the first Render boot against the production database.

The developer-reported `ASTRA_DB` connection and seven existing tables have
not been independently verified in this task. The operator reports that the
guarded integration runner passed against the independently confirmed
`ASTRA_STAGING` project. This does not verify production. The runner checks
host/database identity, collision addresses, and explicit opt-in, but those
checks cannot establish that a target is non-production. It applies additive
schema initialization and creates/deletes only users whose exact IDs it
recorded. Email delivery and Google credential verification are mocked by the
runner.

The normal test suite is offline: it uses temporary SQLite databases and
mocks, and does not prove real PostgreSQL compatibility. The runner's unit
tests also use mocks and do not connect to PostgreSQL.

### Vercel frontend configuration

The checked-in `vercel.ts` routes production `/api/*` requests to
`https://astra-q5qm.onrender.com` and routes Preview requests only to the
HTTPS origin configured as `ASTRA_STAGING_BACKEND_URL`. Preview builds fail
when that setting is missing, malformed, or points to production. Set
`ASTRA_STAGING_BACKEND_URL` in Vercel's **Preview** environment after the
staging Render URL exists. Set `VITE_ASTRA_API_URL=/api` for both Production
and Preview builds; do not set it to a Render URL or localhost. Keep this
frontend build variable separate from Render's `ASTRA_PUBLIC_URL`.

The frontend source rejects a missing or non-`/api` production setting. The
proxy keeps browser auth requests and cookies on the Vercel origin; verify the
canonical Vercel domain in `ASTRA_PUBLIC_URL`, `ASTRA_COOKIE_SECURE=true`, and
the Vercel rewrite in the deployed build. Preview/custom domains need matching
origin configuration if they are used for authentication.

The existing Vercel project's Preview deployments provide the isolated
staging frontend configuration: they require `ASTRA_STAGING_BACKEND_URL`, and
the `/api/*` proxy keeps auth cookies on the Vercel origin. Set the Render
staging `ASTRA_PUBLIC_URL` to the Vercel branch-preview origin
`https://astra-git-integration-replit-ui-shivansh-codes-dev-techx.vercel.app`.
Do not use a direct cross-origin frontend-to-Render API URL for auth. Keep
the existing Production Vercel environment and rewrite untouched.

### Ordered deployment and smoke checks

1. **Prepare a non-production PostgreSQL target.** Confirm its Supabase project,
   host, database name, access policy, and empty/test-only purpose independently.
   Do not use `ASTRA_DB` merely because the runner's opt-in flags are set.
2. **Run local checks.** Use the repository virtual environment, unset
   `DATABASE_URL`, run `python -m pytest -q -p no:cacheprovider`, syntax-check
   changed Python files, and run `git diff --check`.
3. **PostgreSQL integration.** The guarded runner has already passed against
   the confirmed staging target per operator report. Rerun only if the runner,
   database adapter, or schema changes. The runner does not test Render,
   Vercel, or actual email delivery.
4. **Configure a staging deployment privately.** Set the Render variables and
   start command above, use the isolated database and a stable staging auth
   secret, and set the Vercel Preview `ASTRA_STAGING_BACKEND_URL` to the verified Render
   staging origin and `VITE_ASTRA_API_URL=/api`. The Preview config refuses to
   build without a staging origin and forbids the production backend. Use an
   owned QA mailbox or a provider-supported sink for verification mail; this
   application has no built-in email sink setting. Do not use public users or
   production credentials for smoke tests.
5. **Check staging.** Request `GET /` and `GET /auth/config`; both are
   read-only, but `/` confirms process availability only, not database health.
   If Render shell access is available, a read-only database probe is:

   ```text
   python -c "import os, psycopg; c=psycopg.connect(os.environ['DATABASE_URL']); print(c.execute('SELECT 1').fetchone()[0]); c.close()"
   ```

   Then use the isolated staging account/mailbox to test signup, verification,
   login/logout, saved-ride CRUD, notifications, and team-ride creation/join.
   Use a controlled Google test identity only if Google sign-in is configured.
   Never run those write flows with an ordinary production account.
6. **Before production, verify external settings and take a backup.** In
   Render, privately verify the intended Supabase target and all required
   variables. In Vercel, verify the Production `VITE_ASTRA_API_URL=/api`,
   rewrite target, and branch/domain settings. Confirm a recent restorable
   database backup and identify the last known PostgreSQL-compatible app
   release. These steps require developer access and are not verifiable here.
7. **Deploy backend, then frontend.** Deploy the backend with the verified
   PostgreSQL configuration first; wait for startup/schema initialization and
   check Render logs for startup or database errors. Then deploy the Vercel
   frontend build. Verify the Vercel same-origin `/api` requests and browser
   cookie behavior. The Vercel production configuration targets the production
   Render service; Preview routes only to the configured staging Render service.
   Keep logs and diagnostics
   free of credentials, tokens, and full connection URIs.
8. **Monitor and roll back without deleting data.** Check Render service logs,
   the read-only probes, and Vercel deployment/function logs. If the app fails,
   roll back to a known PostgreSQL-compatible app release or pause traffic;
   do not reset the database or reverse additive schema changes. If data
   restoration is necessary, preserve the original database and restore a
   verified backup to a separate target before an explicitly reviewed switch.

Production deployment is **not yet cleared** by local checks alone. It is safe
to proceed to a staging deployment after steps 1–4 are complete. Proceed to
production only after the isolated PostgreSQL runner and staging smoke checks
pass, the production Render/Vercel settings are privately verified, and a
restorable backup plus a PostgreSQL-compatible rollback release are confirmed.
