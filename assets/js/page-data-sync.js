import { url, STORAGE_NS } from './config.js';
import { byId, on } from './dom.js';

// ── Supabase bootstrap ─────────────────────────────────────────────
let supabase = null;
let householdId = null;

async function initSupabase() {
  if (supabase !== null) return supabase;
  try {
    const mod = await import('./supabase-client.js');
    supabase = mod.supabase;
  } catch {
    supabase = undefined;
  }
  return supabase;
}

async function getHouseholdId() {
  if (householdId) return householdId;
  const sb = await initSupabase();
  if (!sb) return null;
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return null;
  const { data } = await sb
    .from('household_members')
    .select('household_id')
    .eq('user_id', session.user.id)
    .limit(1);
  householdId = data?.[0]?.household_id ?? null;
  return householdId;
}

async function requireAuth() {
  const sb = await initSupabase();
  if (!sb) { alert('Supabase is not configured. Generate credentials in section 05 below.'); return false; }
  const { data: { session } } = await sb.auth.getSession();
  if (!session) { alert('Not logged in. Sign in via the login page first.'); return false; }
  const hid = await getHouseholdId();
  if (!hid) { alert('No household found. Generate the member SQL in section 05 and run it in Supabase.'); return false; }
  return true;
}

// ── Log helpers ────────────────────────────────────────────────────
function logLine(el, msg, type = 'info') {
  el.classList.add('visible');
  const span = document.createElement('span');
  span.className = `sync-log-line ${type}`;
  span.textContent = msg;
  el.appendChild(span);
  el.scrollTop = el.scrollHeight;
}
function clearLog(el) { el.innerHTML = ''; el.classList.remove('visible'); }

// ── localStorage reader (mirrors storage.js key scheme) ───────────
function readLocal(lsKey) {
  try { const v = localStorage.getItem(`${STORAGE_NS}:${lsKey}`); return v ? JSON.parse(v) : null; }
  catch { return null; }
}

// ── Deep equality (key-order-insensitive) ─────────────────────────
function sortJson(v) {
  if (Array.isArray(v)) return v.map(sortJson);
  if (v !== null && typeof v === 'object') {
    return Object.fromEntries(Object.keys(v).sort().map(k => [k, sortJson(v[k])]));
  }
  return v;
}
function jsonEq(a, b) { return JSON.stringify(sortJson(a)) === JSON.stringify(sortJson(b)); }

// Produce a flat list of {path, local, sb, type} for every differing leaf.
function diffData(a, b, prefix, depth) {
  prefix = prefix || '';
  depth  = depth  || 0;
  const diffs = [];

  const fmt = (v) => {
    if (v === null || v === undefined) return String(v);
    if (Array.isArray(v)) return `[${v.length} item${v.length !== 1 ? 's' : ''}]`;
    if (typeof v === 'object') return '{…}';
    const s = JSON.stringify(v);
    return s.length > 60 ? s.slice(0, 57) + '…' : s;
  };

  if (Array.isArray(a) || Array.isArray(b)) {
    if (!jsonEq(a, b))
      diffs.push({ path: prefix || '(root)', local: fmt(a), sb: fmt(b), type: 'change' });
    return diffs;
  }
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') {
    if (!jsonEq(a, b))
      diffs.push({ path: prefix || '(root)', local: fmt(a), sb: fmt(b), type: 'change' });
    return diffs;
  }
  const allKeys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of [...allKeys].sort()) {
    const p = prefix ? `${prefix}.${k}` : k;
    if (!(k in b))        { diffs.push({ path: p, local: fmt(a[k]), sb: '(missing)', type: 'remove' }); }
    else if (!(k in a))   { diffs.push({ path: p, local: '(missing)', sb: fmt(b[k]), type: 'add' }); }
    else if (!jsonEq(a[k], b[k])) {
      if (depth < 2 && typeof a[k] === 'object' && !Array.isArray(a[k]) && a[k] !== null
                     && typeof b[k] === 'object' && !Array.isArray(b[k]) && b[k] !== null) {
        diffs.push(...diffData(a[k], b[k], p, depth + 1));
      } else {
        diffs.push({ path: p, local: fmt(a[k]), sb: fmt(b[k]), type: 'change' });
      }
    }
  }
  return diffs;
}

