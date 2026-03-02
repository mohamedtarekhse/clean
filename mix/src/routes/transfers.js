/**
 * Transfers Router
 * GET    /api/transfers              — list
 * GET    /api/transfers/kpis         — count by status
 * GET    /api/transfers/:id          — single with timeline
 * POST   /api/transfers              — create request
 * POST   /api/transfers/:id/approve  — ops/mgr approval decision
 * DELETE /api/transfers/:id          — cancel (Admin only)
 */
const { Router } = require('express');
const supabase   = require('../config/supabase');
const { ok, fail } = require('../utils/response');
const { requireRole } = require('../middleware/auth');

const router = Router();

// ── LIST ─────────────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  const { search, status, priority, page = 1, limit = 50 } = req.query;
  const pageNum  = Math.max(1, parseInt(page));
  const pageSize = Math.min(200, Math.max(1, parseInt(limit)));
  const from     = (pageNum - 1) * pageSize;

  let query = supabase.from('transfers').select('*', { count: 'exact' })
    .order('request_date', { ascending: false })
    .range(from, from + pageSize - 1);

  if (search)   query = query.or(`asset_name.ilike.%${search}%,id.ilike.%${search}%,destination.ilike.%${search}%`);
  if (status)   query = query.eq('status', status);
  if (priority) query = query.eq('priority', priority);

  const { data, error, count } = await query;
  if (error) return fail(res, 500, error.message);
  return ok(res, data, 200, {
    pagination: { page: pageNum, limit: pageSize, total: count, pages: Math.ceil(count / pageSize) },
  });
});

// ── KPI COUNTS ────────────────────────────────────────────────────────────────
router.get('/kpis', async (req, res) => {
  const { data, error } = await supabase.from('transfers').select('status');
  if (error) return fail(res, 500, error.message);
  const kpi = data.reduce((acc, t) => { acc[t.status] = (acc[t.status] || 0) + 1; return acc; }, {});
  return ok(res, { total: data.length, ...kpi });
});

// ── SINGLE ────────────────────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  const { data, error } = await supabase.from('transfers').select('*').eq('id', req.params.id).single();
  if (error) return fail(res, 404, `Transfer ${req.params.id} not found`);
  return ok(res, data);
});

// ── CREATE ────────────────────────────────────────────────────────────────────
router.post('/', requireRole(['Admin', 'Asset Manager', 'Editor']), async (req, res) => {
  const b = req.body;
  if (!b.asset_id || !b.destination || !b.reason) {
    return fail(res, 400, 'asset_id, destination, and reason are required');
  }

  // Get asset snapshot
  const { data: asset } = await supabase.from('assets').select('name,location').eq('asset_id', b.asset_id).single();

  // Generate sequential ID
  const { count } = await supabase.from('transfers').select('id', { count: 'exact', head: true });
  const newId = `TR-${String((count || 0) + 1).padStart(3, '0')}`;

  const payload = {
    id:            newId,
    asset_id:      b.asset_id,
    asset_name:    asset?.name || b.asset_id,
    current_loc:   asset?.location || b.current_loc || null,
    destination:   b.destination,
    dest_rig:      b.dest_rig      || null,
    dest_company:  b.dest_company  || null,
    priority:      b.priority      || 'Normal',
    type:          b.type          || 'Field to Field',
    requested_by:  b.requested_by  || req.headers['x-user-name'] || 'System',
    request_date:  b.request_date  || new Date().toISOString().slice(0, 10),
    required_date: b.required_date || null,
    reason:        b.reason,
    instructions:  b.instructions  || null,
    status:        'Pending',
  };

  const { data, error } = await supabase.from('transfers').insert(payload).select().single();
  if (error) return fail(res, 400, error.message);

  // Notification
  await supabase.from('notifications').insert({
    kind: 'info', icon: 'fas fa-exchange-alt',
    title: 'Transfer Request Created',
    description: `${payload.asset_name} requested for transfer to ${payload.destination}`,
    time_label: 'Just now', is_read: false,
  });

  return ok(res, data, 201);
});

// ── APPROVAL DECISION ─────────────────────────────────────────────────────────
router.post('/:id/approve', requireRole(['Admin', 'Asset Manager', 'Editor']), async (req, res) => {
  const { id } = req.params;
  const { role, action, comment, approved_by } = req.body;

  if (!role || !action || !comment) {
    return fail(res, 400, 'role (ops|mgr), action (approve|reject|hold), and comment are required');
  }
  if (!['ops', 'mgr'].includes(role)) {
    return fail(res, 400, 'role must be "ops" or "mgr"');
  }
  if (!['approve', 'reject', 'hold'].includes(action)) {
    return fail(res, 400, 'action must be approve | reject | hold');
  }

  const { data: transfer, error: te } = await supabase.from('transfers').select('*').eq('id', id).single();
  if (te) return fail(res, 404, `Transfer ${id} not found`);

  const today       = new Date().toISOString().slice(0, 10);
  const approverName = approved_by || req.headers['x-user-name'] || 'System';
  let patch         = {};
  let newStatus     = transfer.status;

  if (role === 'ops') {
    patch = {
      ops_approved_by:   approverName,
      ops_approved_date: today,
      ops_action:        action,
      ops_comment:       comment,
    };
    newStatus = action === 'approve' ? 'Ops Approved' : action === 'reject' ? 'Rejected' : 'On Hold';
  } else {
    patch = {
      mgr_approved_by:   approverName,
      mgr_approved_date: today,
      mgr_action:        action,
      mgr_comment:       comment,
    };
    newStatus = action === 'approve' ? 'Completed' : action === 'reject' ? 'Rejected' : 'On Hold';
  }
  patch.status = newStatus;

  const { data, error } = await supabase.from('transfers').update(patch).eq('id', id).select().single();
  if (error) return fail(res, 400, error.message);

  // If fully approved: update asset location
  if (role === 'mgr' && action === 'approve') {
    const assetPatch = { location: transfer.destination };
    if (transfer.dest_rig)     assetPatch.rig_name = transfer.dest_rig;
    if (transfer.dest_company) assetPatch.company  = transfer.dest_company;
    await supabase.from('assets').update(assetPatch).eq('asset_id', transfer.asset_id);

    await supabase.from('notifications').insert({
      kind: 'success', icon: 'fas fa-check-double',
      title: 'Transfer Completed',
      description: `${transfer.asset_name} transferred to ${transfer.destination}`,
      time_label: 'Just now', is_read: false,
    });
  }

  // Audit
  await supabase.from('audit_log').insert({
    entity_type: 'transfer', entity_id: id,
    action: `${role}_${action}`,
    changed_by: approverName,
    old_data: { status: transfer.status },
    new_data: { status: newStatus },
    note: comment,
  });

  return ok(res, data);
});

// ── DELETE ────────────────────────────────────────────────────────────────────
router.delete('/:id', requireRole(['Admin']), async (req, res) => {
  const { error } = await supabase.from('transfers').delete().eq('id', req.params.id);
  if (error) return fail(res, 400, error.message);
  return ok(res, { deleted: req.params.id });
});

module.exports = router;
