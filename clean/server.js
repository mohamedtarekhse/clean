// ══════════════════════════════════════════════════════════════════════════════
//  Asset Management API — server.js
//  Single-file Express server for Railway deployment
//  Supabase (PostgreSQL) as database via @supabase/supabase-js
// ══════════════════════════════════════════════════════════════════════════════

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';

// ── Supabase client (service-role key — bypasses RLS) ─────────────────────────
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const app  = express();
const PORT = process.env.PORT || 3000;

// ── CORS ──────────────────────────────────────────────────────────────────────
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '*')
  .split(',').map(s => s.trim()).filter(Boolean);

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
      cb(null, true);
    } else {
      cb(new Error('CORS: origin not allowed'));
    }
  },
  methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','x-api-key','x-user-role','x-user-name'],
}));

app.use(express.json());

// ── API KEY AUTH ──────────────────────────────────────────────────────────────
app.use('/api', (req, res, next) => {
  if (req.method === 'OPTIONS') return next();
  if (req.headers['x-api-key'] !== process.env.API_SECRET_KEY) {
    return res.status(401).json({ success: false, error: 'Unauthorized — invalid or missing API key' });
  }
  next();
});

// ── Response helpers ──────────────────────────────────────────────────────────
const ok   = (res, data, meta)  => res.json({ success: true, data, ...meta });
const fail = (res, status, msg) => res.status(status).json({ success: false, error: msg });
const db   = async (res, query) => {
  const { data, error } = await query;
  if (error) return fail(res, 500, error.message);
  return ok(res, data);
};

// ── HEALTH ────────────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'Asset Management API', ts: new Date().toISOString() });
});

// ══════════════════════════════════════════════════════════════════════════════
//  ASSETS
// ══════════════════════════════════════════════════════════════════════════════
app.get('/api/assets', async (req, res) => {
  const { search, status, category, company, rig_name, limit = 500 } = req.query;
  let q = supabase.from('assets').select('*').limit(Number(limit)).order('name');
  if (search)   q = q.ilike('name', `%${search}%`);
  if (status)   q = q.eq('status', status);
  if (category) q = q.eq('category', category);
  if (company)  q = q.eq('company', company);
  if (rig_name) q = q.eq('rig_name', rig_name);
  await db(res, q);
});

app.get('/api/assets/:id', async (req, res) => {
  const { data, error } = await supabase.from('assets').select('*').eq('asset_id', req.params.id).single();
  if (error) return fail(res, 404, 'Asset not found');
  ok(res, data);
});

app.post('/api/assets', async (req, res) => {
  const b = req.body;
  if (!b.asset_id || !b.name) return fail(res, 400, 'asset_id and name are required');
  await db(res, supabase.from('assets').insert(b).select().single());
});

app.put('/api/assets/:id', async (req, res) => {
  const { asset_id, created_at, updated_at, ...body } = req.body;
  await db(res, supabase.from('assets').update(body).eq('asset_id', req.params.id).select().single());
});

app.patch('/api/assets/:id', async (req, res) => {
  await db(res, supabase.from('assets').update(req.body).eq('asset_id', req.params.id).select().single());
});

app.delete('/api/assets/:id', async (req, res) => {
  const { error } = await supabase.from('assets').delete().eq('asset_id', req.params.id);
  if (error) return fail(res, 500, error.message);
  ok(res, { deleted: req.params.id });
});

// ══════════════════════════════════════════════════════════════════════════════
//  RIGS
// ══════════════════════════════════════════════════════════════════════════════
app.get('/api/rigs', async (_req, res) => {
  await db(res, supabase.from('rigs').select('*').order('name'));
});

app.get('/api/rigs/:id', async (req, res) => {
  const { data, error } = await supabase.from('rigs').select('*').eq('id', req.params.id).single();
  if (error) return fail(res, 404, 'Rig not found');
  ok(res, data);
});

app.post('/api/rigs', async (req, res) => {
  await db(res, supabase.from('rigs').insert(req.body).select().single());
});

app.put('/api/rigs/:id', async (req, res) => {
  const { id, created_at, updated_at, ...body } = req.body;
  await db(res, supabase.from('rigs').update(body).eq('id', req.params.id).select().single());
});

app.delete('/api/rigs/:id', async (req, res) => {
  const { error } = await supabase.from('rigs').delete().eq('id', req.params.id);
  if (error) return fail(res, 500, error.message);
  ok(res, { deleted: req.params.id });
});