function formatTs(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

// ── Copy button helper ────────────────────────────────────────────
function wireCopyBtn(btn, getContent) {
  btn?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(getContent());
      btn.textContent = 'Copied';
      btn.classList.add('copied');
      setTimeout(() => { btn.textContent = 'Copy'; btn.classList.remove('copied'); }, 2500);
    } catch { btn.textContent = 'Select & copy manually'; }
  });
}

// ── Status tiles ───────────────────────────────────────────────────
const ALL_TABLES = [
  'profile', 'criteria', 'finances', 'shortlist', 'zones', 'journey_checks',
  'contacts', 'outreach', 'goals', 'readiness_checklist',
  'investments_accounts', 'investments_history',
  'debts_credit_cards', 'debts_student_loans', 'debts_other',
];

async function refreshStatus() {
  const sb = await initSupabase();
  const setAll = (text, cls) => {
    ALL_TABLES.forEach(t => {
      const el = byId(`status-${t}`);
      if (el) { el.textContent = text; el.className = `sync-status-tile-val ${cls}`; }
    });
  };
  if (!sb) { setAll('no Supabase', 'none'); return; }
  const { data: { session } } = await sb.auth.getSession();
  if (!session) { setAll('not logged in', 'none'); return; }
  const hid = await getHouseholdId();
  if (!hid) { setAll('no household', 'none'); return; }

  await Promise.all(ALL_TABLES.map(async table => {
    const el = byId(`status-${table}`);
    if (!el) return;
    const { data, error } = await sb
      .from(table)
      .select('updated_at')
      .eq('household_id', hid)
      .limit(1);
    if (error || !data?.length) {
      el.textContent = 'no data';
      el.className = 'sync-status-tile-val none';
    } else {
      el.textContent = new Date(data[0].updated_at).toLocaleString('en-GB', {
        day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
      });
      el.className = 'sync-status-tile-val ok';
    }
  }));
}

on(byId('btn-refresh-status'), 'click', refreshStatus);

// ── Alignment validator ───────────────────────────────────────────
// All user-state tables compared via localStorage cache vs Supabase (no repo JSON files).
const VALIDATE_LOCAL = [
  { key: 'profile',        table: 'profile',        lsKey: 'profile'        },
  { key: 'criteria',       table: 'criteria',       lsKey: 'criteria'       },
  { key: 'finances',       table: 'finances',       lsKey: 'finances'       },
  { key: 'shortlist',      table: 'shortlist',      lsKey: 'shortlist'      },
  { key: 'zones',          table: 'zones',          lsKey: 'zones'          },
  { key: 'journey_checks', table: 'journey_checks', lsKey: 'journey-checks' },
  { key: 'contacts',       table: 'contacts',       lsKey: 'contacts'       },
  { key: 'outreach',       table: 'outreach',       lsKey: 'outreach'       },
  { key: 'goals',          table: 'goals',          lsKey: 'goals'          },
  { key: 'investments_accounts', table: 'investments_accounts', lsKey: 'investments' },
];

const VALIDATE_ALL = [
  ...VALIDATE_LOCAL.map(t => ({ ...t, src: 'local' })),
];

