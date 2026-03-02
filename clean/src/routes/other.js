/**
 * Certificates Router
 */
const { Router: CRouter } = require('express');
const supabase = require('../config/supabase');
const { ok, fail } = require('../utils/response');
const { requireRole } = require('../middleware/auth');

const certRouter = CRouter();

certRouter.get('/', async (req, res) => {
  const { search, rig_name, inspection_type, cert_status, page = 1, limit = 100 } = req.query;
  const from = (Math.max(1, parseInt(page)) - 1) * parseInt(limit);
  let q = supabase.from('v_certificates').select('*', { count: 'exact' })
    .range(from, from + parseInt(limit) - 1)
    .order('next_inspection', { ascending: true });

  if (search)         q = q.or(`asset_name.ilike.%${search}%,asset_id.ilike.%${search}%,inspection_type.ilike.%${search}%`);
  if (rig_name)       q = q.eq('rig_name', rig_name);
  if (inspection_type)q = q.eq('inspection_type', inspection_type);
  if (cert_status)    q = q.eq('cert_status', cert_status);

  const { data, error, count } = await q;
  if (error) return fail(res, 500, error.message);
  return ok(res, data, 200, { total: count });
});

certRouter.get('/summary', async (req, res) => {
  const { data, error } = await supabase.from('v_certificates').select('cert_status');
  if (error) return fail(res, 500, error.message);
  const totals = data.reduce((acc, c) => { acc[c.cert_status] = (acc[c.cert_status] || 0) + 1; return acc; }, {});
  return ok(res, { total: data.length, ...totals });
});

certRouter.get('/:id', async (req, res) => {
  const { data, error } = await supabase.from('v_certificates').select('*').eq('cert_id', req.params.id).single();
  if (error) return fail(res, 404, 'Certificate not found');
  return ok(res, data);
});

certRouter.post('/', requireRole(['Admin', 'Asset Manager', 'Editor']), async (req, res) => {
  const b = req.body;
  if (!b.asset_id || !b.inspection_type) return fail(res, 400, 'asset_id and inspection_type are required');
  const { count } = await supabase.from('certificates').select('cert_id', { count: 'exact', head: true });
  const payload = {
    cert_id:         b.cert_id || `CERT-${String((count || 0) + 1).padStart(3, '0')}`,
    asset_id:        b.asset_id,
    inspection_type: b.inspection_type,
    last_inspection: b.last_inspection  || null,
    next_inspection: b.next_inspection  || null,
    validity_days:   b.validity_days    || 365,
    alert_days:      b.alert_days       || 30,
    cert_link:       b.cert_link        || null,
    notes:           b.notes            || null,
  };
  const { data, error } = await supabase.from('certificates').insert(payload).select().single();
  if (error) return fail(res, 400, error.message);
  // Sync asset inspection fields
  await supabase.from('assets').update({
    last_inspection: payload.last_inspection,
    inspection_type: payload.inspection_type,
    cert_link:       payload.cert_link,
  }).eq('asset_id', b.asset_id);
  return ok(res, data, 201);
});

certRouter.put('/:id', requireRole(['Admin', 'Asset Manager', 'Editor']), async (req, res) => {
  const b = req.body;
  const { data, error } = await supabase.from('certificates').update({
    inspection_type: b.inspection_type,
    last_inspection: b.last_inspection || null,
    next_inspection: b.next_inspection || null,
    validity_days:   b.validity_days   || 365,
    alert_days:      b.alert_days      || 30,
    cert_link:       b.cert_link       || null,
    notes:           b.notes           || null,
  }).eq('cert_id', req.params.id).select().single();
  if (error) return fail(res, 400, error.message);
  return ok(res, data);
});

certRouter.delete('/:id', requireRole(['Admin', 'Asset Manager']), async (req, res) => {
  const { error } = await supabase.from('certificates').delete().eq('cert_id', req.params.id);
  if (error) return fail(res, 400, error.message);
  return ok(res, { deleted: req.params.id });
});

// ════════════════════════════════════════════════════════════════════════════════
//  BOM Router
// ════════════════════════════════════════════════════════════════════════════════
const { Router: BRouter } = require('express');
const bomRouter = BRouter();

bomRouter.get('/', async (req, res) => {
  const { asset_id, type, search } = req.query;
  let q = supabase.from('bom_items').select('*').order('id');
  if (asset_id) q = q.eq('asset_id', asset_id);
  if (type)     q = q.eq('type', type);
  if (search)   q = q.or(`name.ilike.%${search}%,part_no.ilike.%${search}%,serial.ilike.%${search}%`);
  const { data, error } = await q;
  if (error) return fail(res, 500, error.message);
  return ok(res, data);
});

