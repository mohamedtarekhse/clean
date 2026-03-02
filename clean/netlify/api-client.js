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
    const url = `${BASE_URL}${path}`;
    const res = await fetch(url, {
      ...options,
      headers: {
        'Content-Type':  'application/json',
        'x-api-key':     API_KEY,
        'x-user-role':   window.__currentUserRole  || 'Admin',
        'x-user-name':   window.__currentUserName  || 'System',
        ...(options.headers || {}),
      },
    });

    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.error || `HTTP ${res.status}`);
    }
    return json;
  }

  // ── Convenience methods ───────────────────────────────────────────────────
  const get    = (path, params = {}) => {
    const qs = new URLSearchParams(params).toString();
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
      list:    (params = {}) => get('/api/assets', params),
      summary: ()            => get('/api/assets/summary'),
      get:     (id)          => get(`/api/assets/${id}`),
      create:  (body)        => post('/api/assets', body),
      update:  (id, body)    => put(`/api/assets/${id}`, body),
      patch:   (id, body)    => patch(`/api/assets/${id}`, body),
      delete:  (id)          => del(`/api/assets/${id}`),
      import:  (arr)         => post('/api/assets/import', arr),
    },

    // Maintenance
    maintenance: {
      list:     (params = {}) => get('/api/maintenance', params),
      alerts:   ()            => get('/api/maintenance/alerts'),
      get:      (id)          => get(`/api/maintenance/${id}`),
      create:   (body)        => post('/api/maintenance', body),
      update:   (id, body)    => put(`/api/maintenance/${id}`, body),
      delete:   (id)          => del(`/api/maintenance/${id}`),
      complete: (id, body)    => post(`/api/maintenance/${id}/complete`, body),
      logs:     (id)          => get(`/api/maintenance/${id}/logs`),
    },

    // Transfers
    transfers: {
      list:    (params = {}) => get('/api/transfers', params),
      kpis:    ()            => get('/api/transfers/kpis'),
      get:     (id)          => get(`/api/transfers/${id}`),
      create:  (body)        => post('/api/transfers', body),
      approve: (id, body)    => post(`/api/transfers/${id}/approve`, body),
      delete:  (id)          => del(`/api/transfers/${id}`),
    },

    // Certificates
    certificates: {
      list:    (params = {}) => get('/api/certificates', params),
      summary: ()            => get('/api/certificates/summary'),
      get:     (id)          => get(`/api/certificates/${id}`),
      create:  (body)        => post('/api/certificates', body),
      update:  (id, body)    => put(`/api/certificates/${id}`, body),
      delete:  (id)          => del(`/api/certificates/${id}`),
    },

    // BOM
    bom: {
      list:   (params = {}) => get('/api/bom', params),
      get:    (id)          => get(`/api/bom/${id}`),
      create: (body)        => post('/api/bom', body),
      update: (id, body)    => put(`/api/bom/${id}`, body),
      delete: (id)          => del(`/api/bom/${id}`),
    },

    // Companies
    companies: {
      list:   ()         => get('/api/companies'),
      get:    (id)       => get(`/api/companies/${id}`),
      create: (body)     => post('/api/companies', body),
      update: (id, body) => put(`/api/companies/${id}`, body),
      delete: (id)       => del(`/api/companies/${id}`),
    },

    // Rigs
    rigs: {
      list:   (params = {}) => get('/api/rigs', params),
      get:    (id)          => get(`/api/rigs/${id}`),
      create: (body)        => post('/api/rigs', body),
      update: (id, body)    => put(`/api/rigs/${id}`, body),
      delete: (id)          => del(`/api/rigs/${id}`),
    },

    // Contracts
    contracts: {
      list:   (params = {}) => get('/api/contracts', params),
      get:    (id)          => get(`/api/contracts/${id}`),
      create: (body)        => post('/api/contracts', body),
      update: (id, body)    => put(`/api/contracts/${id}`, body),
      delete: (id)          => del(`/api/contracts/${id}`),
    },

    // Users
    users: {
      list:   ()         => get('/api/users'),
      create: (body)     => post('/api/users', body),
      update: (id, body) => put(`/api/users/${id}`, body),
      delete: (id)       => del(`/api/users/${id}`),
    },

    // Notifications
    notifications: {
      list:       (params = {}) => get('/api/notifications', params),
      markRead:   (id)          => patch(`/api/notifications/${id}/read`),
      markAllRead:()            => patch('/api/notifications/mark-all-read'),
      create:     (body)        => post('/api/notifications', body),
    },

    // Audit log
    audit: {
      list: (params = {}) => get('/api/audit', params),
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