on(byId('btn-validate'), 'click', async () => {
  if (!await requireAuth()) return;

  const resultEl = byId('align-result');
  const badgeEl  = byId('align-badge');
  const msgEl    = byId('align-msg');
  const countsEl = byId('align-counts');
  const rowsEl   = byId('align-rows');

  resultEl.classList.add('visible');
  badgeEl.className = 'align-badge';
  badgeEl.textContent = '…';
  msgEl.textContent = 'Checking all tables…';
  countsEl.textContent = '';
  rowsEl.innerHTML = '';

  const hid = await getHouseholdId();
  const results = [];

  for (const entry of VALIDATE_ALL) {
    const { key, table, src } = entry;
    let localData = null, sbData = null, sbTs = null, localErr = null, sbErr = null;

    if (src === 'file') {
      try {
        const res = await fetch(url(entry.file) + '?_=' + Date.now());
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        localData = await res.json();
      } catch (e) { localErr = e.message; }
    } else {
      try { localData = readLocal(entry.lsKey); }
      catch (e) { localErr = e.message; }
    }

    try {
      const { data, error } = await supabase
        .from(table)
        .select('data, updated_at')
        .eq('household_id', hid)
        .limit(1);
      if (error) throw new Error(error.message);
      sbData = data?.[0]?.data      ?? null;
      sbTs   = data?.[0]?.updated_at ?? null;
    } catch (e) { sbErr = e.message; }

    const srcLabel = src === 'file' ? 'Repo' : 'Browser';
    let status, detail, diffs = [];

    if (localErr)   { status = 'err';  detail = `${srcLabel} read error: ${localErr}`; }
    else if (sbErr) { status = 'err';  detail = `Supabase error: ${sbErr}`; }
    else if (localData === null && sbData === null) {
      status = src === 'file' ? 'warn' : 'ok';
      detail = src === 'file' ? 'Repo file missing — not in Supabase either.' : 'Not used yet.';
    }
    else if (sbData === null) {
      status = 'warn';
      detail = src === 'file' ? 'Not in Supabase — push to initialise.' : `${srcLabel} has data but Supabase is empty — save in the app to sync.`;
    }
    else if (localData === null) {
      status = 'warn';
      detail = src === 'file' ? 'Repo file missing; Supabase has data — pull to restore.' : `Supabase has data but nothing in browser — visit the page to populate cache.`;
    }
    else if (jsonEq(localData, sbData)) { status = 'ok'; detail = 'In sync.'; }
    else {
      diffs  = diffData(localData, sbData);
      status = 'warn';
      detail = `${diffs.length} field${diffs.length !== 1 ? 's' : ''} differ.`;
    }

    results.push({ key, table, status, detail, diffs, sbTs, src, srcLabel });

    // ── Build row ──
    const li   = document.createElement('li');
    li.className = 'align-row';

    const head = document.createElement('div');
    head.className = 'align-row-head';

    const dot      = Object.assign(document.createElement('span'), { className: `align-dot ${status}` });
    const name_    = Object.assign(document.createElement('span'), { className: 'align-row-name',   textContent: table });
    const srcTag   = Object.assign(document.createElement('span'), { className: 'align-row-src',    textContent: src === 'file' ? 'file' : 'cache' });
    const detailEl = Object.assign(document.createElement('span'), {
      className: `align-row-detail${status === 'warn' ? ' warn' : status === 'err' ? ' err' : ''}`,
      textContent: detail,
    });
    const tsEl = Object.assign(document.createElement('span'), {
      className: 'align-row-ts',
      textContent: sbTs ? formatTs(sbTs) : '',
    });

    head.append(dot, name_, srcTag, detailEl, tsEl);
    li.appendChild(head);

    // Expandable field-level diff for actual value mismatches
    if (status === 'warn' && diffs.length > 0) {
      const details_ = document.createElement('details');
      details_.className = 'align-diff';

      const summary = document.createElement('summary');
      const toggle  = Object.assign(document.createElement('span'), { className: 'align-diff-toggle', textContent: '▶' });
      summary.append(toggle, ` ${diffs.length} difference${diffs.length !== 1 ? 's' : ''} — click to inspect`);
      details_.appendChild(summary);

      const tbl = document.createElement('table');
      tbl.className = 'diff-table';
      const thead = tbl.createTHead();
      const hr    = thead.insertRow();
      ['Field', srcLabel, 'Supabase'].forEach(h => {
        const th = document.createElement('th'); th.textContent = h; hr.appendChild(th);
      });
      const tbody = tbl.createTBody();
      const MAX = 25;
      diffs.slice(0, MAX).forEach(d => {
        const tr = tbody.insertRow();
        tr.className = `diff-row--${d.type}`;
        [d.path, d.local, d.sb].forEach(v => { const td = tr.insertCell(); td.textContent = v; });
      });
      details_.appendChild(tbl);

      if (diffs.length > MAX) {
        const more = Object.assign(document.createElement('span'), {
          className: 'diff-more',
          textContent: `… and ${diffs.length - MAX} more field${diffs.length - MAX !== 1 ? 's' : ''}`,
        });
        details_.appendChild(more);
      }
      li.appendChild(details_);
    }

    rowsEl.appendChild(li);
  }

  // ── Summary ──
  const nErr   = results.filter(r => r.status === 'err').length;
  const nWarn  = results.filter(r => r.status === 'warn').length;
  const nOk    = results.filter(r => r.status === 'ok').length;
  const nEmpty = results.filter(r => r.status === 'ok' && r.detail === 'Not used yet.').length;
  const nSync  = nOk - nEmpty;
  const allOk  = nErr === 0 && nWarn === 0;

  if (allOk) {
    badgeEl.className = 'align-badge ok';
    badgeEl.textContent = 'IN SYNC';
    msgEl.textContent = 'All tables match.';
  } else if (nErr > 0 && nWarn === 0) {
    badgeEl.className = 'align-badge err';
    badgeEl.textContent = 'ERROR';
    msgEl.textContent = `${nErr} table${nErr !== 1 ? 's' : ''} could not be read.`;
  } else {
    badgeEl.className = 'align-badge warn';
    badgeEl.textContent = 'OUT OF SYNC';
    msgEl.textContent = `${nWarn} table${nWarn !== 1 ? 's' : ''} need${nWarn === 1 ? 's' : ''} attention.`;
  }

  const parts = [];
  if (nSync  > 0) parts.push(`${nSync} in sync`);
  if (nEmpty > 0) parts.push(`${nEmpty} empty`);
  if (nWarn  > 0) parts.push(`${nWarn} differ`);
  if (nErr   > 0) parts.push(`${nErr} error${nErr !== 1 ? 's' : ''}`);
  countsEl.textContent = `${results.length} tables · ${parts.join(' · ')}`;
});


