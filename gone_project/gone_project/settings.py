import os
from pathlib import Path

from django.core.exceptions import ImproperlyConfigured

BASE_DIR = Path(__file__).resolve().parent.parent
ON_VERCEL = bool(os.environ.get('VERCEL'))
DATABASE_URL = os.environ.get('DATABASE_URL', '').strip()
SECRET_KEY_ENV = os.environ.get('SECRET_KEY', '').strip()
SECRET_KEY_CONFIGURED = bool(SECRET_KEY_ENV)
PERSISTENT_DATABASE_CONFIGURED = DATABASE_URL.lower().startswith(('postgres://', 'postgresql://'))

# Never ship the development fallback as a production signing key. Account APIs
# explicitly remain unavailable on Vercel until durable Postgres and SECRET_KEY
# are configured in the deployment environment.
SECRET_KEY = SECRET_KEY_ENV or 'gone-local-development-key-not-for-production'
DEBUG = os.environ.get('DEBUG', 'False' if ON_VERCEL else 'True').strip().lower() == 'true'


def comma_separated(name):
    return [item.strip() for item in os.environ.get(name, '').split(',') if item.strip()]


if ON_VERCEL:
    ALLOWED_HOSTS = comma_separated('ALLOWED_HOSTS')
    for host_var in ('VERCEL_URL', 'VERCEL_PROJECT_PRODUCTION_URL'):
        host = os.environ.get(host_var, '').strip()
        if host and host not in ALLOWED_HOSTS:
            ALLOWED_HOSTS.append(host)
    if '.vercel.app' not in ALLOWED_HOSTS:
        ALLOWED_HOSTS.append('.vercel.app')
    if not ALLOWED_HOSTS:
        ALLOWED_HOSTS = ['localhost']
else:
    ALLOWED_HOSTS = comma_separated('ALLOWED_HOSTS') or ['localhost', '127.0.0.1', 'testserver']

INSTALLED_APPS = [
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.staticfiles',
    'tracker',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'whitenoise.middleware.WhiteNoiseMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'gone_project.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [BASE_DIR / 'public'],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.template.context_processors.static',
            ],
        },
    },
]

WSGI_APPLICATION = 'gone_project.wsgi.application'

if DATABASE_URL:
    try:
        import dj_database_url
    except ImportError as exc:
        raise ImproperlyConfigured('Install dj-database-url to use DATABASE_URL.') from exc
    DATABASES = {
        'default': dj_database_url.parse(
            DATABASE_URL,
            conn_max_age=0,
            ssl_require=True,
        )
    }
elif ON_VERCEL:
    # Retained only so the app can serve its public shell before DB setup; all
    # account/private-data APIs return 503 rather than pretending /tmp is durable.
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.sqlite3',
            'NAME': '/tmp/db.sqlite3',
        }
    }
else:
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.sqlite3',
            'NAME': BASE_DIR / 'db.sqlite3',
        }
    }

AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator', 'OPTIONS': {'min_length': 8}},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'Asia/Kolkata'
USE_I18N = True
USE_TZ = True

STATIC_URL = '/assets/'
STATICFILES_DIRS = [BASE_DIR / 'public' / 'assets']
STATIC_ROOT = BASE_DIR / 'staticfiles'

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

SESSION_COOKIE_AGE = 60 * 60 * 24 * 30
SESSION_EXPIRE_AT_BROWSER_CLOSE = False
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = 'Lax'
SESSION_COOKIE_SECURE = ON_VERCEL or os.environ.get('SESSION_COOKIE_SECURE', '').lower() == 'true'
CSRF_COOKIE_SECURE = ON_VERCEL or os.environ.get('CSRF_COOKIE_SECURE', '').lower() == 'true'
CSRF_COOKIE_SAMESITE = 'Lax'
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https') if ON_VERCEL else None
SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = 'DENY'  # nobody can frame GONE to trick a click
SECURE_REFERRER_POLICY = 'same-origin'
SECURE_SSL_REDIRECT = ON_VERCEL  # Vercel already serves HTTPS; this forces it for the app too
SECURE_HSTS_SECONDS = 3600 if ON_VERCEL else 0  # start short; raise it once HTTPS is proven
SECURE_HSTS_INCLUDE_SUBDOMAINS = False

CSRF_TRUSTED_ORIGINS = comma_separated('CSRF_TRUSTED_ORIGINS')
for host_var in ('VERCEL_URL', 'VERCEL_PROJECT_PRODUCTION_URL'):
    host = os.environ.get(host_var, '').strip()
    if host:
        origin = f'https://{host}'
        if origin not in CSRF_TRUSTED_ORIGINS:
            CSRF_TRUSTED_ORIGINS.append(origin)
