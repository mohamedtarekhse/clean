/**
 * Asset Management System — API Client
 * =======================================
 * Drop this <script> into the HTML app (before the closing </body>) to
 * replace all in-memory data arrays with live calls to the Railway backend.
 *
 * Usage: add the following to your HTML after this file is loaded:
 *   <script src="api-client.js"></script>
 *
 * The file reads window.__API_CONFIG__ (injected by Netlify edge function)
 * or falls back to localStorage for local dev.
 */

(function () {
  'use strict';

  // ── Config ────────────────────────────────────────────────────────────────
  const cfg = window.__API_CONFIG__ || {};
  const BASE_URL = cfg.baseUrl
    || localStorage.getItem('api_base_url')
    || '/api';                            // uses Netlify proxy by default
  const API_KEY = cfg.apiKey
    || localStorage.getItem('api_key')
    || '';

  // ── Core fetch helper ────────────────────────────────────────────────────
  async function api(path, options = {}) {
    const base = String(BASE_URL || '').replace(/\/+$/, '');
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    const url = `${base}${normalizedPath}`;
    const res = await fetch(url, {
      ...options,
      cache: 'no-store',
      headers: {
        'Content-Type':  'application/json',
        'x-api-key':     API_KEY,
        'x-user-role':   window.__currentUserRole  || 'Admin',
        'x-user-name':   window.__currentUserName  || 'System',
        ...(options.headers || {}),
      },
    });

    const text = await res.text();
    const normalizedText = text
      .replace(/^\uFEFF/, '') // strip UTF-8 BOM when present
      .trimStart();
    let json;
    try {
      json = normalizedText ? JSON.parse(normalizedText) : {};
    } catch {
      const snippet = normalizedText.slice(0, 80);
      if (/^<!doctype html>|^<html/i.test(normalizedText)) {
        throw new Error(`API returned HTML instead of JSON (${res.status}). Check API base URL/proxy configuration.`);
      }
      throw new Error(`Invalid JSON from API (${res.status}). Response starts with: ${snippet}`);
    }

    if (!res.ok || !json.success) {
      throw new Error(json.error || `HTTP ${res.status}`);
    }
    return json;
  }

  // ── Convenience methods ───────────────────────────────────────────────────
  const get    = (path, params = {}) => {
    const query = { ...params, _ts: Date.now() };
    const qs = new URLSearchParams(query).toString();
    return api(qs ? `${path}?${qs}` : path);
  };
  const post   = (path, body)      => api(path, { method: 'POST',   body: JSON.stringify(body) });
  const put    = (path, body)      => api(path, { method: 'PUT',    body: JSON.stringify(body) });
  const patch  = (path, body)      => api(path, { method: 'PATCH',  body: JSON.stringify(body) });
  const del    = (path)            => api(path, { method: 'DELETE' });

  // ── Public API namespace ──────────────────────────────────────────────────
  window.AssetAPI = {

    // Assets
    assets: {
      list:    (params = {}) => get('/assets', params),
      summary: ()            => get('/assets/summary'),
      get:     (id)          => get(`/assets/${id}`),
      create:  (body)        => post('/assets', body),
      update:  (id, body)    => put(`/assets/${id}`, body),
      patch:   (id, body)    => patch(`/assets/${id}`, body),
      delete:  (id)          => del(`/assets/${id}`),
      import:  (arr)         => post('/assets/import', arr),
    },

    // Maintenance
    maintenance: {
      list:     (params = {}) => get('/maintenance', params),
      alerts:   ()            => get('/maintenance/alerts'),
      get:      (id)          => get(`/maintenance/${id}`),
      create:   (body)        => post('/maintenance', body),
      update:   (id, body)    => put(`/maintenance/${id}`, body),
      delete:   (id)          => del(`/maintenance/${id}`),
      complete: (id, body)    => post(`/maintenance/${id}/complete`, body),
      logs:     (id)          => get(`/maintenance/${id}/logs`),
    },

    // Transfers
    transfers: {
      list:    (params = {}) => get('/transfers', params),
      kpis:    ()            => get('/transfers/kpis'),
      get:     (id)          => get(`/transfers/${id}`),
      create:  (body)        => post('/transfers', body),
      approve: (id, body)    => post(`/transfers/${id}/approve`, body),
      delete:  (id)          => del(`/transfers/${id}`),
    },

    // Certificates
    certificates: {
      list:    (params = {}) => get('/certificates', params),
      summary: ()            => get('/certificates/summary'),
      get:     (id)          => get(`/certificates/${id}`),
      create:  (body)        => post('/certificates', body),
      update:  (id, body)    => put(`/certificates/${id}`, body),
      delete:  (id)          => del(`/certificates/${id}`),
    },

    // BOM
    bom: {
      list:   (params = {}) => get('/bom', params),
      get:    (id)          => get(`/bom/${id}`),
      create: (body)        => post('/bom', body),
      update: (id, body)    => put(`/bom/${id}`, body),
      delete: (id)          => del(`/bom/${id}`),
    },

    // Companies
    companies: {
      list:   ()         => get('/companies'),
      get:    (id)       => get(`/companies/${id}`),
      create: (body)     => post('/companies', body),
      update: (id, body) => put(`/companies/${id}`, body),
      delete: (id)       => del(`/companies/${id}`),
    },

    // Rigs
    rigs: {
      list:   (params = {}) => get('/rigs', params),
      get:    (id)          => get(`/rigs/${id}`),
      create: (body)        => post('/rigs', body),
      update: (id, body)    => put(`/rigs/${id}`, body),
      delete: (id)          => del(`/rigs/${id}`),
    },

    // Contracts
    contracts: {
      list:   (params = {}) => get('/contracts', params),
      get:    (id)          => get(`/contracts/${id}`),
      create: (body)        => post('/contracts', body),
      update: (id, body)    => put(`/contracts/${id}`, body),
      delete: (id)          => del(`/contracts/${id}`),
    },

    // Users
    users: {
      list:   ()         => get('/users'),
      create: (body)     => post('/users', body),
      update: (id, body) => put(`/users/${id}`, body),
      delete: (id)       => del(`/users/${id}`),
    },

    // Notifications
    notifications: {
      list:       (params = {}) => get('/notifications', params),
      markRead:   (id)          => patch(`/notifications/${id}/read`),
      markAllRead:()            => patch('/notifications/mark-all-read'),
      create:     (body)        => post('/notifications', body),
    },

    // Audit log
    audit: {
      list: (params = {}) => get('/audit', params),
    },
  };

  // ── Bootstrap: load all data and replace JS arrays ───────────────────────
  window.initFromAPI = async function () {
    try {
      showToast?.('Loading data from server…', 'info');

      const [assetsRes, rigsRes, companiesRes, contractsRes,
             maintRes, transfersRes, certsRes, bomRes, usersRes, notifRes] = await Promise.all([
        AssetAPI.assets.list({ limit: 500 }),
        AssetAPI.rigs.list(),
        AssetAPI.companies.list(),
        AssetAPI.contracts.list({ limit: 200 }),
        AssetAPI.maintenance.list({ limit: 500 }),
        AssetAPI.transfers.list({ limit: 200 }),
        AssetAPI.certificates.list({ limit: 500 }),
        AssetAPI.bom.list({ limit: 1000 }),
        AssetAPI.users.list(),
        AssetAPI.notifications.list(),
      ]);

      // Replace the global in-memory arrays the HTML app uses
      window.ASSETS           = assetsRes.data           || [];
      window.RIGS             = rigsRes.data             || [];
      window.COMPANIES        = companiesRes.data        || [];
      window.CONTRACTS        = contractsRes.data        || [];
      window.MAINT_SCHEDULES  = maintRes.data            || [];
      window.TRANSFERS        = transfersRes.data        || [];
      window.CERTIFICATES     = certsRes.data            || [];
      window.BOM_ITEMS        = bomRes.data              || [];
      window.USERS            = usersRes.data            || [];
      window.NOTIFICATIONS    = notifRes.data            || [];

      // Normalize field names: API uses snake_case, HTML uses camelCase
      window.ASSETS = window.ASSETS.map(a => ({
        ...a,
        assetId:         a.asset_id,
        rigName:         a.rig_name,
        acquisitionDate: a.acquisition_date,
        lastInspection:  a.last_inspection,
        inspectionType:  a.inspection_type,
        certLink:        a.cert_link,
      }));

      window.MAINT_SCHEDULES = window.MAINT_SCHEDULES.map(m => ({
        ...m,
        lastDone:  m.last_done,
        nextDue:   m.next_due,
        alertDays: m.alert_days,
        logs: [],   // lazy-loaded
      }));

      window.TRANSFERS = window.TRANSFERS.map(t => ({
        ...t,
        assetId:      t.asset_id,
        assetName:    t.asset_name,
        currentLoc:   t.current_loc,
        destRig:      t.dest_rig,
        destCompany:  t.dest_company,
        requestedBy:  t.requested_by,
        requestDate:  t.request_date,
        requiredDate: t.required_date,
        opsApproval:  {
          by: t.ops_approved_by, date: t.ops_approved_date,
          action: t.ops_action,  comment: t.ops_comment,
        },
        mgrApproval: {
          by: t.mgr_approved_by, date: t.mgr_approved_date,
          action: t.mgr_action,  comment: t.mgr_comment,
        },
      }));

      // Re-render all UI
      filteredAssets = [...window.ASSETS];
      renderAssets?.();
      renderContracts?.();
      renderRigs?.();
      renderCompanies?.();
      renderUsers?.();
      renderTransfers?.();
      renderMaintenance?.();
      renderCertificates?.();
      renderBOMSection?.();
      renderNotifications?.();
      updateKPIs?.();
      updateReportKPIs?.();
      updateCertKPIs?.();
      updateMaintKPIs?.();
      updateTransferKPIs?.();
      checkMaintAlerts?.();
      populateBomSelects?.();
      populateFormSelects?.();
      populateCompanyFilters?.();

      showToast?.('Data loaded from server ✓', 'success');
      console.log('[AssetAPI] Bootstrap complete.');
    } catch (err) {
      console.error('[AssetAPI] Bootstrap failed:', err);
      showToast?.(`API error: ${err.message}`, 'error');
    }
  };

  // Auto-init when the page is ready
  if (document.readyState === 'complete') {
    window.initFromAPI();
  } else {
    window.addEventListener('load', window.initFromAPI);
  }

  console.log('[AssetAPI] Client loaded. Base URL:', BASE_URL);
})();
