# Asset Management System — Full Backend

Production backend for the **Asset Management System (Land Rig & Contracting)** HTML app.

| Layer | Platform | Purpose |
|-------|----------|---------|
| Database | **Supabase** | PostgreSQL + Row Level Security + computed views |
| API | **Railway** | Express.js REST API (Node 18+) |
| Frontend Hosting | **Netlify** | Static HTML + API proxy + edge config injection |

---

## Architecture

```
Browser (Netlify CDN)
  │  loads  index.html + api-client.js
  │  calls  /api/*  → Netlify proxy rewrites →
Railway Express API  (x-api-key auth)
  │  queries via Supabase JS client (service-role key)
Supabase PostgreSQL
  └─ 13 tables, 3 computed views, triggers, RLS
```

---

## Step 1 — Supabase Setup

### 1.1 Create project
1. Go to [supabase.com](https://supabase.com) → **New project**
2. Pick a region close to your Railway deployment region
3. Note your **Project URL** and **service_role** key (Settings → API)

### 1.2 Run migrations
In **Supabase SQL Editor**, run the files in order:

```
supabase/migrations/001_schema.sql   ← tables, indexes, views, triggers, RLS
supabase/migrations/002_seed.sql     ← all sample data from the HTML app
```

> **Tip:** You can also use the Supabase CLI:
> ```bash
> supabase login
> supabase link --project-ref <your-project-ref>
> supabase db push
> ```

### 1.3 Verify
Run in SQL Editor to confirm data:
```sql
SELECT COUNT(*) FROM assets;          -- should return 24
SELECT COUNT(*) FROM bom_items;       -- should return 26
SELECT * FROM v_maintenance LIMIT 5;  -- computed live_status
SELECT * FROM v_certificates LIMIT 5; -- computed cert_status
```

---

## Step 2 — Railway Deployment (Express API)

### 2.1 Create Railway project
1. Go to [railway.app](https://railway.app) → **New Project**
2. Select **Deploy from GitHub repo** and push this repo, OR use **Empty project** and deploy via CLI

### 2.2 Set environment variables
In Railway → your service → **Variables**:

| Variable | Value |
|----------|-------|
| `SUPABASE_URL` | `https://xxxx.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJ…` (from Supabase Settings → API) |
| `API_SECRET_KEY` | Any long random string, e.g. `openssl rand -hex 32` |
| `ALLOWED_ORIGINS` | `https://your-site.netlify.app` |
| `NODE_ENV` | `production` |
| `PORT` | `3000` (Railway sets this automatically) |

### 2.3 Deploy
```bash
# Install Railway CLI
npm install -g @railway/cli

# Login and deploy
railway login
railway up
```

Or connect your GitHub repo in the Railway dashboard for auto-deploy on push.

### 2.4 Verify
```bash
curl https://your-api.railway.app/health
# → { "status": "ok", "service": "Asset Management API", ... }

curl https://your-api.railway.app/api/assets \
  -H "x-api-key: YOUR_API_SECRET_KEY"
# → { "success": true, "data": [...], "pagination": {...} }
```

---

## Step 3 — Netlify Deployment (Frontend)

### 3.1 Deploy site
1. Go to [netlify.com](https://netlify.com) → **Add new site** → **Deploy manually** or connect GitHub
2. Set **Publish directory** to `.` (root, where your `index.html` lives)
3. Copy `netlify/netlify.toml` to your **repository root** (rename from `netlify/netlify.toml` → `netlify.toml`)

### 3.2 Edit `netlify.toml` — update Railway URL
```toml
[[redirects]]
  from = "/api/*"
  to   = "https://YOUR-REAL-RAILWAY-URL.railway.app/api/:splat"
  [redirects.headers]
    x-api-key = "YOUR_API_SECRET_KEY_HERE"
```

### 3.3 Set Netlify environment variables
In Netlify → Site settings → **Environment variables**:

| Variable | Value |
|----------|-------|
| `API_URL` | `https://your-api.railway.app` |
| `API_SECRET_KEY` | Same key as Railway |

### 3.4 Add api-client.js to your HTML
Add before `</body>` in `index.html`:
```html
<script src="api-client.js"></script>
```
Copy `netlify/api-client.js` to the same folder as your `index.html`.

The client will auto-initialize, fetch all data from Railway, and replace the
in-memory arrays (`ASSETS`, `RIGS`, `CONTRACTS`, etc.) with live database data.

---

## API Reference

All endpoints require header: `x-api-key: <API_SECRET_KEY>`

Role header (for write operations): `x-user-role: Admin` (or Asset Manager / Editor / Viewer)

### Assets
| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/api/assets` | List assets. Params: `search`, `status`, `category`, `company`, `rig_name`, `page`, `limit`, `sort`, `dir` |
| `GET`  | `/api/assets/summary` | KPI counts + value totals |
| `GET`  | `/api/assets/:id` | Single asset with BOM, certs, maintenance, transfers |
| `POST` | `/api/assets` | Create asset |
| `PUT`  | `/api/assets/:id` | Full update |
| `PATCH`| `/api/assets/:id` | Partial update |
| `DELETE`|`/api/assets/:id` | Delete (Admin only) |
| `POST` | `/api/assets/import` | Bulk upsert array |

### Maintenance
| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/api/maintenance` | List schedules with live status. Params: `status`, `priority`, `asset_id`, `rig_name` |
| `GET`  | `/api/maintenance/alerts` | Overdue + due-soon grouped lists |
| `GET`  | `/api/maintenance/:id` | Schedule + completion logs |
| `POST` | `/api/maintenance` | Create schedule |
| `PUT`  | `/api/maintenance/:id` | Update schedule |
| `DELETE`|`/api/maintenance/:id` | Delete |
| `POST` | `/api/maintenance/:id/complete` | Log completion, auto-reschedule |
| `GET`  | `/api/maintenance/:id/logs` | Completion history |

### Transfers
| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/api/transfers` | List with filters |
| `GET`  | `/api/transfers/kpis` | Status count breakdown |
| `GET`  | `/api/transfers/:id` | Single transfer |
| `POST` | `/api/transfers` | Create request |
| `POST` | `/api/transfers/:id/approve` | Submit ops/mgr decision. Body: `{ role, action, comment, approved_by }` |
| `DELETE`|`/api/transfers/:id` | Cancel (Admin only) |

### Certificates  `/api/certificates`
`GET /` · `GET /summary` · `GET /:id` · `POST /` · `PUT /:id` · `DELETE /:id`

### BOM  `/api/bom`
`GET /` (params: `asset_id`, `type`, `search`) · `GET /:id` · `POST /` · `PUT /:id` · `DELETE /:id`

### Companies  `/api/companies`
`GET /` · `GET /:id` · `POST /` · `PUT /:id` · `DELETE /:id`

### Rigs  `/api/rigs`
`GET /` (params: `status`, `company`) · `GET /:id` · `POST /` · `PUT /:id` · `DELETE /:id`

### Contracts  `/api/contracts`
`GET /` · `GET /:id` · `POST /` · `PUT /:id` · `DELETE /:id`

### Users  `/api/users`
`GET /` · `POST /` · `PUT /:id` · `DELETE /:id`

### Notifications  `/api/notifications`
`GET /` (params: `is_read`) · `POST /` · `PATCH /:id/read` · `PATCH /mark-all-read`

### Audit Log  `/api/audit`
`GET /` (params: `entity_type`, `entity_id`, `page`)

---

## Local Development

```bash
# Clone and install
npm install

# Copy env and fill in values
cp .env.example .env

# Run dev server with hot-reload
npm run dev
# → API running at http://localhost:3000
```

Test locally:
```bash
curl http://localhost:3000/health

curl http://localhost:3000/api/assets \
  -H "x-api-key: your-dev-key"
```

---

## Project Structure

```
asset-management-backend/
├── supabase/
│   └── migrations/
│       ├── 001_schema.sql       ← All 13 tables, indexes, views, triggers, RLS
│       └── 002_seed.sql         ← Full seed data matching HTML app
├── src/
│   ├── index.js                 ← Express server entry point
│   ├── config/
│   │   └── supabase.js          ← Supabase client
│   ├── middleware/
│   │   ├── auth.js              ← API key + role guards
│   │   └── errorHandler.js      ← Global error + 404 handler
│   ├── routes/
│   │   ├── assets.js            ← Assets CRUD + bulk import
│   │   ├── maintenance.js       ← Schedules + logs + completion
│   │   ├── transfers.js         ← Requests + 2-stage approval
│   │   └── other.js             ← Certs, BOM, Companies, Rigs, Contracts, Users, Notifs, Audit
│   └── utils/
│       └── response.js          ← ok() / fail() / fromSupabase()
├── netlify/
│   ├── netlify.toml             ← Copy to repo root; has proxy + SPA redirect
│   ├── edge-functions/
│   │   └── inject-config.js     ← Injects API URL into HTML at CDN edge
│   └── api-client.js            ← Drop-in JS; replaces in-memory data with API calls
├── .env.example                 ← Environment variable template
├── package.json
├── railway.toml                 ← Railway deploy config
└── README.md
```