// ── Push: deprecated — user state lives in Supabase only ─────────
on(byId('btn-push'), 'click', async () => {
  const log = byId('push-log');
  clearLog(log);
  logLine(log, 'Push is no longer applicable. User-state data (profile, finances, criteria, goals, contacts) lives exclusively in Supabase — there are no repo JSON files to push from. Data is written to Supabase automatically when you save in the portal.', 'info');
});

// ── Pull: Supabase → Claude Code MCP prompt ──────────────────────
const PULL_TABLES = ['profile', 'criteria', 'finances', 'goals', 'contacts'];

on(byId('btn-pull'), 'click', async () => {
  if (!await requireAuth()) return;
  const log = byId('pull-log');
  clearLog(log);
  const hid = await getHouseholdId();
  logLine(log, 'Reading from Supabase…', 'info');
  const results = {};
  let allOk = true;
  for (const key of PULL_TABLES) {
    const { data, error } = await supabase
      .from(key)
      .select('data, updated_at')
      .eq('household_id', hid)
      .limit(1);
    if (error || !data?.length) {
      logLine(log, `✗ ${key}: ${error?.message ?? 'no row found'}`, 'err');
      allOk = false;
    } else {
      results[key] = { data: data[0].data, updated_at: data[0].updated_at };
      const when = new Date(data[0].updated_at).toLocaleString('en-GB');
      logLine(log, `✓ ${key} read (updated ${when})`, 'ok');
    }
  }
  if (!allOk && Object.keys(results).length === 0) { logLine(log, 'Nothing to generate.', 'warn'); return; }
  logLine(log, 'Generating Claude Code prompt…', 'info');
  const parts = Object.entries(results).map(([key, { data, updated_at }]) =>
    `**${key}** (Supabase row, updated_at: ${updated_at}):\n\`\`\`json\n${JSON.stringify(data, null, 2)}\n\`\`\``);
  const prompt = `Read the following Supabase user-state data (fetched from the portal).
User-state data lives exclusively in Supabase — do NOT write to repo JSON files.
To update any value, use mcp__supabase__execute_sql to UPSERT the row directly.

${parts.join('\n\n')}`;
  byId('pull-prompt-content').textContent = prompt;
  byId('pull-prompt-wrap').classList.add('visible');
});


