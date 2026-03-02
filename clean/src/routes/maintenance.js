/**
 * Maintenance Router
 * GET    /api/maintenance              — list schedules (computed live_status via view)
 * GET    /api/maintenance/alerts       — overdue + due-soon summary
 * GET    /api/maintenance/:id          — single schedule with logs
 * POST   /api/maintenance              — create schedule
 * PUT    /api/maintenance/:id          — update schedule
 * DELETE /api/maintenance/:id          — delete
 * POST   /api/maintenance/:id/complete — log a completion
 * GET    /api/maintenance/:id/logs     — completion history
 */
const { Router } = require('express');
const supabase   = require('../config/supabase');
const { ok, fail } = require('../utils/response');
const { requireRole } = require('../middleware/auth');

const router = Router();

// ── LIST ─────────────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  const { search, status, type, asset_id, rig_name, priority, page = 1, limit = 100 } = req.query;
  const pageNum  = Math.max(1, parseInt(page));
  const pageSize = Math.min(500, Math.max(1, parseInt(limit)));
  const from     = (pageNum - 1) * pageSize;
  const to       = from + pageSize - 1;

  let query = supabase.from('v_maintenance').select('*', { count: 'exact' });

  if (search)   query = query.or(`task.ilike.%${search}%,asset_id.ilike.%${search}%,asset_name.ilike.%${search}%`);
  if (status)   query = query.eq('live_status', status);
  if (type)     query = query.eq('type', type);
  if (asset_id) query = query.eq('asset_id', asset_id);
  if (rig_name) query = query.eq('rig_name', rig_name);
  if (priority) query = query.eq('priority', priority);

  // Default sort: overdue first, then by next_due
  query = query.order('next_due', { ascending: true }).range(from, to);

  const { data, error, count } = await query;
  if (error) return fail(res, 500, error.message);

  return ok(res, data, 200, {
    pagination: { page: pageNum, limit: pageSize, total: count, pages: Math.ceil(count / pageSize) },
  });
});

// ── ALERTS SUMMARY ───────────────────────────────────────────────────────────
router.get('/alerts', async (req, res) => {
  const { data, error } = await supabase.from('v_maintenance').select('*');
  if (error) return fail(res, 500, error.message);

  const overdue  = data.filter(m => m.live_status === 'Overdue');
  const dueSoon  = data.filter(m => m.live_status === 'Due Soon');
  const inProg   = data.filter(m => m.live_status === 'In Progress');

  return ok(res, {
    overdue_count:  overdue.length,
    due_soon_count: dueSoon.length,
    in_progress_count: inProg.length,
    overdue,
    due_soon: dueSoon,
  });
});

// ── SINGLE ────────────────────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  const [sched, logs] = await Promise.all([
    supabase.from('v_maintenance').select('*').eq('id', req.params.id).single(),
    supabase.from('maintenance_logs').select('*').eq('schedule_id', req.params.id).order('completion_date', { ascending: false }),
  ]);
  if (sched.error) return fail(res, 404, `Schedule ${req.params.id} not found`);
  return ok(res, { ...sched.data, logs: logs.data || [] });
});

// ── CREATE ────────────────────────────────────────────────────────────────────
router.post('/', requireRole(['Admin', 'Asset Manager', 'Editor']), async (req, res) => {
  const b = req.body;
  if (!b.asset_id || !b.task || !b.next_due) {
    return fail(res, 400, 'asset_id, task, and next_due are required');
  }

  const payload = {
    id:         b.id         || `PM-${Date.now()}`,
    asset_id:   b.asset_id,
    task:       b.task,
    type:       b.type       || 'Inspection',
    priority:   b.priority   || 'Normal',
    freq:       b.freq       || 90,
    last_done:  b.last_done  || null,
    next_due:   b.next_due,
    tech:       b.tech       || null,
    hours:      b.hours      || null,
    cost:       b.cost       || null,
    status:     b.status     || 'Scheduled',
    alert_days: b.alert_days || 14,
    notes:      b.notes      || null,
  };

  const { data, error } = await supabase.from('maintenance_schedules').insert(payload).select().single();
  if (error) return fail(res, 400, error.message);
  return ok(res, data, 201);
});

// ── UPDATE ────────────────────────────────────────────────────────────────────
router.put('/:id', requireRole(['Admin', 'Asset Manager', 'Editor']), async (req, res) => {
  const b = req.body;
  const payload = {
    asset_id:   b.asset_id,
    task:       b.task,
    type:       b.type       || 'Inspection',
    priority:   b.priority   || 'Normal',
    freq:       b.freq       || 90,
    last_done:  b.last_done  || null,
    next_due:   b.next_due,
    tech:       b.tech       || null,
    hours:      b.hours      || null,
    cost:       b.cost       || null,
    status:     b.status     || 'Scheduled',
    alert_days: b.alert_days || 14,
    notes:      b.notes      || null,
  };

  const { data, error } = await supabase.from('maintenance_schedules').update(payload).eq('id', req.params.id).select().single();
  if (error) return fail(res, 400, error.message);
  return ok(res, data);
});

// ── DELETE ────────────────────────────────────────────────────────────────────
router.delete('/:id', requireRole(['Admin', 'Asset Manager']), async (req, res) => {
  const { error } = await supabase.from('maintenance_schedules').delete().eq('id', req.params.id);
  if (error) return fail(res, 400, error.message);
  return ok(res, { deleted: req.params.id });
});

// ── LOG COMPLETION (mark complete + reschedule) ───────────────────────────────
router.post('/:id/complete', requireRole(['Admin', 'Asset Manager', 'Editor']), async (req, res) => {
  const b = req.body;
  if (!b.completion_date || !b.performed_by) {
    return fail(res, 400, 'completion_date and performed_by are required');
  }

  // Get existing schedule
  const { data: sched, error: se } = await supabase
    .from('maintenance_schedules').select('*').eq('id', req.params.id).single();
  if (se) return fail(res, 404, `Schedule ${req.params.id} not found`);

  // Compute new next_due date
  const completedDate = new Date(b.completion_date);
  const nextDue = b.next_due_override
    ? b.next_due_override
    : new Date(completedDate.getTime() + sched.freq * 86400000).toISOString().slice(0, 10);

  // Insert log entry
  const logPayload = {
    schedule_id:     req.params.id,
    completion_date: b.completion_date,
    performed_by:    b.performed_by,
    hours:           b.hours     || null,
    cost:            b.cost      || null,
    parts_used:      b.parts_used|| null,
    notes:           b.notes     || null,
  };
  await supabase.from('maintenance_logs').insert(logPayload);

  // Update schedule: set last_done, next_due, reset status
  const { data, error } = await supabase
    .from('maintenance_schedules')
    .update({ last_done: b.completion_date, next_due: nextDue, status: 'Scheduled' })
    .eq('id', req.params.id)
    .select()
    .single();

  if (error) return fail(res, 400, error.message);

  // Push notification
  await supabase.from('notifications').insert({
    kind:        'success',
    icon:        'fas fa-check-circle',
    title:       'Maintenance Completed',
    description: `${sched.task} completed by ${b.performed_by}. Next due: ${nextDue}`,
    time_label:  'Just now',
    is_read:     false,
  });

  return ok(res, { schedule: data, log: logPayload });
});

// ── LOG HISTORY ───────────────────────────────────────────────────────────────
router.get('/:id/logs', async (req, res) => {
  const { data, error } = await supabase
    .from('maintenance_logs').select('*').eq('schedule_id', req.params.id)
    .order('completion_date', { ascending: false });
  if (error) return fail(res, 500, error.message);
  return ok(res, data);
});

module.exports = router;
