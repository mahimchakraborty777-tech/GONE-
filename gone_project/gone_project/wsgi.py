import os
from django.core.wsgi import get_wsgi_application

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'gone_project.settings')

application = get_wsgi_application()

# Migrations are run during deployment (python manage.py migrate), never on a visitor's request.

# Vercel serverless functions look for `app`
app = application