// ── Data viewer ───────────────────────────────────────────────────
const VIEWER_TABLES = [
  { table: 'profile',        label: 'Buyer profile' },
  { table: 'criteria',       label: 'Search criteria' },
  { table: 'finances',       label: 'Finances' },
  { table: 'shortlist',      label: 'Area shortlist' },
  { table: 'zones',          label: 'Map zones' },
  { table: 'journey_checks', label: 'Journey checklist' },
  { table: 'contacts',       label: 'Contacts directory' },
  { table: 'outreach',       label: 'Outreach log' },
];

function flattenToRows(obj, prefix = '') {
  const rows = [];
  if (obj === null || obj === undefined) {
    rows.push({ key: prefix || '(root)', val: null, isNull: true });
  } else if (Array.isArray(obj)) {
    rows.push({ key: prefix || '(root)', val: `[array, ${obj.length} items]`, isObj: true, raw: JSON.stringify(obj, null, 2) });
  } else if (typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) {
      const fullKey = prefix ? `${prefix}.${k}` : k;
      if (v !== null && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length <= 8 && JSON.stringify(v).length < 200) {
        rows.push(...flattenToRows(v, fullKey));
      } else if (Array.isArray(v) && v.length <= 6 && v.every(x => typeof x !== 'object')) {
        rows.push({ key: fullKey, val: JSON.stringify(v) });
      } else if (v !== null && typeof v === 'object') {
        rows.push({ key: fullKey, val: JSON.stringify(v, null, 2), isObj: true });
      } else {
        rows.push({ key: fullKey, val: v === null ? null : String(v), isNull: v === null });
      }
    }
  } else {
    rows.push({ key: prefix || '(root)', val: String(obj) });
  }
  return rows;
}