bomRouter.get('/:id', async (req, res) => {
  const { data, error } = await supabase.from('bom_items').select('*').eq('id', req.params.id).single();
  if (error) return fail(res, 404, 'BOM item not found');
  return ok(res, data);
});

bomRouter.post('/', requireRole(['Admin', 'Asset Manager', 'Editor']), async (req, res) => {
  const b = req.body;
  if (!b.asset_id || !b.name || !b.type) return fail(res, 400, 'asset_id, name, type required');
  const { count } = await supabase.from('bom_items').select('id', { count: 'exact', head: true });
  const payload = {
    id:           b.id           || `BOM-${String((count || 0) + 1).padStart(3, '0')}`,
    asset_id:     b.asset_id,
    parent_id:    b.parent_id    || null,
    name:         b.name,
    part_no:      b.part_no      || null,
    type:         b.type,
    serial:       b.serial       || null,
    manufacturer: b.manufacturer || null,
    qty:          b.qty          || 1,
    uom:          b.uom          || 'EA',
    unit_cost:    b.unit_cost    || 0,
    lead_time:    b.lead_time    || 0,
    status:       b.status       || 'Active',
    notes:        b.notes        || null,
  };
  const { data, error } = await supabase.from('bom_items').insert(payload).select().single();
  if (error) return fail(res, 400, error.message);
  return ok(res, data, 201);
});

bomRouter.put('/:id', requireRole(['Admin', 'Asset Manager', 'Editor']), async (req, res) => {
  const b = req.body;
  const { data, error } = await supabase.from('bom_items').update({
    parent_id:    b.parent_id    || null,
    name:         b.name,
    part_no:      b.part_no      || null,
    type:         b.type,
    serial:       b.serial       || null,
    manufacturer: b.manufacturer || null,
    qty:          b.qty          || 1,
    uom:          b.uom          || 'EA',
    unit_cost:    b.unit_cost    || 0,
    lead_time:    b.lead_time    || 0,
    status:       b.status       || 'Active',
    notes:        b.notes        || null,
  }).eq('id', req.params.id).select().single();
  if (error) return fail(res, 400, error.message);
  return ok(res, data);
});

bomRouter.delete('/:id', requireRole(['Admin', 'Asset Manager']), async (req, res) => {
  const { error } = await supabase.from('bom_items').delete().eq('id', req.params.id);
  if (error) return fail(res, 400, error.message);
  return ok(res, { deleted: req.params.id });
});

// ════════════════════════════════════════════════════════════════════════════════
//  Companies Router
// ════════════════════════════════════════════════════════════════════════════════
const { Router: CoRouter } = require('express');
const companiesRouter = CoRouter();

companiesRouter.get('/', async (req, res) => {
  const { data, error } = await supabase.from('companies').select('*').order('name');
  if (error) return fail(res, 500, error.message);
  // Join contract count
  const { data: contracts } = await supabase.from('contracts').select('company, status');
  const countMap = {};
  (contracts || []).forEach(c => { countMap[c.company] = (countMap[c.company] || 0) + 1; });
  const enriched = data.map(co => ({ ...co, contract_count: countMap[co.name] || 0 }));
  return ok(res, enriched);
});

companiesRouter.get('/:id', async (req, res) => {
  const { data, error } = await supabase.from('companies').select('*').eq('id', req.params.id).single();
  if (error) return fail(res, 404, 'Company not found');
  return ok(res, data);
});

companiesRouter.post('/', requireRole(['Admin']), async (req, res) => {
  const b = req.body;
  if (!b.id || !b.name) return fail(res, 400, 'id and name are required');
  const { data, error } = await supabase.from('companies').insert(b).select().single();
  if (error) return fail(res, 400, error.message);
  return ok(res, data, 201);
});

companiesRouter.put('/:id', requireRole(['Admin']), async (req, res) => {
  const { data, error } = await supabase.from('companies').update(req.body).eq('id', req.params.id).select().single();
  if (error) return fail(res, 400, error.message);
  return ok(res, data);
});

companiesRouter.delete('/:id', requireRole(['Admin']), async (req, res) => {
  const { error } = await supabase.from('companies').delete().eq('id', req.params.id);
  if (error) return fail(res, 400, error.message);
  return ok(res, { deleted: req.params.id });
});

// ════════════════════════════════════════════════════════════════════════════════
//  Rigs Router
// ════════════════════════════════════════════════════════════════════════════════
const { Router: RRouter } = require('express');
const rigsRouter = RRouter();

