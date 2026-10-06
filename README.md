# GONE (Growth Over Needless Expenses)
> A simple, distraction-free money companion to help you track where your money goes.

GONE is a lightweight, mobile-first web app built for students and young professionals. Instead of complicated spreadsheets and dense financial jargon, GONE gives you a clean overview of your daily spending, recurring habits, savings goals, and shared group bills.

## 🌟 Key Features

- **Daily Expense & Income Logging:** Quick entry for what you spent or received, with automatic Indian Rupee (₹) formatting and category tags.
- **Lazy Daily Reminders:** One-tap toggles for regular daily expenses (like Chai, Metro commute, or Mobile Recharge) that can auto-log at the end of the day.
- **Budget Tracking:** Clear view of how much money is left in your monthly budget with a visual usage ring.
- **Savings Target:** Set a monthly savings goal and watch your progress update automatically as you log your cash flow.
- **Bill Splitter:** Split dinner or trip bills equally with friends without confusing calculations.
- **Data Export:** Download your complete transaction history as a clean CSV file anytime.
- **Offline & Online Resilience:** Works smoothly inside your browser using local storage, while syncing changes with the backend.

## 📊 Interactive Visualizations with Bokeh

Instead of static images or flat CSS bars, GONE uses Bokeh to generate clean, interactive data visualizations that match the app's warm-earth theme:

1. **Where It All Went (Category Donut):** Shows how your spending is distributed across categories (Food, Travel, Shopping, Bills, etc.) with exact amounts and percentage tooltips on hover.
2. **7-Day Spending Pulse (Trend Line):** A shaded line chart tracking day-by-day expenses over the last week so you can spot spending spikes.
3. **Month-by-Month Comparison (Bar Chart):** Compares your total spending across the last six months with rounded vertical bars.
4. **Savings Journey (Progress Chart):** Tracks your net savings month over month against a dashed benchmark line representing your target savings goal.

All Bokeh plots are interactive—you can hover over points, bars, and slices on both desktop and mobile to see exact figures.

## ⚙️ How Django Powers the Backend

The backend is built with **Django**, handling data storage, synchronization, and analytics behind the scenes:

- **Data Models:** Stores and organizes users' financial entries, profile settings (budget, income, goal), recurring reminders, and bill splits in a lightweight SQLite database.
- **REST & Sync APIs:** Provides endpoints (`/api/state/sync/` and `/api/state/`) that sync entries between the browser and the server.
- **Bokeh Component Rendering:** Django processes your transactions and uses Bokeh's `components()` engine to generate the interactive chart scripts and HTML dynamically.
- **CSV Generator:** A dedicated endpoint (`/api/export-csv/`) that compiles your ledger into a downloadable spreadsheet file.
- **Serverless Ready:** Configured to run locally via `manage.py` or deploy as a serverless WSGI app on platforms like Vercel.


## 🛠️ Tech Stack

- **Frontend:** HTML5, CSS3 (Custom warm-earth design system), Vanilla JavaScript (ES6+), Bokeh JS runtime.
- **Backend:** Python, Django 5+, WhiteNoise (static file serving).
- **Visualization:** Bokeh 3.10.
- **Database:** SQLite (local `db.sqlite3` / serverless `/tmp/db.sqlite3`).
- **Deployment:** Vercel (`vercel.json` + Python WSGI).

---

## 📁 Project Structure

```text
GONE-/
├── gone_project/              # Core Django project configuration
│   ├── __init__.py
│   ├── asgi.py                # ASGI interface definition
│   ├── settings.py            # App settings, static files & DB configuration
│   ├── urls.py                # Top-level URL routing (frontend + API endpoints)
│   └── wsgi.py                # WSGI entrypoint for local execution & Vercel serverless
├── tracker/                   # Financial tracker Django application
│   ├── migrations/            # Database schema migrations
│   │   └── 0001_initial.py    # Initial tables: Profile, Entry, Reminder, Split
│   ├── apps.py                # App configuration
│   ├── bokeh_charts.py        # Interactive Bokeh visualizations (Donut, Pulse, Monthly, Savings)
│   ├── models.py              # Data models (Profile, Entry, Reminder, Split)
│   ├── tests.py               # Unit & integration test suite
│   ├── urls.py                # REST API endpoints routing
│   └── views.py               # API handlers (sync, state, charts, CSV export)
├── public/                    # Frontend client & static assets
│   ├── assets/
│   │   ├── branding/          # SVG logos and branding assets
│   │   ├── css/               # Warm-earth custom CSS styling & responsive layout
│   │   ├── fonts/             # Manrope font files
│   │   └── js/                # Client-side logic & UI state management
│   │       ├── app-v3.js      # App controller & dynamic Bokeh script mounting
│   │       ├── data-v3.js     # Category constants & sample seed records
│   │       ├── store-v3.js    # LocalStorage manager & 2-way backend sync
│   │       └── views-v3.js    # Interactive views (Welcome, Ledger, Insights, Split)
│   └── index.html             # Single-Page Application entry point
├── staticfiles/               # WhiteNoise-collected static assets for deployment
├── manage.py                  # Django CLI management utility
├── requirements.txt           # Python backend dependencies
├── vercel.json                # Vercel serverless build & deployment config
├── .gitignore                 # Git ignore rules
└── README.md                  # Comprehensive project documentation
```

---

## 🚀 Running Locally

### 1. Clone the repository
```bash
git clone https://github.com/mahimchakraborty777-tech/GONE-.git
cd GONE-
```

### 2. Set up a virtual environment & install dependencies
```bash
python -m venv .venv
# Windows:
.\.venv\Scripts\activate
# Mac/Linux:
source .venv/bin/activate

pip install -r requirements.txt
```

### 3. Run database migrations
```bash
python manage.py migrate
```

### 4. Start the server
```bash
python manage.py runserver
```

Open your browser and navigate to **`http://localhost:8000`**.

---

## 🌐 Deployment (Vercel)

The repository includes a pre-configured `vercel.json` file:
1. Push this repository to GitHub.
2. Import the project in your [Vercel Dashboard](https://vercel.com).
3. Vercel automatically detects the Python runtime from `vercel.json`, installs packages from `requirements.txt`, and deploys the app live.

## 📄 License

MIT License. Crafted for smarter, stress-free money management.