on(byId('btn-load-viewer'), 'click', async () => {
  if (!await requireAuth()) return;
  const viewerEl = byId('data-viewer');
  viewerEl.innerHTML = '<p style="font-size:var(--text-sm);color:var(--ink-muted)">Loading…</p>';
  const hid = await getHouseholdId();

  const sections = await Promise.all(VIEWER_TABLES.map(async ({ table, label }) => {
    const { data, error } = await supabase
      .from(table)
      .select('data, updated_at')
      .eq('household_id', hid)
      .limit(1);

    if (error) return { table, label, err: error.message };
    if (!data?.length) return { table, label, empty: true };

    const payload = data[0].data;
    const when    = new Date(data[0].updated_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    const rows    = flattenToRows(payload);
    return { table, label, rows, when };
  }));

  viewerEl.innerHTML = '';
  for (const { table, label, err, empty, rows, when } of sections) {
    const details = document.createElement('details');
    details.className = 'data-viewer-table';

    const meta = err ? 'error' : empty ? 'no data' : when;
    const summary = document.createElement('summary');
    const nameEl   = Object.assign(document.createElement('span'), { className: 'dv-table-name',  textContent: table });
    const labelEl  = document.createElement('span');
    labelEl.style.cssText = 'flex:1;font-weight:400;color:var(--ink-muted);font-size:var(--text-sm)';
    labelEl.textContent = label;
    const metaEl   = Object.assign(document.createElement('span'), { className: 'dv-table-meta',  textContent: meta });
    const toggleEl = Object.assign(document.createElement('span'), { className: 'dv-toggle-icon', textContent: '▶' });
    summary.append(nameEl, labelEl, metaEl, toggleEl);
    details.appendChild(summary);

    const body = document.createElement('div');
    body.className = 'dv-body';

    if (err) {
      const errP = Object.assign(document.createElement('p'), { className: 'dv-no-data' });
      errP.style.color = 'oklch(55% 0.18 25)';
      errP.textContent = `Error: ${err}`;
      body.appendChild(errP);
    } else if (empty) {
      body.innerHTML = `<p class="dv-no-data">No data in Supabase yet.</p>`;
    } else {
      const kv = document.createElement('dl');
      kv.className = 'dv-kv';
      for (const { key, val, isNull, isObj } of rows) {
        const dt = document.createElement('dt');
        dt.className = 'dv-key';
        dt.textContent = key;
        const dd = document.createElement('dd');
        dd.className = `dv-val${isNull ? ' is-null' : ''}${isObj ? ' is-obj' : ''}`;
        dd.textContent = isNull ? 'null' : val;
        kv.appendChild(dt);
        kv.appendChild(dd);
      }
      body.appendChild(kv);
    }
    details.appendChild(body);
    viewerEl.appendChild(details);
  }
});

// ── Schema checker ────────────────────────────────────────────────
const EXPECTED_TABLES = [
  'households', 'household_members',
  'profile', 'criteria', 'finances',
  'shortlist', 'zones', 'journey_checks',
  'contacts', 'outreach'
];

on(byId('btn-check-schema'), 'click', async () => {
  const sb = await initSupabase();
  if (!sb) { alert('Supabase not configured.'); return; }

  const listEl = byId('schema-list');
  listEl.innerHTML = '<p style="font-size:var(--text-sm);color:var(--ink-muted)">Checking…</p>';
  byId('schema-migration-prompt').classList.remove('visible');

  const results = await Promise.all(EXPECTED_TABLES.map(async table => {
    const { error } = await sb.from(table).select('id').limit(1);
    // Any error means the table is missing or inaccessible — don't try to
    // classify the error code since PostgREST wraps Postgres errors differently
    // across versions (42P01 vs PGRST116 vs plain 404).
    const ok = !error;
    return { table, ok, missing: !ok };
  }));

  listEl.innerHTML = '';
  const missingTables = results.filter(r => r.missing);

  for (const { table, ok, missing } of results) {
    const item = document.createElement('div');
    item.className = 'schema-item';
    const dot    = Object.assign(document.createElement('span'), { className: `schema-dot ${ok ? 'ok' : 'miss'}` });
    const name   = Object.assign(document.createElement('span'), { className: 'schema-item-name',              textContent: table });
    const status = Object.assign(document.createElement('span'), { className: `schema-item-status ${ok ? 'ok' : 'miss'}`, textContent: ok ? 'exists' : 'missing' });
    item.append(dot, name, status);
    listEl.appendChild(item);
  }

  if (missingTables.length) {
    const preEl = byId('schema-migration-content');
    preEl.textContent = 'Fetching supabase/schema.sql…';
    byId('schema-migration-prompt').classList.add('visible');
    try {
      const res = await fetch(url('supabase/schema.sql') + '?_=' + Date.now());
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const sql = await res.text();
      const header =
        `-- rec schema migration\n` +
        `-- Missing tables: ${missingTables.map(r => r.table).join(', ')}\n` +
        `-- Paste this entire block into Supabase → SQL Editor and Run.\n` +
        `-- The file is idempotent — safe to re-run on an existing project.\n\n`;
      preEl.textContent = header + sql;
    } catch (e) {
      preEl.textContent =
        `-- Could not load supabase/schema.sql (${e.message}).\n` +
        `-- Fetch it manually from the repo at supabase/schema.sql and paste here.\n` +
        `-- Missing tables: ${missingTables.map(r => r.table).join(', ')}`;
    }
  }
});


// ── Config: credential file generator ────────────────────────────
on(byId('btn-gen-client'), 'click', () => {
  const rawUrl = byId('input-sb-url').value.trim();
  const key    = byId('input-sb-key').value.trim();
  if (!rawUrl || !key) { alert('Enter both the Project URL and the anon key first.'); return; }
  const sbUrl  = rawUrl.replace(/\/$/, '');
  const content = `import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = '${sbUrl}';
const SUPABASE_ANON_KEY = '${key}';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
`;
  byId('gen-client-content').textContent = content;
  byId('gen-client-wrap').classList.add('visible');
});


// ── Config: member SQL generator ──────────────────────────────────
const rowsWrap = byId('member-rows');

function updateRemoveButtons() {
  const rows = rowsWrap.querySelectorAll('.member-row');
  rows.forEach(r => {
    const btn = r.querySelector('.btn-remove-member');
    if (btn) btn.style.display = rows.length > 1 ? '' : 'none';
  });
}

on(byId('btn-add-member'), 'click', () => {
  const idx = rowsWrap.querySelectorAll('.member-row').length;
  const row = document.createElement('div');
  row.className = 'member-row';
  row.dataset.row = idx;
  row.innerHTML = `
    <div>
      <label>Name (for reference)</label>
      <input type="text" placeholder="e.g. Alex" class="member-name" />
    </div>
    <div>
      <label>Supabase UID</label>
      <input type="text" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" class="member-uid" spellcheck="false" />
    </div>
    <div style="padding-bottom:0">
      <label>&nbsp;</label>
      <button type="button" class="outline secondary btn-remove-member">Remove</button>
    </div>`;
  row.querySelector('.btn-remove-member').addEventListener('click', () => {
    row.remove();
    updateRemoveButtons();
  });
  rowsWrap.appendChild(row);
  updateRemoveButtons();
});

on(byId('btn-gen-member-sql'), 'click', () => {
  const rows  = rowsWrap.querySelectorAll('.member-row');
  const entries = [];
  rows.forEach(r => {
    const uid = r.querySelector('.member-uid').value.trim();
    if (uid) entries.push(uid);
  });
  if (!entries.length) { alert('Enter at least one Supabase UID.'); return; }
  const sql = `DO $$
DECLARE
  v_household_id uuid;
BEGIN
  SELECT id INTO v_household_id FROM households LIMIT 1;

${entries.map(uid =>
  `  INSERT INTO household_members (household_id, user_id)\n  VALUES (v_household_id, '${uid}')\n  ON CONFLICT (household_id, user_id) DO NOTHING;`
).join('\n\n')}
END;
$$;`;
  byId('gen-member-content').textContent = sql;
  byId('gen-member-wrap').classList.add('visible');
});


// ── Fetch listings (§03) ──────────────────────────────────────────
const GH_PAT_KEY = 'rec:gh-pat';
const GH_REPO    = 'seanparkerai/rec';
const GH_WF_FILE = 'fetch-listings.yml';
const GH_REF     = 'main';

function loadGhPat()  { try { return localStorage.getItem(GH_PAT_KEY) || ''; } catch { return ''; } }
function saveGhPat(t) { try { localStorage.setItem(GH_PAT_KEY, t); } catch {} }
function clearGhPat() { try { localStorage.removeItem(GH_PAT_KEY); } catch {} }

function renderTokenBar() {
  const pat = loadGhPat();
  const inputRow     = byId('fetch-token-input-row');
  const connectedRow = byId('fetch-token-connected');
  const hint         = document.querySelector('.fetch-token-hint');
  if (pat) {
    if (inputRow)     inputRow.hidden     = true;
    if (connectedRow) connectedRow.hidden = false;
    if (hint)         hint.hidden         = true;
  } else {
    if (inputRow)     inputRow.hidden     = false;
    if (connectedRow) connectedRow.hidden = true;
    if (hint)         hint.hidden         = false;
  }
}

on(byId('btn-save-token'), 'click', () => {
  const val = (byId('input-gh-token')?.value || '').trim();
  if (!val.startsWith('ghp_') && !val.startsWith('github_pat_')) {
    alert('Enter a valid GitHub PAT (starts with ghp_ or github_pat_).');
    return;
  }
  saveGhPat(val);
  byId('input-gh-token').value = '';
  renderTokenBar();
});

on(byId('btn-clear-token'), 'click', () => {
  clearGhPat();
  renderTokenBar();
});

function fetchLog(msg, type = 'info') {
  const log = byId('fetch-log');
  if (!log) return;
  log.classList.add('visible');
  const span = document.createElement('span');
  span.className = `fetch-log-line ${type}`;
  span.textContent = msg;
  log.appendChild(span);
  log.scrollTop = log.scrollHeight;
}

async function triggerWorkflow(foundationMode, dryRun) {
  const pat = loadGhPat();
  if (!pat) { alert('Save a GitHub PAT first (§03 above).'); return; }
  const url = `https://api.github.com/repos/${GH_REPO}/actions/workflows/${GH_WF_FILE}/dispatches`;
  const body = {
    ref: GH_REF,
    inputs: {
      dry_run:         String(dryRun),
      foundation_mode: String(foundationMode),
    },
  };
  fetchLog(`Triggering ${foundationMode ? 'foundation' : 'daily'} fetch (dry_run=${dryRun})…`, 'info');
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${pat}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: JSON.stringify(body),
    });
    if (res.status === 204) {
      fetchLog('Workflow dispatched. Check GitHub Actions for progress.', 'ok');
    } else {
      const text = await res.text().catch(() => res.status);
      fetchLog(`GitHub API error ${res.status}: ${text}`, 'err');
    }
  } catch (e) {
    fetchLog(`Network error: ${e.message}`, 'err');
  }
}

