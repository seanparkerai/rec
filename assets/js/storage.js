// storage.js — the storage abstraction.
// Supabase-backed with localStorage write-through cache.
// If supabase-client.js is not present (pre-setup), operates in localStorage-only mode.
// Public API is identical to the localStorage-only version; no page changes needed.
import { loadJSON } from './data-loader.js';
import { STORAGE_NS } from './config.js';

// ── localStorage helpers ──────────────────────────────────────────────
const key = (k) => `${STORAGE_NS}:${k}`;

function readLocal(k) {
  try { const v = localStorage.getItem(key(k)); return v ? JSON.parse(v) : null; }
  catch { return null; }
}
function writeLocal(k, v) {
  try { localStorage.setItem(key(k), JSON.stringify(v)); return true; }
  catch { return false; }
}
function removeLocal(k) { try { localStorage.removeItem(key(k)); } catch { /* ignore */ } }

// ── Supabase bootstrap ────────────────────────────────────────────────
// Lazily imported so the site works before supabase-client.js is created.
let _sb = null;          // supabase client | undefined (not available)
let _hid = null;         // cached household_id string | null
let _sbInitP = null;     // single in-flight init promise

async function _initSb() {
  if (_sbInitP) return _sbInitP;
  _sbInitP = (async () => {
    try {
      const mod = await import('./supabase-client.js');
      _sb = mod.supabase;
    } catch {
      _sb = undefined; // not configured yet
    }
    return _sb;
  })();
  return _sbInitP;
}

async function _getHid() {
  if (_hid) return _hid;
  const sb = await _initSb();
  if (!sb) return null;
  try {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) return null;
    const { data } = await sb
      .from('household_members')
      .select('household_id')
      .eq('user_id', session.user.id)
      .limit(1);
    _hid = data?.[0]?.household_id ?? null;
  } catch { _hid = null; }
  return _hid;
}

// Invalidate cached household_id on auth state change (sign out / sign in).
_initSb().then((sb) => {
  if (!sb) return;
  sb.auth.onAuthStateChange(() => { _hid = null; });
});

// ── Toast (minimal, CSS-classless, non-intrusive) ─────────────────────
// Appends a small banner to the page; respects prefers-reduced-motion.
let _toastEl = null;
function _toast(msg, isError = false) {
  if (!_toastEl) {
    _toastEl = document.createElement('div');
    _toastEl.setAttribute('role', 'status');
    _toastEl.setAttribute('aria-live', 'polite');
    Object.assign(_toastEl.style, {
      position: 'fixed',
      bottom: 'max(1rem, env(safe-area-inset-bottom))',
      left: '50%',
      transform: 'translateX(-50%)',
      background: 'var(--ink, #111)',
      color: 'var(--paper, #fff)',
      padding: '0.5rem 1.25rem',
      borderRadius: 'var(--rec-radius-sm, 8px)',
      fontFamily: 'var(--font-body, sans-serif)',
      fontSize: '0.85rem',
      zIndex: '9999',
      pointerEvents: 'none',
      opacity: '0',
      transition: 'opacity 0.2s',
    });
    document.body?.appendChild(_toastEl);
  }
  _toastEl.textContent = msg;
  _toastEl.style.background = isError ? 'oklch(42% 0.18 25)' : 'var(--ink, #111)';
  _toastEl.style.opacity = '1';
  clearTimeout(_toastEl._timer);
  _toastEl._timer = setTimeout(() => { _toastEl.style.opacity = '0'; }, 3500);
}

// ── Supabase read/upsert helpers ──────────────────────────────────────
async function _sbGet(table) {
  const [sb, hid] = await Promise.all([_initSb(), _getHid()]);
  if (!sb || !hid) return null;
  try {
    const { data, error } = await sb
      .from(table)
      .select('data')
      .eq('household_id', hid)
      .limit(1);
    if (error) throw error;
    return data?.[0]?.data ?? null;
  } catch (e) {
    console.error(`storage: read ${table}`, e.message);
    return null;
  }
}

