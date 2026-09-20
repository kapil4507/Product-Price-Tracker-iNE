# Product Price Tracker (iNE Mock Store)

A full-stack web application built for tracking product prices and stock availability on `https://demo.inelabteamdev.com/`. Features automated resilient web scraping, real-time analytics, and transparent scrape log history.

## 🚀 Tech Stack
- **Frontend:** React.js (Vite) + Tailwind CSS + Recharts (Deployable on Vercel)
- **Backend:** Node.js + Express (Deployable on Render)
- **Database:** Supabase (PostgreSQL)
- **Scraper:** Playwright (Node.js) with anti-bot friction bypass & 3x retry handling

---

## 🛠️ Project Structure
```text
.
├── backend/
│   ├── server.js              # Express API entry point
│   ├── headed-run.js          # Observable headed Playwright runner script
│   ├── supabase/
│   │   └── schema.sql         # Supabase SQL schema setup
│   └── src/
│       ├── config/            # Supabase client setup
│       ├── routes/            # REST API endpoints (/api/products, /api/cron/scrape, etc.)
│       └── services/          # Resilient Playwright scraper & catalog search
├── frontend/
│   ├── src/
│   │   ├── components/        # Navbar, ProductSearch, ProductList, ProductDetailsModal
│   │   ├── App.jsx            # Main dashboard container
│   │   └── index.css          # Tailwind CSS styling
│   └── vite.config.js         # Vite configuration & dev API proxy
└── package.json               # Root scripts
```

---

## ⚡ Quick Start (Local Development)

### 1. Database Setup (Supabase)
Run the SQL script located in `backend/supabase/schema.sql` in your **Supabase Dashboard -> SQL Editor**.

### 2. Backend Setup
```bash
cd backend
npm install
```

Create a `.env` file inside `backend/`:
```env
PORT=5000
SUPABASE_URL=https://your-supabase-project.supabase.co
SUPABASE_ANON_KEY=your-supabase-anon-key
HEADLESS=true
```

Start backend:
```bash
npm run dev
```

### 3. Frontend Setup
```bash
cd frontend
npm install
npm run dev
```

The frontend will run on `http://localhost:3000` with API proxying to `http://localhost:5000`.

---

## 🎥 Observable (Headed) Run

To observe the Playwright scraper interact with the live mock store in a visible browser window:

```bash
npm run scrape:headed
```
or
```bash
cd backend
npm run scrape:headed https://demo.inelabteamdev.com/product/1
```

---

## ⏰ Cron Scrape Endpoint

To automate scraping every 2 hours on free-tier hosting (e.g. Render), configure an external cron service (like **[cron-job.org](https://cron-job.org)**) to hit:

```http
GET https://your-backend-service.onrender.com/api/cron/scrape
```