// ── Daily fetch dialog ────────────────────────────────────────────
const dailyDialog = /** @type {HTMLDialogElement|null} */ (byId('dialog-fetch-daily'));

on(byId('btn-fetch-daily'), 'click', () => {
  if (!loadGhPat()) { alert('Save a GitHub PAT first (§03 above).'); return; }
  dailyDialog?.showModal();
});
on(byId('btn-dialog-daily-cancel'),  'click', () => dailyDialog?.close());
on(byId('btn-dialog-daily-confirm'), 'click', () => {
  dailyDialog?.close();
  triggerWorkflow(false, false);
});
dailyDialog?.addEventListener('click', (e) => { if (e.target === dailyDialog) dailyDialog.close(); });

// ── Foundation dry-run (no dialog — just dispatch with dry_run=true) ─
on(byId('btn-fetch-foundation-dry'), 'click', () => {
  if (!loadGhPat()) { alert('Save a GitHub PAT first (§03 above).'); return; }
  triggerWorkflow(true, true);
});

// ── Foundation live dialog ────────────────────────────────────────
const foundationDialog = /** @type {HTMLDialogElement|null} */ (byId('dialog-fetch-foundation-live'));
const ackCheck         = /** @type {HTMLInputElement|null}  */ (byId('chk-foundation-ack'));
const confirmBtn       = byId('btn-dialog-foundation-confirm');

