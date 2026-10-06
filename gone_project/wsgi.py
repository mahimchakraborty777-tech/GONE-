import os
from django.core.wsgi import get_wsgi_application

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'gone_project.settings')

application = get_wsgi_application()

# Auto-migrate on cold start for Vercel serverless /tmp database
try:
    from django.core.management import call_command
    from django.db import connection
    tables = connection.introspection.table_names()
    if 'tracker_entry' not in tables:
        call_command('migrate', interactive=False)
except Exception as e:
    print('Auto-migrate notice:', e)

# Vercel serverless functions look for `app`
app = application