rigsRouter.get('/', async (req, res) => {
  const { status, company } = req.query;
  let q = supabase.from('rigs').select('*').order('name');
  if (status)  q = q.eq('status', status);
  if (company) q = q.eq('company', company);
  const { data, error } = await q;
  if (error) return fail(res, 500, error.message);
  // Append asset count per rig
  const { data: assets } = await supabase.from('assets').select('rig_name');
  const assetCount = {};
  (assets || []).forEach(a => { if (a.rig_name) assetCount[a.rig_name] = (assetCount[a.rig_name] || 0) + 1; });
  return ok(res, data.map(r => ({ ...r, asset_count: assetCount[r.name] || 0 })));
});

rigsRouter.get('/:id', async (req, res) => {
  const [rigRes, assetRes] = await Promise.all([
    supabase.from('rigs').select('*').eq('id', req.params.id).single(),
    supabase.from('v_asset_summary').select('*').eq('rig_name', req.params.id),
  ]);
  if (rigRes.error) return fail(res, 404, 'Rig not found');
  return ok(res, { ...rigRes.data, assets: assetRes.data || [] });
});

rigsRouter.post('/', requireRole(['Admin']), async (req, res) => {
  const { data, error } = await supabase.from('rigs').insert(req.body).select().single();
  if (error) return fail(res, 400, error.message);
  return ok(res, data, 201);
});

rigsRouter.put('/:id', requireRole(['Admin']), async (req, res) => {
  const { data, error } = await supabase.from('rigs').update(req.body).eq('id', req.params.id).select().single();
  if (error) return fail(res, 400, error.message);
  return ok(res, data);
});

rigsRouter.delete('/:id', requireRole(['Admin']), async (req, res) => {
  const { error } = await supabase.from('rigs').delete().eq('id', req.params.id);
  if (error) return fail(res, 400, error.message);
  return ok(res, { deleted: req.params.id });
});

// ════════════════════════════════════════════════════════════════════════════════
//  Contracts Router
// ════════════════════════════════════════════════════════════════════════════════
const { Router: ConRouter } = require('express');
const contractsRouter = ConRouter();

contractsRouter.get('/', async (req, res) => {
  const { status, company, search } = req.query;
  let q = supabase.from('contracts').select('*').order('start_date', { ascending: false });
  if (status)  q = q.eq('status', status);
  if (company) q = q.eq('company', company);
  if (search)  q = q.or(`id.ilike.%${search}%,company.ilike.%${search}%,rig.ilike.%${search}%`);
  const { data, error } = await q;
  if (error) return fail(res, 500, error.message);
  // Attach asset count from junction
  const { data: ca } = await supabase.from('contract_assets').select('contract_id');
  const aCount = {};
  (ca || []).forEach(r => { aCount[r.contract_id] = (aCount[r.contract_id] || 0) + 1; });
  return ok(res, data.map(c => ({ ...c, asset_count: aCount[c.id] || 0 })));
});

contractsRouter.get('/:id', async (req, res) => {
  const [con, assets] = await Promise.all([
    supabase.from('contracts').select('*').eq('id', req.params.id).single(),
    supabase.from('contract_assets').select('asset_id, assets(*)').eq('contract_id', req.params.id),
  ]);
  if (con.error) return fail(res, 404, 'Contract not found');
  return ok(res, { ...con.data, assets: (assets.data || []).map(r => r.assets) });
});

contractsRouter.post('/', requireRole(['Admin', 'Asset Manager']), async (req, res) => {
  const b = req.body;
  const payload = {
    id:         b.id,
    company:    b.company,
    rig:        b.rig        || null,
    value:      b.value      || 0,
    start_date: b.start_date || null,
    end_date:   b.end_date   || null,
    status:     b.status     || 'Pending',
  };
  const { data, error } = await supabase.from('contracts').insert(payload).select().single();
  if (error) return fail(res, 400, error.message);
  // Link assets if provided
  if (Array.isArray(b.asset_ids) && b.asset_ids.length) {
    const rows = b.asset_ids.map(aid => ({ contract_id: data.id, asset_id: aid }));
    await supabase.from('contract_assets').insert(rows);
  }
  return ok(res, data, 201);
});

contractsRouter.put('/:id', requireRole(['Admin', 'Asset Manager']), async (req, res) => {
  const b = req.body;
  const { data, error } = await supabase.from('contracts').update({
    company:    b.company,
    rig:        b.rig        || null,
    value:      b.value      || 0,
    start_date: b.start_date || null,
    end_date:   b.end_date   || null,
    status:     b.status,
  }).eq('id', req.params.id).select().single();
  if (error) return fail(res, 400, error.message);
  return ok(res, data);
});

