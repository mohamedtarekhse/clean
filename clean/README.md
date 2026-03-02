# Asset Management System — Backend

Stack: **Supabase** (database) · **Railway** (API) · **Cloudflare Pages** (frontend)

---

## Folder Structure

```
backend/
├── 001_schema.sql        ← Run first in Supabase SQL Editor
├── 002_seed.sql          ← Run second in Supabase SQL Editor
├── server.js             ← Express API (deploy to Railway)
├── package.json
├── railway.toml
├── .env                  ← Set these as Railway environment variables
└── cloudflare/
    ├── _worker.js        ← Copy to root of your Cloudflare Pages site
    └── _redirects        ← Copy to root of your Cloudflare Pages site
```

---

## Step 1 — Supabase Database

1. Go to [supabase.com](https://supabase.com) → your project → **SQL Editor → New Query**
2. Paste `001_schema.sql` → **Run**
3. Paste `002_seed.sql` → **Run**
4. Verify: the final SELECT at the bottom of 002_seed.sql should show:

| table         | count |
|---------------|-------|
| companies     | 5     |
| rigs          | 14    |
| assets        | 24    |
| contracts     | 4     |
| bom_items     | 26    |
| certificates  | 21    |
| maintenance   | 14    |
| transfers     | 3     |
| users         | 6     |
| notifications | 5     |

---

## Step 2 — Railway API

1. Go to [railway.app](https://railway.app) → **New Project → Deploy from GitHub repo**
   (or drag-and-drop the backend folder)
2. Go to your service → **Settings → Environment Variables** → add these:

| Variable                  | Value                                        |
|---------------------------|----------------------------------------------|
| `SUPABASE_URL`            | `https://tetbgjfltggmejqwntez.supabase.co`  |
| `SUPABASE_SERVICE_ROLE_KEY` | `sb_publishable_uSHDoMEaf...`             |
| `API_SECRET_KEY`          | `a3f8c2e1d4b7e9f0c6a2d8e4f1b3c7a9...`      |
| `ALLOWED_ORIGINS`         | `*`                                          |
| `NODE_ENV`                | `production`                                 |

3. Wait for deploy → visit `https://YOUR-APP.up.railway.app/health`
   You should see: `{"status":"ok","service":"Asset Management API"}`

4. Test an endpoint:
   ```bash
   curl https://YOUR-APP.up.railway.app/api/assets \
     -H "x-api-key: a3f8c2e1d4b7e9f0c6a2d8e4f1b3c7a9e2d5f8b1c4a7e0d3f6b9c2a5e8d1f4"
   ```

---

## Step 3 — Cloudflare Pages (Frontend)

1. Create a folder with:
   ```
   your-site/
   ├── index.html          ← your HTML file (asset_management_v6_fixed.html renamed)
   ├── _worker.js          ← from cloudflare/_worker.js
   └── _redirects          ← from cloudflare/_redirects
   ```

2. Go to [dash.cloudflare.com](https://dash.cloudflare.com) → **Pages → Create a project**
   - Connect GitHub repo OR upload the folder directly
   - Build command: *(leave empty)*
   - Build output: `/` (root)

3. After deploy, go to **Settings → Environment Variables** → add:

| Variable          | Value                                               |
|-------------------|-----------------------------------------------------|
| `RAILWAY_API_URL` | `https://cleanndc.up.railway.app/api`              |
| `API_SECRET_KEY`  | `a3f8c2e1d4b7e9f0c6a2d8e4f1b3c7a9e2d5f8b1c4a7e0d3f6b9c2a5e8d1f4` |

4. **Redeploy** the project (required for env vars to take effect)

5. Open your Cloudflare Pages URL — you should see the app load with live data.

---

## How it fits together

```
Browser (Cloudflare Pages)
  │
  ├── /api/assets  ──→  Cloudflare Worker (_worker.js)
  │                         └── adds x-api-key header
  │                              └──→  Railway Express API
  │                                       └──→  Supabase PostgreSQL
  │
  └── /index.html  ──→  Cloudflare static file serving
```

The API key is **never exposed in the browser** — the Cloudflare Worker injects it server-side.

---

## API Routes Reference

| Method | Route                          | Description                    |
|--------|--------------------------------|--------------------------------|
| GET    | /api/assets                    | List assets (search, filter)   |
| POST   | /api/assets                    | Create asset                   |
| PUT    | /api/assets/:id                | Update asset                   |
| DELETE | /api/assets/:id                | Delete asset                   |
| GET    | /api/rigs                      | List rigs                      |
| GET    | /api/companies                 | List companies                 |
| GET    | /api/contracts                 | List contracts                 |
| GET    | /api/bom                       | List BOM items                 |
| POST   | /api/bom                       | Create BOM item                |
| PUT    | /api/bom/:id                   | Update BOM item                |
| DELETE | /api/bom/:id                   | Delete BOM item                |
| GET    | /api/certificates              | List certificates              |
| POST   | /api/certificates              | Create certificate             |
| PUT    | /api/certificates/:id          | Update certificate             |
| DELETE | /api/certificates/:id          | Delete certificate             |
| GET    | /api/maintenance               | List maintenance schedules     |
| POST   | /api/maintenance               | Create schedule                |
| PUT    | /api/maintenance/:id           | Update schedule                |
| DELETE | /api/maintenance/:id           | Delete schedule                |
| POST   | /api/maintenance/:id/complete  | Mark complete + reschedule     |
| GET    | /api/transfers                 | List transfers                 |
| POST   | /api/transfers                 | Create transfer request        |
| POST   | /api/transfers/:id/approve     | Approve/reject/hold transfer   |
| GET    | /api/users                     | List users                     |
| GET    | /api/notifications             | List notifications             |
| PATCH  | /api/notifications/mark-all-read | Mark all as read             |

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `401 Unauthorized` | API key in HTML doesn't match `API_SECRET_KEY` in Railway |
| `Failed to fetch` | CORS issue — set `ALLOWED_ORIGINS=*` in Railway |
| Data loads but changes don't save | Check Supabase SQL Editor: run `SELECT * FROM assets LIMIT 1` to confirm RLS is disabled |
| `/health` returns 502 | Railway deploy failed — check Deploy Logs for npm errors |
| Cloudflare Worker not proxying | Ensure `_worker.js` is at the **root** of the Pages project, not in a subfolder |
