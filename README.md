# GONE — Know where it went

**Growth Over Needless Expenses** is a warm-earth, mobile-first money companion built with plain HTML, CSS, and vanilla JavaScript. It has no framework, bundler, API, or build step.

## What is included

- A welcome screen and optional first-run setup for a local display name, monthly spending budget, and daily reminder choices. New profiles can skip setup and land on an empty ledger.
- Static hash routes for Home, Add, Entries, Insights, Savings, and Split, with browser back/forward support, active navigation states, keyboard focus transfer, screen-reader route announcements, and a persistent add action.
- Indian-rupee expense and income forms. The amount field formats values such as `5000` as `5,000`; expenses have category chips and both entry types have a date.
- Home summaries for money left, spending today/this week, biggest expense, reminders, and recent entries. “See all” opens Entries filtered to the last 7 days.
- Daily Chai (₹20), Metro (₹50), and Recharge (₹99) reminder templates. Templates are not sample transactions. A switch logs one expense; switching it off removes that reminder-generated entry. “Skip all today” skips unmarked reminders. Unmarked reminders log at midnight while GONE is open, or when the user returns if the page was closed.
- Entry filters by type, category, and time; CSS charts for category, recent-trend, and monthly views with stable mount IDs (`chart-category`, `chart-trend`, `chart-monthly`, `chart-savings-trend`); savings goal/progress, recurring monthly income, one-time bonus income, and an equal-share bill calculator. The Savings screen includes “View expenses” (last 7 days) and “Adjust goal” shortcuts.
- Self-hosted Manrope variable font (`public/assets/fonts/manrope-latin-vf.woff2`) with the SIL Open Font License in `public/assets/fonts/OFL-Manrope.txt`.

## Data and account boundary

All profile, transaction, reminder, goal, and split data is stored in that browser profile's `localStorage`. Existing entries and a savings goal from the previous GONE local-ledger format are migrated on first open. Data is not uploaded, synced to other devices, or backed up automatically. Anyone with access to the browser profile may be able to see it, and clearing the browser's site data removes it.

There is **no real sign-up/login, secure user account, server, or database** in this static edition. The welcome/setup flow is local personalization only. This keeps the app aligned with the chosen browser-only deployment boundary.

## Run locally

Use the built-in Node HTTP server (Node 18+):

```sh
node server.js
```

Then open `http://localhost:3000`. No `npm install` or build is needed.

## GitHub and Vercel

The repository includes `vercel.json` with `outputDirectory: "public"`.

1. Put the project source in a GitHub repository. For a fresh local copy, initialize Git, commit the source, and push the `main` branch to your repository. If working from a Manus project checkout, add a separate GitHub remote rather than replacing its canonical `origin`.
2. In Vercel, import the GitHub repository, choose the repository root and **Other** framework preset, and leave the build command empty.
3. Deploy. Vercel serves the static `public/` files; do not configure a server, database, authentication provider, or secret variables for this version.
