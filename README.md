# 💸 GONE (Growth Over Needless Expenses)

> *"Know where it went."*

GONE is a warm-earth, mobile-first money tracking application designed for students and young professionals who want smarter spending insights without boring spreadsheets.

---

## 🌟 Key Features & Interactive Bokeh Visualizations

- **🍩 Category Donut Chart (`#chart-category`)**: Interactive Bokeh annular donut visualization showing exact category breakdown with percentage and formatted INR (`₹`) tooltips.
- **📈 7-Day Spending Pulse (`#chart-trend`)**: Dynamic daily spending pulse with area shading and hover inspection.
- **📊 6-Month Comparison Bars (`#chart-monthly`)**: Month-by-month spending comparisons with rounded bar styling.
- **💎 Savings Journey (`#chart-savings-trend`)**: Cumulative savings tracking against a configurable target goal reference benchmark.
- **⚡ Lazy-Friendly Reminders**: Tap-to-toggle daily recurring expenses (Chai ₹20, Metro ₹50, Recharge ₹99) with auto-logging support.
- **🤝 Equal Share Bill Splitter**: Calculate equal shares among friends without awkward math.
- **📤 Real CSV Export**: Download a full CSV audit of your ledger at `/api/export-csv/`.
- **🔄 Two-Way Resilient Sync**: Offline-first browser persistence paired with Django SQLite synchronization.

---

## 🛠️ Tech Stack

- **Frontend**: Plain HTML5, CSS3, Vanilla ES6+ JavaScript, Bokeh 3.10 JS CDN runtime.
- **Backend**: Python 3.10+, Django 5+, Bokeh 3.10, WhiteNoise 6+.
- **Database**: SQLite (persists locally in `db.sqlite3` and `/tmp/db.sqlite3` on Vercel).
- **Deployment**: Vercel-ready with `@vercel/python` serverless WSGI integration.

---

## 🚀 Running Locally

### Option 1: Running with Django Backend (Recommended)

1. Make sure Python 3.10+ is installed.
2. Activate your virtual environment and install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
3. Run migrations:
   ```bash
   python manage.py migrate
   ```
4. Start the Django server:
   ```bash
   python manage.py runserver
   ```
5. Open [http://localhost:8000](http://localhost:8000) in your browser.

### Option 2: Running with Node.js Static/Proxy Server

```bash
node server.js
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🌐 Deploying to Vercel

The repository includes a production-configured `vercel.json` and `gone_project/wsgi.py`:

1. Push your code to your GitHub repository:
   ```bash
   git add .
   git commit -m "Add Django backend and Bokeh visualizations"
   git push origin main
   ```
2. In your [Vercel Dashboard](https://vercel.com), import the repository.
3. Vercel automatically detects the Python runtime from `vercel.json` and installs dependencies from `requirements.txt`.
4. Click **Deploy**. Your app will be live with both frontend and Bokeh backend!

---

## 🧪 Running Tests

To verify backend endpoints and chart generation:

```bash
python manage.py test tracker
```

---

## 📄 License

MIT License. Designed and crafted with ❤️ for smarter spending.
