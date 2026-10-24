import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock, Mock, patch

from pydantic import BaseModel, EmailStr, ValidationError

PROJECT_ROOT = Path(__file__).resolve().parents[1]

from scripts.verify_postgres import (
    RunnerFailure,
    _assert_test_emails_absent,
    _cleanup_test_users,
    _database_target_match,
    _failure_diagnostic,
    _safe_target,
    _test_emails,
    _validated,
    patch as runner_patch,
)


class PostgreSQLRunnerSafetyTests(unittest.TestCase):
    def test_runner_patch_is_available_at_module_scope(self):
        target = Mock(value="original")

        with runner_patch.object(target, "value", "patched"):
            self.assertEqual(target.value, "patched")

        self.assertEqual(target.value, "original")

    def test_name_error_diagnostic_includes_operation_and_safe_source_location(self):
        sensitive_message = "secret-password-token"

        def fail_with_name_error():
            raise NameError(sensitive_message)

        try:
            fail_with_name_error()
        except NameError as exc:
            diagnostic = _failure_diagnostic(
                exc,
                phase="integration tests / concurrent verification resend",
            )

        self.assertIn(
            "integration tests / concurrent verification resend failure (NameError)",
            diagnostic,
        )
        self.assertRegex(
            diagnostic,
            r"at test_verify_postgres_runner\.py:\d+ in fail_with_name_error\.$",
        )
        self.assertNotIn(sensitive_message, diagnostic)

    def test_cli_writes_safe_failure_diagnostic_to_stderr_before_nonzero_exit(self):
        environment = os.environ.copy()
        for name in (
            "DATABASE_URL",
            "ASTRA_TEST_DATABASE_URL",
            "ASTRA_TEST_DATABASE_PROJECT",
            "ASTRA_TEST_DATABASE_PROJECT_REF",
            "ASTRA_TEST_DATABASE_HOST",
            "ASTRA_TEST_DATABASE_NAME",
            "ASTRA_RUN_POSTGRES_INTEGRATION",
            "ASTRA_ALLOW_POSTGRES_TEST_WRITES",
        ):
            environment.pop(name, None)
        environment["PYTHONDONTWRITEBYTECODE"] = "1"

        result = subprocess.run(
            [
                sys.executable,
                "-B",
                str(PROJECT_ROOT / "scripts" / "verify_postgres.py"),
            ],
            cwd=PROJECT_ROOT,
            env=environment,
            capture_output=True,
            text=True,
            check=False,
        )

        self.assertEqual(result.returncode, 1)
        self.assertEqual(result.stdout, "")
        self.assertIn(
            "PostgreSQL integration check failed: configuration failure:",
            result.stderr,
        )
        self.assertIn("ASTRA_TEST_DATABASE_PROJECT=ASTRA_STAGING", result.stderr)

    def test_runner_imports_backend_when_launched_from_scripts_directory(self):
        script_path = PROJECT_ROOT / "scripts" / "verify_postgres.py"
        runner_code = """
import runpy
import sys
from pathlib import Path

root = Path(sys.argv[1]).resolve()
script = root / "scripts" / "verify_postgres.py"
sys.path = [str(script.parent)] + [
    item for item in sys.path
    if Path(item or ".").resolve() != root
]
runpy.run_path(str(script), run_name="verify_postgres_import_test")
from backend import database
assert Path(database.__file__).resolve() == root / "backend" / "database.py"
"""

        with tempfile.TemporaryDirectory(prefix="astra-runner-import-") as cwd:
            result = subprocess.run(
                [sys.executable, "-B", "-c", runner_code, str(PROJECT_ROOT)],
                cwd=cwd,
                env={**os.environ, "PYTHONDONTWRITEBYTECODE": "1"},
                capture_output=True,
                text=True,
                check=False,
            )

        self.assertEqual(
            result.returncode,
            0,
            msg=f"Runner import bootstrap failed with exit {result.returncode}.",
        )

    def test_failure_diagnostics_classify_failures_without_exception_text(self):
        secret_text = "postgresql://user:password@host.example/db"
        self.assertEqual(
            _failure_diagnostic(
                RunnerFailure("configuration", "Required opt-in is missing.")
            ),
            "configuration failure: Required opt-in is missing.",
        )
        self.assertEqual(
            _failure_diagnostic(
                RunnerFailure("target validation", "Confirmed host did not match.")
            ),
            "target validation failure: Confirmed host did not match.",
        )
        self.assertEqual(
            _failure_diagnostic(
                ValueError(secret_text),
                phase="schema initialization",
            ),
            "schema initialization failure (ValueError).",
        )
        diagnostic = _failure_diagnostic(
            RuntimeError(secret_text),
            phase="integration tests",
        )
        self.assertEqual(
            diagnostic,
            "integration tests failure (RuntimeError).",
        )
        self.assertNotIn("password", diagnostic)
        self.assertNotIn(secret_text, diagnostic)
        self.assertEqual(
            _failure_diagnostic(
                RuntimeError(secret_text),
                phase="cleanup",
            ),
            "cleanup failure (RuntimeError).",
        )

        class DatabaseError(Exception):
            sqlstate = "42P01"

        self.assertEqual(
            _failure_diagnostic(
                DatabaseError(secret_text),
                phase="schema initialization",
            ),
            "schema initialization failure (DatabaseError, SQLSTATE 42P01).",
        )

    def test_postgres_connection_error_is_classified_without_raw_message(self):
        import psycopg

        error = psycopg.OperationalError(
            "connection failed for secret postgresql://user:password@host/db"
        )
        diagnostic = _failure_diagnostic(error, phase="schema initialization")

        self.assertIn("connection/authentication failure", diagnostic)
        self.assertIn("OperationalError", diagnostic)
        self.assertNotIn("password", diagnostic)
        self.assertNotIn("postgresql://", diagnostic)

    def test_target_requires_staging_selection_and_both_write_gates(self):
        base_environment = {
            "ASTRA_TEST_DATABASE_PROJECT": "ASTRA_STAGING",
            "ASTRA_TEST_DATABASE_PROJECT_REF": "stagingref",
            "ASTRA_TEST_DATABASE_URL": (
                "postgresql://postgres:unit-test@db.stagingref.supabase.co/"
                "postgres"
            ),
            "ASTRA_TEST_DATABASE_HOST": "db.stagingref.supabase.co",
            "ASTRA_TEST_DATABASE_NAME": "postgres",
            "ASTRA_RUN_POSTGRES_INTEGRATION": "1",
            "ASTRA_ALLOW_POSTGRES_TEST_WRITES": (
                "I_HAVE_VERIFIED_THIS_IS_NON_PRODUCTION"
            ),
        }

        for variable in (
            "ASTRA_TEST_DATABASE_PROJECT",
            "ASTRA_TEST_DATABASE_PROJECT_REF",
            "ASTRA_RUN_POSTGRES_INTEGRATION",
            "ASTRA_ALLOW_POSTGRES_TEST_WRITES",
        ):
            environment = dict(base_environment)
            environment.pop(variable)
            with self.subTest(missing=variable), patch.dict(
                "os.environ", environment, clear=True
            ), patch(
                "scripts.verify_postgres._local_database_target",
                return_value=None,
            ):
                with self.assertRaises(RuntimeError):
                    _safe_target()

        wrong_project = dict(base_environment)
        wrong_project["ASTRA_TEST_DATABASE_PROJECT"] = "ASTRA_DB"
        with patch.dict("os.environ", wrong_project, clear=True):
            with self.assertRaisesRegex(RuntimeError, "ASTRA_STAGING"):
                _safe_target()

        wrong_project_ref = dict(base_environment)
        wrong_project_ref["ASTRA_TEST_DATABASE_PROJECT_REF"] = "otherref"
        with patch.dict("os.environ", wrong_project_ref, clear=True):
            with self.assertRaisesRegex(RuntimeError, "project reference"):
                _safe_target()

        with patch.dict("os.environ", base_environment, clear=True), patch(
            "scripts.verify_postgres._local_database_target",
            return_value=None,
        ):
            url, host, name = _safe_target()

        self.assertEqual(host, "db.stagingref.supabase.co")
        self.assertEqual(name, "postgres")
        self.assertTrue(url.startswith("postgresql://"))

    def test_target_rejects_the_configured_supabase_project_through_pooler_alias(self):
        environment = {
            "ASTRA_TEST_DATABASE_PROJECT": "ASTRA_STAGING",
            "ASTRA_TEST_DATABASE_PROJECT_REF": "productionref",
            "ASTRA_TEST_DATABASE_URL": (
                "postgresql://postgres.productionref:test-password@"
                "aws-0-region.pooler.supabase.com:6543/postgres"
            ),
            "ASTRA_TEST_DATABASE_HOST": "aws-0-region.pooler.supabase.com",
            "ASTRA_TEST_DATABASE_NAME": "postgres",
            "ASTRA_RUN_POSTGRES_INTEGRATION": "1",
            "ASTRA_ALLOW_POSTGRES_TEST_WRITES": (
                "I_HAVE_VERIFIED_THIS_IS_NON_PRODUCTION"
            ),
        }
        production_target = {
            "host": "db.productionref.supabase.co",
            "user": "postgres",
            "dbname": "postgres",
        }

        with patch.dict("os.environ", environment, clear=True), patch(
            "scripts.verify_postgres._local_database_target",
            return_value=production_target,
        ):
            with self.assertRaisesRegex(RuntimeError, "Supabase project"):
                _safe_target()

        environment["DATABASE_URL"] = (
            "postgresql://postgres.productionref:test-password@"
            "aws-0-region.pooler.supabase.com:6543/postgres"
        )
        with patch.dict("os.environ", environment, clear=True), patch(
            "scripts.verify_postgres._local_database_target",
            return_value=None,
        ):
            with self.assertRaisesRegex(RuntimeError, "DATABASE_URL"):
                _safe_target()

    def test_shared_pooler_host_and_database_do_not_override_distinct_project_refs(self):
        staging_target = {
            "host": "aws-0-ap-northeast-1.pooler.supabase.com",
            "user": "postgres.txfwrmltqlxgxbenlcek",
            "dbname": "postgres",
        }
        local_target = {
            "host": "aws-0-ap-northeast-1.pooler.supabase.com",
            "user": "postgres.productionref",
            "dbname": "postgres",
        }

        self.assertIsNone(_database_target_match(local_target, staging_target))

        environment = {
            "ASTRA_TEST_DATABASE_PROJECT": "ASTRA_STAGING",
            "ASTRA_TEST_DATABASE_PROJECT_REF": "txfwrmltqlxgxbenlcek",
            "ASTRA_TEST_DATABASE_URL": (
                "postgresql://postgres.txfwrmltqlxgxbenlcek:unit-test@"
                "aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres"
            ),
            "ASTRA_TEST_DATABASE_HOST": "aws-0-ap-northeast-1.pooler.supabase.com",
            "ASTRA_TEST_DATABASE_NAME": "postgres",
            "ASTRA_RUN_POSTGRES_INTEGRATION": "1",
            "ASTRA_ALLOW_POSTGRES_TEST_WRITES": (
                "I_HAVE_VERIFIED_THIS_IS_NON_PRODUCTION"
            ),
        }
        with patch.dict("os.environ", environment, clear=True), patch(
            "scripts.verify_postgres._local_database_target",
            return_value=local_target,
        ):
            _, host, database_name = _safe_target()

        self.assertEqual(host, "aws-0-ap-northeast-1.pooler.supabase.com")
        self.assertEqual(database_name, "postgres")

    def test_matching_project_reference_takes_precedence_over_different_hosts(self):
        direct_target = {
            "host": "db.txfwrmltqlxgxbenlcek.supabase.co",
            "user": "postgres",
            "dbname": "postgres",
        }
        pooler_target = {
            "host": "aws-0-ap-northeast-1.pooler.supabase.com",
            "user": "postgres.txfwrmltqlxgxbenlcek",
            "dbname": "postgres",
        }

        self.assertEqual(
            _database_target_match(direct_target, pooler_target),
            "Supabase project reference",
        )

    def test_exact_host_and_database_fallback_remains_when_project_refs_are_unavailable(self):
        target = {
            "host": "postgres.internal.example",
            "dbname": "astra_test",
        }
        equivalent = {
            "host": "POSTGRES.INTERNAL.EXAMPLE",
            "dbname": "astra_test",
        }

        self.assertEqual(
            _database_target_match(target, equivalent),
            "exact host and database name",
        )

    def test_generated_emails_share_one_run_id(self):
        run_id = "unique-run-id"
        emails = _test_emails(run_id)

        self.assertEqual(len(emails), 8)
        self.assertTrue(all(run_id in email for email in emails))
        self.assertIn(f"rollback-{run_id}@example.com", emails)

    def test_generated_emails_pass_pydantic_email_validation(self):
        class EmailInput(BaseModel):
            email: EmailStr

        for email in _test_emails("validation-run"):
            with self.subTest(email_purpose=email.split("-", 1)[0]):
                self.assertEqual(EmailInput(email=email).email, email)

    def test_validation_diagnostic_names_operation_model_and_fields_only(self):
        class CredentialsInput(BaseModel):
            email: EmailStr
            token: str

        secret_email = "private-test-data@example.invalid"
        secret_token = "private-token-value"
        with self.assertRaises(ValidationError) as raised:
            _validated(
                CredentialsInput,
                "signup input",
                email=secret_email,
                token=secret_token,
            )

        diagnostic = _failure_diagnostic(raised.exception)
        self.assertEqual(
            diagnostic,
            "integration tests / signup input failure "
            "(ValidationError in CredentialsInput; fields: email).",
        )
        self.assertNotIn(secret_email, diagnostic)
        self.assertNotIn(secret_token, diagnostic)

    def test_email_collision_aborts_before_any_non_read_query(self):
        connection = MagicMock()
        connection.execute.return_value.fetchall.return_value = [
            {"email": "signup-existing@example.invalid"}
        ]
        emails = _test_emails("collision-run")

        with self.assertRaisesRegex(RuntimeError, "email already exists"):
            _assert_test_emails_absent(connection, emails)

        connection.execute.assert_called_once()
        sql, params = connection.execute.call_args.args
        self.assertEqual(
            sql,
            "SELECT email FROM users WHERE email = ANY(%s)",
        )
        self.assertEqual(set(params[0]), emails)
        self.assertFalse(any(word in sql.upper() for word in ("INSERT", "UPDATE", "DELETE")))

    def test_no_collisions_passes_with_read_only_query(self):
        connection = MagicMock()
        connection.execute.return_value.fetchall.return_value = []

        _assert_test_emails_absent(connection, _test_emails("clear-run"))

        self.assertTrue(connection.execute.called)

    def test_cleanup_targets_exact_ids_and_continues_after_failure(self):
        class Connection:
            def __init__(self, fail_on=None):
                self.fail_on = fail_on
                self.calls = []

            def __enter__(self):
                return self

            def __exit__(self, exc_type, exc, traceback):
                return False

            def execute(self, sql, params):
                self.calls.append((sql, params))
                if params[0] == self.fail_on:
                    raise RuntimeError("simulated cleanup failure")

        connections = [Connection(), Connection(fail_on=20), Connection()]
        database = Mock()
        database.connect_db.side_effect = connections

        failures = _cleanup_test_users(database, [30, 20, 10, 10])

        self.assertEqual(failures, [(20, "RuntimeError")])
        self.assertEqual(database.connect_db.call_count, 3)
        self.assertEqual(
            [connection.calls for connection in connections],
            [
                [("DELETE FROM users WHERE id = ?", (10,))],
                [("DELETE FROM users WHERE id = ?", (20,))],
                [("DELETE FROM users WHERE id = ?", (30,))],
            ],
        )


if __name__ == "__main__":
    unittest.main()