contractsRouter.delete('/:id', requireRole(['Admin']), async (req, res) => {
  const { error } = await supabase.from('contracts').delete().eq('id', req.params.id);
  if (error) return fail(res, 400, error.message);
  return ok(res, { deleted: req.params.id });
});

// ════════════════════════════════════════════════════════════════════════════════
//  Users Router
// ════════════════════════════════════════════════════════════════════════════════
const { Router: URouter } = require('express');
const usersRouter = URouter();

usersRouter.get('/', async (req, res) => {
  const { data, error } = await supabase.from('app_users').select('*').order('name');
  if (error) return fail(res, 500, error.message);
  return ok(res, data);
});

usersRouter.post('/', requireRole(['Admin']), async (req, res) => {
  const b = req.body;
  if (!b.name || !b.email) return fail(res, 400, 'name and email are required');
  const { data, error } = await supabase.from('app_users').insert({
    name:     b.name,
    role:     b.role     || 'Viewer',
    dept:     b.dept     || null,
    email:    b.email,
    color:    b.color    || '#0070F2',
    initials: b.initials || b.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2),
  }).select().single();
  if (error) return fail(res, 400, error.message);
  return ok(res, data, 201);
});

usersRouter.put('/:id', requireRole(['Admin']), async (req, res) => {
  const { data, error } = await supabase.from('app_users').update(req.body).eq('id', req.params.id).select().single();
  if (error) return fail(res, 400, error.message);
  return ok(res, data);
});

usersRouter.delete('/:id', requireRole(['Admin']), async (req, res) => {
  const { error } = await supabase.from('app_users').delete().eq('id', req.params.id);
  if (error) return fail(res, 400, error.message);
  return ok(res, { deleted: req.params.id });
});

// ════════════════════════════════════════════════════════════════════════════════
//  Notifications Router
// ════════════════════════════════════════════════════════════════════════════════
const { Router: NRouter } = require('express');
const notifRouter = NRouter();

notifRouter.get('/', async (req, res) => {
  const { user_id, is_read } = req.query;
  let q = supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(50);
  if (user_id)                     q = q.eq('user_id', user_id);
  if (is_read !== undefined)       q = q.eq('is_read', is_read === 'true');
  const { data, error } = await q;
  if (error) return fail(res, 500, error.message);
  return ok(res, data);
});

notifRouter.patch('/:id/read', async (req, res) => {
  const { data, error } = await supabase.from('notifications').update({ is_read: true }).eq('id', req.params.id).select().single();
  if (error) return fail(res, 400, error.message);
  return ok(res, data);
});

notifRouter.patch('/mark-all-read', async (req, res) => {
  const { error } = await supabase.from('notifications').update({ is_read: true }).eq('is_read', false);
  if (error) return fail(res, 400, error.message);
  return ok(res, { message: 'All notifications marked as read' });
});

notifRouter.post('/', async (req, res) => {
  const b = req.body;
  const { data, error } = await supabase.from('notifications').insert({
    user_id:     b.user_id     || null,
    icon:        b.icon        || 'fas fa-info-circle',
    kind:        b.kind        || 'info',
    title:       b.title,
    description: b.description || null,
    time_label:  b.time_label  || 'Just now',
    is_read:     false,
  }).select().single();
  if (error) return fail(res, 400, error.message);
  return ok(res, data, 201);
});

// ════════════════════════════════════════════════════════════════════════════════
//  Audit Log Router
// ════════════════════════════════════════════════════════════════════════════════
const { Router: ARouter } = require('express');
const auditRouter = ARouter();

auditRouter.get('/', requireRole(['Admin', 'Asset Manager']), async (req, res) => {
  const { entity_type, entity_id, page = 1, limit = 50 } = req.query;
  const from = (Math.max(1, parseInt(page)) - 1) * parseInt(limit);
  let q = supabase.from('audit_log').select('*', { count: 'exact' })
    .order('created_at', { ascending: false }).range(from, from + parseInt(limit) - 1);
  if (entity_type) q = q.eq('entity_type', entity_type);
  if (entity_id)   q = q.eq('entity_id', entity_id);
  const { data, error, count } = await q;
  if (error) return fail(res, 500, error.message);
  return ok(res, data, 200, { total: count });
});

module.exports = {
  certRouter,
  bomRouter,
  companiesRouter,
  rigsRouter,
  contractsRouter,
  usersRouter,
  notifRouter,
  auditRouter,
};