// ══════════════════════════════════════════════════════════════════════════════
//  COMPANIES
// ══════════════════════════════════════════════════════════════════════════════
app.get('/api/companies', async (_req, res) => {
  await db(res, supabase.from('companies').select('*').order('name'));
});

app.post('/api/companies', async (req, res) => {
  await db(res, supabase.from('companies').insert(req.body).select().single());
});

app.put('/api/companies/:id', async (req, res) => {
  const { id, created_at, updated_at, ...body } = req.body;
  await db(res, supabase.from('companies').update(body).eq('id', req.params.id).select().single());
});

app.delete('/api/companies/:id', async (req, res) => {
  const { error } = await supabase.from('companies').delete().eq('id', req.params.id);
  if (error) return fail(res, 500, error.message);
  ok(res, { deleted: req.params.id });
});

// ══════════════════════════════════════════════════════════════════════════════
//  CONTRACTS
// ══════════════════════════════════════════════════════════════════════════════
app.get('/api/contracts', async (req, res) => {
  const { limit = 200 } = req.query;
  // Include asset count via subquery workaround: fetch all and count in JS
  const { data, error } = await supabase.from('contracts').select('*, contract_assets(asset_id)').limit(Number(limit)).order('id');
  if (error) return fail(res, 500, error.message);
  ok(res, data.map(c => ({ ...c, asset_count: c.contract_assets?.length || 0, contract_assets: undefined })));
});

app.post('/api/contracts', async (req, res) => {
  await db(res, supabase.from('contracts').insert(req.body).select().single());
});

app.put('/api/contracts/:id', async (req, res) => {
  const { id, created_at, updated_at, ...body } = req.body;
  await db(res, supabase.from('contracts').update(body).eq('id', req.params.id).select().single());
});

// ══════════════════════════════════════════════════════════════════════════════
//  BOM ITEMS
// ══════════════════════════════════════════════════════════════════════════════
app.get('/api/bom', async (req, res) => {
  const { asset_id, type, search, limit = 1000 } = req.query;
  let q = supabase.from('bom_items').select('*').limit(Number(limit)).order('id');
  if (asset_id) q = q.eq('asset_id', asset_id);
  if (type)     q = q.eq('type', type);
  if (search)   q = q.ilike('name', `%${search}%`);
  await db(res, q);
});

app.get('/api/bom/:id', async (req, res) => {
  const { data, error } = await supabase.from('bom_items').select('*').eq('id', req.params.id).single();
  if (error) return fail(res, 404, 'BOM item not found');
  ok(res, data);
});

app.post('/api/bom', async (req, res) => {
  // Auto-generate ID if not provided
  const body = { ...req.body };
  if (!body.id) body.id = 'BOM-' + Date.now().toString().slice(-8);
  await db(res, supabase.from('bom_items').insert(body).select().single());
});

app.put('/api/bom/:id', async (req, res) => {
  const { id, created_at, updated_at, ...body } = req.body;
  await db(res, supabase.from('bom_items').update(body).eq('id', req.params.id).select().single());
});

app.delete('/api/bom/:id', async (req, res) => {
  const { error } = await supabase.from('bom_items').delete().eq('id', req.params.id);
  if (error) return fail(res, 500, error.message);
  ok(res, { deleted: req.params.id });
});

// ══════════════════════════════════════════════════════════════════════════════
//  CERTIFICATES
// ══════════════════════════════════════════════════════════════════════════════
app.get('/api/certificates', async (req, res) => {
  const { asset_id, limit = 500 } = req.query;
  let q = supabase.from('certificates').select(`
    *, assets(name, serial, rig_name, category)
  `).limit(Number(limit)).order('cert_id');
  if (asset_id) q = q.eq('asset_id', asset_id);

  const { data, error } = await q;
  if (error) return fail(res, 500, error.message);

  // Flatten joined asset fields
  ok(res, data.map(c => ({
    ...c,
    asset_name:   c.assets?.name,
    asset_serial: c.assets?.serial,
    rig_name:     c.assets?.rig_name,
    category:     c.assets?.category,
    assets: undefined,
  })));
});

app.post('/api/certificates', async (req, res) => {
  const body = { ...req.body };
  if (!body.cert_id) {
    const { count } = await supabase.from('certificates').select('*', { count: 'exact', head: true });
    body.cert_id = 'CERT-' + String((count || 0) + 1).padStart(3, '0');
  }
  await db(res, supabase.from('certificates').insert(body).select().single());
});

app.put('/api/certificates/:id', async (req, res) => {
  const { cert_id, created_at, updated_at, ...body } = req.body;
  await db(res, supabase.from('certificates').update(body).eq('cert_id', req.params.id).select().single());
});

