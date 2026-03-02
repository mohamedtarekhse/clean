/**
 * Assets Router
 * GET    /api/assets           — list with filters & pagination
 * GET    /api/assets/summary   — dashboard KPI counts
 * GET    /api/assets/:id       — single asset (rich view)
 * POST   /api/assets           — create
 * PUT    /api/assets/:id       — full update
 * PATCH  /api/assets/:id       — partial update (status, location …)
 * DELETE /api/assets/:id       — delete
 * POST   /api/assets/import    — bulk import array
 */
const { Router } = require('express');
const supabase   = require('../config/supabase');
const { ok, fail, fromSupabase } = require('../utils/response');
const { requireRole } = require('../middleware/auth');

const router = Router();

// ── LIST  (with filters, search, pagination) ─────────────────────────────────
router.get('/', async (req, res) => {
  const {
    search, status, category, company, rig_name, location,
    page = 1, limit = 50, sort = 'asset_id', dir = 'asc',
    view = 'summary',   // 'summary' uses the rich view; 'basic' uses bare table
  } = req.query;

  const table    = view === 'summary' ? 'v_asset_summary' : 'assets';
  const pageNum  = Math.max(1, parseInt(page));
  const pageSize = Math.min(200, Math.max(1, parseInt(limit)));
  const from     = (pageNum - 1) * pageSize;
  const to       = from + pageSize - 1;

  let query = supabase.from(table).select('*', { count: 'exact' });

  if (search)   query = query.or(`name.ilike.%${search}%,asset_id.ilike.%${search}%,serial.ilike.%${search}%,notes.ilike.%${search}%`);
  if (status)   query = query.eq('status', status);
  if (category) query = query.eq('category', category);
  if (company)  query = query.eq('company', company);
  if (rig_name) query = query.eq('rig_name', rig_name);
  if (location) query = query.ilike('location', `%${location}%`);

  const validSorts = ['asset_id','name','category','status','value','acquisition_date','company','rig_name','location'];
  const safeSort   = validSorts.includes(sort) ? sort : 'asset_id';
  query = query.order(safeSort, { ascending: dir !== 'desc' }).range(from, to);

  const { data, error, count } = await query;
  if (error) return fail(res, 500, error.message);

  return ok(res, data, 200, {
    pagination: { page: pageNum, limit: pageSize, total: count, pages: Math.ceil(count / pageSize) },
  });
});

// ── DASHBOARD SUMMARY ────────────────────────────────────────────────────────
router.get('/summary', async (req, res) => {
  const { data, error } = await supabase.from('assets')
    .select('status, value, category');
  if (error) return fail(res, 500, error.message);

  const total      = data.length;
  const active     = data.filter(a => a.status === 'Active').length;
  const maintenance= data.filter(a => a.status === 'Maintenance').length;
  const contracted = data.filter(a => a.status === 'Contracted').length;
  const standby    = data.filter(a => a.status === 'Standby').length;
  const totalValue = data.reduce((s, a) => s + Number(a.value || 0), 0);

  const byCategory = data.reduce((acc, a) => {
    acc[a.category] = (acc[a.category] || 0) + 1;
    return acc;
  }, {});

  return ok(res, { total, active, maintenance, contracted, standby, totalValue, byCategory });
});

// ── SINGLE ASSET ─────────────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  const { id } = req.params;

  const [assetRes, bomRes, certRes, maintRes, transferRes] = await Promise.all([
    supabase.from('v_asset_summary').select('*').eq('asset_id', id).single(),
    supabase.from('bom_items').select('*').eq('asset_id', id).order('id'),
    supabase.from('v_certificates').select('*').eq('asset_id', id),
    supabase.from('v_maintenance').select('*').eq('asset_id', id).order('next_due'),
    supabase.from('transfers').select('*').eq('asset_id', id).order('request_date', { ascending: false }),
  ]);

  if (assetRes.error) {
    if (assetRes.error.code === 'PGRST116') return fail(res, 404, `Asset ${id} not found`);
    return fail(res, 500, assetRes.error.message);
  }

  return ok(res, {
    ...assetRes.data,
    bom:       bomRes.data       || [],
    certificates: certRes.data   || [],
    maintenance:  maintRes.data  || [],
    transfers:    transferRes.data || [],
  });
});