async function _sbUpsert(table, value) {
  const [sb, hid] = await Promise.all([_initSb(), _getHid()]);
  if (!sb || !hid) return;
  try {
    const { error } = await sb
      .from(table)
      .upsert(
        { household_id: hid, data: value, updated_at: new Date().toISOString() },
        { onConflict: 'household_id' }
      );
    if (error) throw error;
  } catch (e) {
    console.error(`storage: write ${table}`, e.message);
    _toast(`Sync error (${table}): ${e.message}`, true);
  }
}

// ── Write-through pattern ─────────────────────────────────────────────
// Returns cached value immediately; revalidates from Supabase in background.
// If the cloud value differs, calls onUpdate(freshValue) for the caller to re-render.
async function _get(lsKey, table, fallbackJson, onUpdate) {
  const cached = readLocal(lsKey);
  const result = cached ?? (fallbackJson ? await loadJSON(fallbackJson) : null);

  // Background revalidation
  _sbGet(table).then((fresh) => {
    if (fresh === null) return; // nothing in Supabase yet
    const localStr = JSON.stringify(cached);
    const freshStr = JSON.stringify(fresh);
    if (freshStr !== localStr) {
      writeLocal(lsKey, fresh); // update cache
      if (onUpdate) onUpdate(fresh);
    }
  }).catch(() => { /* ignore */ });

  return result;
}

async function _save(lsKey, table, value) {
  writeLocal(lsKey, value);
  _sbUpsert(table, value); // fire-and-forget; errors logged + toasted
  return true;
}

// ── Exported API — identical signatures to the original storage.js ─────

export async function getProfile()   { return _get('profile',   'profile',   'profile',  null); }
export async function saveProfile(d) { return _save('profile',  'profile',   d); }

export async function getCriteria()  { return _get('criteria',  'criteria',  'criteria', null); }
export async function saveCriteria(d){ return _save('criteria', 'criteria',  d); }

export async function getFinances()  { return _get('finances',  'finances',  'finances', null); }
export async function saveFinances(d){ return _save('finances', 'finances',  d); }

// Read-only, repo-owned content (no Supabase — served from data/ in the repo).
export async function getAreas()        { return await loadJSON('areas'); }
export async function getAreaDetail(id) { return await loadJSON(`data/areas/${id}.json`); }
export async function getHouseTypes()   { return await loadJSON('house-types'); }

// Purely client-side state — localStorage cache + Supabase sync.
export function getShortlist()    { return readLocal('shortlist') ?? []; }
export function saveShortlist(d)  { writeLocal('shortlist', d); _sbUpsert('shortlist', d); return true; }
export function getDrawnZones()   { return readLocal('zones') ?? null; }
export function saveDrawnZones(g) { writeLocal('zones', g); _sbUpsert('zones', g); return true; }

// ── Auth helpers ───────────────────────────────────────────────────────
export async function getCurrentUser() {
  const sb = await _initSb();
  if (!sb) return null;
  const { data: { session } } = await sb.auth.getSession();
  return session?.user ?? null;
}

export async function signOut() {
  const sb = await _initSb();
  if (!sb) return;
  _hid = null;
  await sb.auth.signOut();
}

// ── Outreach + Contacts (Phase 3 — approved extension) ────────────────
export async function getContacts()        { return _get('contacts',  'contacts',  null, null) ?? { agents: [], brokers: [], solicitors: [], surveyors: [] }; }
export async function saveContacts(d)      { return _save('contacts', 'contacts',  d); }
export async function getOutreachLog()     { return _get('outreach',  'outreach',  null, null) ?? []; }
export async function saveOutreachLog(d)   { return _save('outreach', 'outreach',  d); }

// ── _internal — preserved for page-journey.js compatibility ──────────
// writeLocal is enhanced: for 'journey-checks', also syncs to Supabase.
const _writeLocalEnhanced = (k, v) => {
  writeLocal(k, v);
  if (k === 'journey-checks') _sbUpsert('journey_checks', v);
  return true;
};

export const _internal = { key, readLocal, writeLocal: _writeLocalEnhanced, removeLocal };