app.delete('/api/certificates/:id', async (req, res) => {
  const { error } = await supabase.from('certificates').delete().eq('cert_id', req.params.id);
  if (error) return fail(res, 500, error.message);
  ok(res, { deleted: req.params.id });
});

// ══════════════════════════════════════════════════════════════════════════════
//  MAINTENANCE SCHEDULES
//  live_status computed here (Overdue / Due Soon / Scheduled) — never stored
// ══════════════════════════════════════════════════════════════════════════════
function computeLiveStatus(m) {
  if (['Completed','Cancelled','In Progress'].includes(m.status)) return m.status;
  const today   = new Date(); today.setHours(0,0,0,0);
  const nextDue = new Date(m.next_due);
  const alertMs = (m.alert_days || 14) * 86400000;
  if (nextDue < today) return 'Overdue';
  if (nextDue - today <= alertMs) return 'Due Soon';
  return 'Scheduled';
}

app.get('/api/maintenance', async (req, res) => {
  const { asset_id, status, priority, limit = 500 } = req.query;
  let q = supabase.from('maintenance_schedules').select(`
    *, assets(name, rig_name, company)
  `).limit(Number(limit)).order('next_due');
  if (asset_id) q = q.eq('asset_id', asset_id);
  if (priority) q = q.eq('priority', priority);
  // status filter handled after computing live_status

  const { data, error } = await q;
  if (error) return fail(res, 500, error.message);

  let result = data.map(m => ({
    ...m,
    asset_name: m.assets?.name,
    rig_name:   m.assets?.rig_name,
    company:    m.assets?.company,
    assets: undefined,
    live_status: computeLiveStatus(m),
  }));

  if (status) result = result.filter(m => m.live_status === status || m.status === status);
  ok(res, result);
});

app.post('/api/maintenance', async (req, res) => {
  const body = { ...req.body };
  if (!body.id) {
    const { count } = await supabase.from('maintenance_schedules').select('*', { count: 'exact', head: true });
    body.id = 'PM-' + String((count || 0) + 1).padStart(3, '0');
  }
  // Strip computed/display-only status values before storing
  if (['Overdue','Due Soon'].includes(body.status)) body.status = 'Scheduled';
  await db(res, supabase.from('maintenance_schedules').insert(body).select().single());
});

app.put('/api/maintenance/:id', async (req, res) => {
  const { id, created_at, updated_at, live_status, asset_name, rig_name, company, ...body } = req.body;
  if (['Overdue','Due Soon'].includes(body.status)) body.status = 'Scheduled';
  await db(res, supabase.from('maintenance_schedules').update(body).eq('id', req.params.id).select().single());
});

app.delete('/api/maintenance/:id', async (req, res) => {
  const { error } = await supabase.from('maintenance_schedules').delete().eq('id', req.params.id);
  if (error) return fail(res, 500, error.message);
  ok(res, { deleted: req.params.id });
});

// Mark complete — inserts log, advances next_due
app.post('/api/maintenance/:id/complete', async (req, res) => {
  const { completion_date, performed_by, hours, cost, parts_used, notes, next_due_override } = req.body;
  if (!completion_date || !performed_by) return fail(res, 400, 'completion_date and performed_by required');

  // Get current schedule
  const { data: sched, error: se } = await supabase
    .from('maintenance_schedules').select('*').eq('id', req.params.id).single();
  if (se) return fail(res, 404, 'Schedule not found');

  // Compute next due
  const nextDue = next_due_override || (() => {
    const d = new Date(completion_date);
    d.setDate(d.getDate() + (sched.freq || 90));
    return d.toISOString().slice(0,10);
  })();

  // Insert log
  await supabase.from('maintenance_logs').insert({
    schedule_id: req.params.id, completion_date, performed_by, hours, cost, parts_used, notes,
  });

  // Update schedule
  const { data: updated, error: ue } = await supabase
    .from('maintenance_schedules')
    .update({ status: 'Scheduled', last_done: completion_date, next_due: nextDue })
    .eq('id', req.params.id).select().single();

  if (ue) return fail(res, 500, ue.message);
  ok(res, { schedule: { ...updated, live_status: computeLiveStatus(updated) } });
});

// ══════════════════════════════════════════════════════════════════════════════
//  TRANSFERS
// ══════════════════════════════════════════════════════════════════════════════
app.get('/api/transfers', async (req, res) => {
  const { status, priority, limit = 200 } = req.query;
  let q = supabase.from('transfers').select('*').limit(Number(limit)).order('created_at', { ascending: false });
  if (status)   q = q.eq('status', status);
  if (priority) q = q.eq('priority', priority);
  await db(res, q);
});