// ── CREATE ────────────────────────────────────────────────────────────────────
router.post('/', requireRole(['Admin', 'Asset Manager', 'Editor']), async (req, res) => {
  const body = req.body;

  if (!body.asset_id || !body.name || !body.category) {
    return fail(res, 400, 'asset_id, name, and category are required');
  }

  const payload = {
    asset_id:         body.asset_id,
    name:             body.name,
    category:         body.category,
    company:          body.company         || null,
    rig_name:         body.rig_name        || null,
    location:         body.location        || null,
    status:           body.status          || 'Active',
    value:            body.value           || 0,
    acquisition_date: body.acquisition_date|| null,
    serial:           body.serial          || null,
    notes:            body.notes           || null,
    last_inspection:  body.last_inspection || null,
    inspection_type:  body.inspection_type || null,
    cert_link:        body.cert_link       || null,
  };

  const { data, error } = await supabase.from('assets').insert(payload).select().single();
  if (error) return fail(res, 400, error.message);

  // Audit
  await supabase.from('audit_log').insert({
    entity_type: 'asset', entity_id: data.asset_id,
    action: 'create', changed_by: req.headers['x-user-name'] || 'system',
    new_data: data,
  });

  return ok(res, data, 201);
});

// ── UPDATE (full) ─────────────────────────────────────────────────────────────
router.put('/:id', requireRole(['Admin', 'Asset Manager', 'Editor']), async (req, res) => {
  const { id } = req.params;
  const { data: old } = await supabase.from('assets').select('*').eq('asset_id', id).single();

  const body    = req.body;
  const payload = {
    name:             body.name,
    category:         body.category,
    company:          body.company         || null,
    rig_name:         body.rig_name        || null,
    location:         body.location        || null,
    status:           body.status,
    value:            body.value           || 0,
    acquisition_date: body.acquisition_date|| null,
    serial:           body.serial          || null,
    notes:            body.notes           || null,
    last_inspection:  body.last_inspection || null,
    inspection_type:  body.inspection_type || null,
    cert_link:        body.cert_link       || null,
  };

  const { data, error } = await supabase.from('assets').update(payload).eq('asset_id', id).select().single();
  if (error) return fail(res, 400, error.message);

  await supabase.from('audit_log').insert({
    entity_type: 'asset', entity_id: id, action: 'update',
    changed_by: req.headers['x-user-name'] || 'system',
    old_data: old, new_data: data,
  });

  return ok(res, data);
});

// ── PATCH (partial) ───────────────────────────────────────────────────────────
router.patch('/:id', requireRole(['Admin', 'Asset Manager', 'Editor']), async (req, res) => {
  const { id } = req.params;
  const allowed = ['name','category','company','rig_name','location','status',
                   'value','acquisition_date','serial','notes','last_inspection',
                   'inspection_type','cert_link'];
  const patch = {};
  for (const k of allowed) { if (req.body[k] !== undefined) patch[k] = req.body[k]; }

  if (!Object.keys(patch).length) return fail(res, 400, 'No valid fields to update');

  const { data, error } = await supabase.from('assets').update(patch).eq('asset_id', id).select().single();
  if (error) return fail(res, 400, error.message);
  return ok(res, data);
});

// ── DELETE ────────────────────────────────────────────────────────────────────
router.delete('/:id', requireRole(['Admin']), async (req, res) => {
  const { id } = req.params;
  const { data: old } = await supabase.from('assets').select('*').eq('asset_id', id).single();

  const { error } = await supabase.from('assets').delete().eq('asset_id', id);
  if (error) return fail(res, 400, error.message);

  await supabase.from('audit_log').insert({
    entity_type: 'asset', entity_id: id, action: 'delete',
    changed_by: req.headers['x-user-name'] || 'system',
    old_data: old,
  });

  return ok(res, { deleted: id });
});

// ── BULK IMPORT ───────────────────────────────────────────────────────────────
router.post('/import', requireRole(['Admin', 'Asset Manager']), async (req, res) => {
  const assets = req.body;
  if (!Array.isArray(assets) || !assets.length) {
    return fail(res, 400, 'Body must be a non-empty array of assets');
  }

  const { data, error } = await supabase
    .from('assets')
    .upsert(assets, { onConflict: 'asset_id' })
    .select();

  if (error) return fail(res, 400, error.message);
  return ok(res, { imported: data.length, records: data }, 201);
});

module.exports = router;