on(byId('btn-fetch-foundation-live'), 'click', () => {
  if (!loadGhPat()) { alert('Save a GitHub PAT first (§03 above).'); return; }
  if (ackCheck) ackCheck.checked = false;
  if (confirmBtn) confirmBtn.disabled = true;
  foundationDialog?.showModal();
});
ackCheck?.addEventListener('change', () => {
  if (confirmBtn) confirmBtn.disabled = !ackCheck?.checked;
});
on(byId('btn-dialog-foundation-cancel'),  'click', () => foundationDialog?.close());
on(byId('btn-dialog-foundation-confirm'), 'click', () => {
  foundationDialog?.close();
  triggerWorkflow(true, false);
});
foundationDialog?.addEventListener('click', (e) => { if (e.target === foundationDialog) foundationDialog.close(); });

// ── Boot ───────────────────────────────────────────────────────────
document.addEventListener('shell:ready', async () => {
  refreshStatus();
  const sb = await initSupabase();
  if (sb) {
    sb.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION') {
        refreshStatus();
      }
    });
  }
  wireCopyBtn(
    byId('btn-copy-pull-prompt'),
    () => byId('pull-prompt-content').textContent
  );
  wireCopyBtn(
    byId('btn-copy-schema-prompt'),
    () => byId('schema-migration-content').textContent
  );
  wireCopyBtn(
    document.querySelector('[data-copy-id="gen-client-content"]'),
    () => byId('gen-client-content').textContent
  );
  wireCopyBtn(
    document.querySelector('[data-copy-id="gen-member-content"]'),
    () => byId('gen-member-content').textContent
  );
});

document.addEventListener('DOMContentLoaded', () => {
  updateRemoveButtons();
  renderTokenBar();
});