app.post('/api/transfers', async (req, res) => {
  const body = { ...req.body };
  if (!body.id) {
    const { count } = await supabase.from('transfers').select('*', { count: 'exact', head: true });
    body.id = 'TR-' + String((count || 0) + 1).padStart(3, '0');
  }
  if (!body.request_date) body.request_date = new Date().toISOString().slice(0,10);

  // Auto-fill asset_name from assets table if not provided
  if (!body.asset_name && body.asset_id) {
    const { data: a } = await supabase.from('assets').select('name,location').eq('asset_id', body.asset_id).single();
    if (a) { body.asset_name = a.name; if (!body.current_loc) body.current_loc = a.location; }
  }
  await db(res, supabase.from('transfers').insert(body).select().single());
});

// Approve / reject / hold
app.post('/api/transfers/:id/approve', async (req, res) => {
  const { role, action, comment, approved_by } = req.body;
  if (!role || !action || !comment) return fail(res, 400, 'role, action, and comment are required');

  const today = new Date().toISOString().slice(0,10);
  let update = {};

  if (role === 'ops') {
    update.ops_approved_by   = approved_by;
    update.ops_approved_date = today;
    update.ops_action        = action;
    update.ops_comment       = comment;
    update.status = action === 'approve' ? 'Ops Approved' : action === 'reject' ? 'Rejected' : 'On Hold';
  } else if (role === 'mgr') {
    update.mgr_approved_by   = approved_by;
    update.mgr_approved_date = today;
    update.mgr_action        = action;
    update.mgr_comment       = comment;
    update.status = action === 'approve' ? 'Completed' : action === 'reject' ? 'Rejected' : 'On Hold';

    // If fully approved — update asset location
    if (action === 'approve') {
      const { data: tr } = await supabase.from('transfers').select('*').eq('id', req.params.id).single();
      if (tr) {
        const assetUpdate = { location: tr.destination };
        if (tr.dest_rig)     assetUpdate.rig_name = tr.dest_rig;
        if (tr.dest_company) assetUpdate.company  = tr.dest_company;
        await supabase.from('assets').update(assetUpdate).eq('asset_id', tr.asset_id);
      }
    }
  } else {
    return fail(res, 400, 'role must be "ops" or "mgr"');
  }

  await db(res, supabase.from('transfers').update(update).eq('id', req.params.id).select().single());
});

// ══════════════════════════════════════════════════════════════════════════════
//  USERS
// ══════════════════════════════════════════════════════════════════════════════
app.get('/api/users', async (_req, res) => {
  await db(res, supabase.from('app_users').select('*').order('name'));
});

app.post('/api/users', async (req, res) => {
  await db(res, supabase.from('app_users').insert(req.body).select().single());
});

app.put('/api/users/:id', async (req, res) => {
  const { id, created_at, updated_at, ...body } = req.body;
  await db(res, supabase.from('app_users').update(body).eq('id', req.params.id).select().single());
});

app.delete('/api/users/:id', async (req, res) => {
  const { error } = await supabase.from('app_users').delete().eq('id', req.params.id);
  if (error) return fail(res, 500, error.message);
  ok(res, { deleted: req.params.id });
});

// ══════════════════════════════════════════════════════════════════════════════
//  NOTIFICATIONS
// ══════════════════════════════════════════════════════════════════════════════
app.get('/api/notifications', async (_req, res) => {
  await db(res, supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(50));
});

app.patch('/api/notifications/mark-all-read', async (_req, res) => {
  await db(res, supabase.from('notifications').update({ is_read: true }).eq('is_read', false).select());
});

app.patch('/api/notifications/:id/read', async (req, res) => {
  await db(res, supabase.from('notifications').update({ is_read: true }).eq('id', req.params.id).select().single());
});

app.post('/api/notifications', async (req, res) => {
  await db(res, supabase.from('notifications').insert(req.body).select().single());
});

// ── 404 ───────────────────────────────────────────────────────────────────────
app.use((_req, res) => res.status(404).json({ success: false, error: 'Route not found' }));

// ── Global error handler ──────────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ success: false, error: err.message || 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`✓ Asset Management API running on port ${PORT}`);
  console.log(`  Supabase: ${process.env.SUPABASE_URL}`);
  console.log(`  Node:     ${process.version}`);
});
