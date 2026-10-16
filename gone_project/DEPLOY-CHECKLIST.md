# Deploying GONE (final secure version)

Never commit secrets. Set them only in Vercel's Environment Variables.

## 1. Services
- A Postgres database (Supabase or Neon). Copy its connection string (ends with `?sslmode=require`).

## 2. Vercel environment variables (Production, and Preview if you want to test there)
| Name | Value |
|---|---|
| `SECRET_KEY` | A new random string: `python -c "import secrets; print(secrets.token_urlsafe(50))"` |
| `DATABASE_URL` | Your Postgres connection string |
| `DEBUG` | `False` |
| `ALLOWED_HOSTS` | `your-project.vercel.app` (add your custom domain if you have one) |
| `CSRF_TRUSTED_ORIGINS` | `https://your-project.vercel.app` |

There are no sign-up limits: any number of people can join.

## 3. Create the tables (once per database, and after any new migration)
Windows PowerShell, inside the project folder:
```
$env:DATABASE_URL="PASTE_CONNECTION_STRING"
$env:SECRET_KEY="PASTE_SECRET"
python manage.py migrate
```
This phase adds no new migrations, but running it is harmless and required on a fresh database.

## 4. Put the code on GitHub (on a branch first)
```
cd PATH\TO\GONE-
git checkout -b phase3-secure
# copy the contents of this folder over the repo, keeping the .git folder
git add -A
git status          # must NOT list db.sqlite3, .venv, staticfiles, .env
git commit -m "Phase 3: secure rate limits, public count, tour setup, deploy hardening"
git push -u origin phase3-secure
```
Vercel builds a preview link for the branch. Test there first.

## 5. Test the preview before merging
- [ ] Register a new GONE ID. Home shows "N people have a GONE ID" and N goes up by one.
- [ ] Log out, log in. Entries are still there.
- [ ] Forgotten password: answer recovery questions with a wrong answer 6 times. You should get "Too many attempts".
- [ ] Tour step 2: save monthly income, add a reminder, then continue to step 3.
- [ ] Add an expense, reload, confirm it stays. Open Insights and Savings.
- [ ] On a phone (or DevTools phone view): the home count, tour form and buttons fit the screen.

## 6. Go live
On GitHub, open a Pull Request from `phase3-secure` into `main`, then merge. Vercel deploys production.

## If something fails
- Accounts show "temporarily unavailable" (503): the database isn't reachable or migrations haven't run. Run step 3.
- Accounts show "not configured": `SECRET_KEY` or `DATABASE_URL` is missing in Vercel.
- Count line stays blank: check `/api/public/stats/` in the browser. A JSON answer means the backend is fine.
