from django.db import connection
from django.db.migrations.executor import MigrationExecutor

_schema_ready = False


def schema_is_current():
    """Read-only check that every migration is applied.

    Visitor requests never change the database schema. Migrations run in the
    deployment step (python manage.py migrate). If any are pending, account APIs
    fail closed with a 503 instead of changing the database mid-request.
    """
    global _schema_ready
    if _schema_ready:
        return True
    try:
        executor = MigrationExecutor(connection)
        pending = executor.migration_plan(executor.loader.graph.leaf_nodes())
    except Exception as exc:
        # Log only the exception type: never DSNs, SQL values or request data.
        print('GONE schema check failed:', type(exc).__name__)
        return False
    if pending:
        print('GONE schema check: migrations pending. Run python manage.py migrate during deployment.')
        return False
    _schema_ready = True
    return True
