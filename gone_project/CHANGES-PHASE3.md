# GONE Phase 3: what changed and why

## Security fixes
- **Rate limiter no longer trusts X-Real-IP.** Visitors can set any value in that header. On Vercel the IP now comes from `x-vercel-forwarded-for` (set by the platform). Locally it comes from the socket address.
- **Limits are set for mass use.** Per visitor address: 15 recovery tries and 20 sign-ups per 15 minutes, and 15 sign-in tries. Per question pair: 100 recovery tries per 15 minutes. Account-level sign-in protection stays at 5 tries per GONE ID.
- **Schema is no longer changed by visitor requests.** `tracker/database.py` only checks for pending migrations and fails closed with a 503. Run `python manage.py migrate` as a deployment step.
- **Security headers:** `X-Frame-Options: DENY`, referrer policy, HTTPS redirect and a 1-hour HSTS on Vercel. HSTS preload and subdomains are left off on purpose.
- **Dependencies:** Bokeh pinned to 3.10.0 (matches the page). Unused pandas and numpy removed.

## Features
- **Home screen count:** shows "N people have a GONE ID" from `/api/public/stats/`. The endpoint returns only totals (no names, IDs or ledgers). Staff accounts are excluded. The line stays blank if the server is unreachable. It never shows a made-up number.
- **Sign-ups are open:** there is no cap on the number of people who can join.
- **Tour setup (step 2 of 3):** users can save monthly income and add a routine reminder. Both use the same save code as the Savings and Home screens.

## Not built yet (be honest with testers)
- **Fixed monthly debits (for example rent or a subscription that logs itself each month).** This needs a new data field and auto-logging logic. Current reminders are daily prompts, not monthly entries.
- **Admin screen.** Django admin isn't installed. Use `python manage.py shell` for now.
- **Active-today counts on the home screen.** The admin API has them. The home screen shows only the total, to keep it simple and private.

## How this was checked
- 25 automated tests pass (15 from before, 10 new regression tests).
- `manage.py check --deploy` in Vercel-like mode: only the two intentional HSTS warnings remain.
- Live local server: security headers present, public count returns totals only, register, login, sync, read-back and charts all work.
- JavaScript for the home count and tour setup parses. **Not checked:** how the screens look on a phone, and the live Vercel deployment.
