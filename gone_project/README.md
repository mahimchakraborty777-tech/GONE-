# GONE — Growth Over Needless Expenses

A mobile-first expense tracker with a warm-earth visual system, a feature tour, daily reminders, insights, savings goals, and bill splitting. Phase 2 adds real GONE ID accounts and private, owner-scoped server persistence.

## Account features

- **Register and sign in with a GONE ID and password.** A new account can choose an ID or leave the field blank/use the generated-ID option for a fresh unique ID. If an entered ID is already in use, the form points existing users to sign in and lets new users switch to a generated ID. Email and phone number are not required.
- **Recover a forgotten GONE ID** by answering both different recovery questions chosen at registration. Recovery answers are normalized and securely hashed; the ID is shown only after both answers verify. Recovery does not reset a password.
- **View and copy the GONE ID later** from Account details, reachable from the signed-in ID pill in the header; the ID is not limited to the one-time registration screen.
- **First-run tour:** After account setup (or skipping it), new users see a short three-step walkthrough of Home, reminders/Entries, and Insights/Savings/Split before the first Home visit. The tour can be advanced or skipped, and completion is saved to the account.
- **Private, account-owned ledger.** Profile, income/budget, entries, reminders, reminder-day state, savings goal, and splits are read and written using the authenticated Django session. The client never selects the owner of a request.
- **Activity metrics** are staff-only and distinguish registered users from active users. Registration, successful sign-in, and successful ledger saves update activity; simple page reloads do not.
- **Explicit local-data migration.** Existing browser-only data is not automatically uploaded. After sign-in, GONE offers a clear import/merge choice and leaves the source browser copy intact. Legacy database rows without an owner remain unassigned and are not exposed to accounts.

Passwords use Django's password hashers. Session credentials stay in an HttpOnly cookie, state-changing requests require CSRF protection, and private/API responses are `private, no-store`. Every ledger, chart, and export query is scoped to the authenticated database user. A GONE ID is an identifier—not a password or authorization token.

## Run the isolated clone locally

Python 3.11+ is recommended.

```bash
python -m venv .venv
# Windows: .venv\Scripts\activate
# macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver 0.0.0.0:8000
```

Open `http://localhost:8000`. Without `DATABASE_URL`, local development uses the ignored `db.sqlite3` file. This is useful for a local preview, but it is not shared across devices and is not suitable for Vercel's ephemeral filesystem.

Run the backend and security regression suite with:

```bash
python manage.py test tracker
python manage.py makemigrations --check --dry-run
python manage.py check
```

## Deploy with Vercel and Supabase Postgres

The Vercel frontend/API deployment is prepared in `vercel.json`; production account features must **not** use SQLite at `/tmp`. Configure these as **server-side Vercel environment variables** before enabling account registration:

- `DATABASE_URL`: a Supabase PostgreSQL connection URI. Use the connection option/pooler recommended by Supabase for serverless workloads. The Django configuration requires TLS.
- `SECRET_KEY`: generate a long random secret, for example with `python -c "import secrets; print(secrets.token_urlsafe(48))"`. Do not commit it or use the local development fallback in production.
- `DEBUG=False`.
- `ALLOWED_HOSTS`: your production hostname(s), if they are not the Vercel URLs supplied automatically.
- `CSRF_TRUSTED_ORIGINS`: exact HTTPS origins for the Vercel production URL and any custom domain, comma-separated.

Vercel automatically supplies `VERCEL_URL`; the settings add the Vercel host to Django's allowed hosts and CSRF origins. On a Vercel runtime, account APIs fail closed with HTTP 503 unless a PostgreSQL `DATABASE_URL`, a non-empty `SECRET_KEY`, and `DEBUG=False` are present. Do not point a production deployment at SQLite or `/tmp/db.sqlite3`.

The server applies checked-in Django migrations on the first API request in a worker; PostgreSQL startup uses an advisory lock so concurrent cold starts do not race migrations. Local development can also use the normal `python manage.py migrate` command. Keep all database and signing credentials in Vercel's server-side environment, never in the public JavaScript bundle.

## Project structure

```text
GONE-/
├── gone_project/                 # Django settings, URLs, WSGI entrypoint
├── tracker/
│   ├── account_views.py          # registration, login, ID recovery, sessions, staff metrics
│   ├── database.py               # safe first-request schema migration
│   ├── models.py                 # user profiles, owner-scoped finance records, auth limits
│   ├── migrations/               # additive account/ownership schema migrations
│   ├── bokeh_charts.py           # interactive visualizations
│   ├── tests.py                  # auth, privacy, migration, CSRF and export regression tests
│   └── views.py                  # owner-scoped state, charts and CSV APIs
├── public/
│   ├── assets/css/               # warm-earth design system, account screens, and tour
│   ├── assets/fonts/              # self-hosted Manrope font
│   ├── assets/js/app-v6.js       # auth startup, private routes, state sync, tour and UI actions
│   ├── assets/js/views-v6.js     # account forms, occupied-ID guidance, and screen templates
│   ├── assets/js/auth-api-v4.js  # CSRF-aware API client (no browser-stored session token)
│   ├── assets/js/store-v5.js     # per-account cache, explicit legacy import/merge, and tour state
│   └── index.html                # static SPA shell
├── requirements.txt
├── vercel.json
└── README.md
```

## Important deployment boundary

This working copy has **not** been pushed to GitHub or deployed. Supabase authorization was not completed, so no Supabase project or credentials were accessed; the local preview uses SQLite. The source supports Supabase PostgreSQL through `DATABASE_URL`, but durable production accounts will work only after the database and Vercel environment variables are configured.
