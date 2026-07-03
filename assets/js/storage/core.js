// storage/core.js (REFACTOR P8): shared storage infrastructure split from storage.js.
// localStorage cache, Supabase bootstrap + cached household_id, toast, _sbGet/_sbUpsert,
// the _get/_save read pattern, _normShortlist, auth helpers (getCurrentUser/signOut), _internal.
// Siblings import the helpers exported at the foot; storage.js re-exports the 3 public names.
import { loadJSON } from '../data-loader.js';
import { STORAGE_NS } from '../config.js';

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
    // Test seam (overhaul step 2.2): the integration tier injects the
    // fixture-backed mock client (tests/mocks/supabase-client.js) so the REAL
    // storage read/write paths run under Node with no network. Never set in
    // the browser app; the dynamic import below stays the production path.
    if (globalThis.__REC_TEST_SB__) {
      _sb = globalThis.__REC_TEST_SB__;
      return _sb;
    }
    try {
      const mod = await import('../supabase-client.js');
      _sb = mod.supabase;
    } catch {
      _sb = undefined; // not configured yet
    }
    return _sb;
  })();
  return _sbInitP;
}

// Test-only: drop the cached client/household/init-promise so each integration
// test can inject a fresh fixture client. No production caller.
export function _resetStorageForTests() { _sb = null; _hid = null; _sbInitP = null; }

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
// Boot is also the first retry window for journalled offline writes (9.2) —
// drainPendingWrites is hoisted (function declaration below).
_initSb().then((sb) => {
  if (!sb) return;
  sb.auth.onAuthStateChange(() => { _hid = null; });
  drainPendingWrites();
});

// ── Toast (minimal, CSS-classless, non-intrusive) ─────────────────────
// Appends a small banner to the page; respects prefers-reduced-motion.
let _toastEl = null;
function _toast(msg, isError = false) {
  if (typeof document === 'undefined') return; // Node (test tier) — nothing to render into
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

// ── Pending-write journal (overhaul 9.1 / R2a) ────────────────────────
// A failed upsert leaves the newest value only in the localStorage cache.
// Without a record of that, the next _get() revalidation would overwrite the
// cache with the stale Supabase row — silently reverting the user's edit on
// screen. The journal remembers which tables have an unconfirmed write
// (latest value per table — blob semantics), so revalidation holds off until
// the write lands. Draining the journal (retry) is step 9.2.
const PENDING_KEY = 'pending-writes';
function readPendingWrites() { return readLocal(PENDING_KEY) ?? {}; }
function _journalPendingWrite(table, value) {
  const p = readPendingWrites();
  p[table] = { value, queuedAt: new Date().toISOString() };
  writeLocal(PENDING_KEY, p);
}
function _clearPendingWrite(table) {
  const p = readPendingWrites();
  if (!(table in p)) return;
  delete p[table];
  writeLocal(PENDING_KEY, p);
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
  if (!sb) return; // no backend configured (fresh install) — nothing to sync to
  if (!hid) { _journalPendingWrite(table, value); return; } // offline / session hiccup — hold the write
  try {
    const { error } = await sb
      .from(table)
      .upsert(
        { household_id: hid, data: value, updated_at: new Date().toISOString() },
        { onConflict: 'household_id' }
      );
    if (error) throw error;
    _clearPendingWrite(table); // a newer write for this table just landed
  } catch (e) {
    _journalPendingWrite(table, value);
    console.error(`storage: write ${table}`, e.message);
    _toast(`Sync error (${table}): ${e.message}`, true);
  }
}

// ── Pending-write drain (overhaul 9.2 / R2b) ──────────────────────────
// Retries every journalled write: on boot (below) and when the browser comes
// back online. _sbUpsert itself is the verifier — success clears the table's
// journal entry, failure re-journals it — so "journal empty afterwards" IS the
// ack. (A deep-equal re-read would false-mismatch: Postgres jsonb does not
// preserve key order.) Single-flight so boot + online can't drain concurrently;
// the per-table re-read of the journal picks up any newer value a user edit
// journalled mid-drain (latest per table wins — blob semantics).
let _drainP = null;
function drainPendingWrites() {
  if (_drainP) return _drainP;
  _drainP = (async () => {
    try {
      const tables = Object.keys(readPendingWrites());
      for (const table of tables) {
        const entry = readPendingWrites()[table];
        if (entry) await _sbUpsert(table, entry.value);
      }
      const remaining = Object.keys(readPendingWrites()).length;
      if (tables.length && remaining === 0) _toast('Offline changes synced.');
      else if (remaining > 0) _toast(`${remaining} unsaved change${remaining === 1 ? '' : 's'} — will retry when back online.`, true);
      return { attempted: tables.length, remaining };
    } finally { _drainP = null; }
  })();
  return _drainP;
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => { drainPendingWrites(); });
}

// ── Read pattern ──────────────────────────────────────────────────────
// Resolution order (per CLAUDE.md §18: Supabase is source of truth for user state):
//   1. localStorage cache — returned immediately, revalidated against Supabase in background.
//   2. Supabase row       — awaited synchronously on first visit (no cache yet).
//   3. JSON seed file     — used only when both cache and Supabase are empty (true first install).
//                           Written to cache so the JSON file is never re-read after first use.
//
// onUpdate(fresh) fires when background revalidation finds a divergent Supabase row,
// so consumers can re-render with fresh data without a page reload.
async function _get(lsKey, table, fallbackJson, onUpdate) {
  const cached = readLocal(lsKey);

  if (cached !== null) {
    // Fast path. Kick off revalidation; return cache immediately.
    _sbGet(table).then((fresh) => {
      if (fresh === null) return;
      // An unconfirmed local write means the server row is the STALE side —
      // overwriting the cache here would silently revert the user's edit (9.1).
      if (readPendingWrites()[table]) return;
      if (JSON.stringify(fresh) !== JSON.stringify(cached)) {
        writeLocal(lsKey, fresh);
        if (onUpdate) onUpdate(fresh);
      }
    }).catch(() => { /* ignore */ });
    return cached;
  }

  // No cache. Try Supabase synchronously.
  const fresh = await _sbGet(table);
  if (fresh !== null) {
    writeLocal(lsKey, fresh);
    return fresh;
  }

  // Neither cache nor Supabase has data. Seed from the JSON file (one-time only —
  // we write it into the cache so this branch only runs on the true first install).
  if (fallbackJson) {
    const seed = await loadJSON(fallbackJson);
    if (seed) writeLocal(lsKey, seed);
    return seed;
  }

  return null;
}

async function _save(lsKey, table, value) {
  writeLocal(lsKey, value);
  _sbUpsert(table, value); // fire-and-forget; errors logged + toasted
  return true;
}

function _normShortlist(raw) {
  if (Array.isArray(raw)) return { ids: raw.filter((x) => typeof x === 'string'), status: {}, ratings: {} };
  if (raw && typeof raw === 'object') {
    return {
      ids: Array.isArray(raw.ids) ? raw.ids.filter((x) => typeof x === 'string') : [],
      status: (raw.status && typeof raw.status === 'object') ? raw.status : {},
      ratings: (raw.ratings && typeof raw.ratings === 'object') ? raw.ratings : {},
    };
  }
  return { ids: [], status: {}, ratings: {} };
}
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
// ── _internal — preserved for page-journey.js compatibility ──────────
// writeLocal is enhanced: for 'journey-checks', also syncs to Supabase.
const _writeLocalEnhanced = (k, v) => {
  writeLocal(k, v);
  if (k === 'journey-checks') _sbUpsert('journey_checks', v);
  return true;
};

export const _internal = { key, readLocal, writeLocal: _writeLocalEnhanced, removeLocal, readPendingWrites };

// hasRealUserData — true only when a blob is a populated, non-sample row.
// A fresh household with no Supabase row gets the redacted `_SAMPLE` fixture
// seeded into cache by _get(); callers use this to tell "real data" apart from
// that placeholder (profile data-guard, wizard resume path). See CLAUDE.md §18.
export const hasRealUserData = (b) => !!b && !b._SAMPLE;

// Internal helpers shared with sibling storage modules (not part of the public surface).
export { readLocal, writeLocal, removeLocal, _initSb, _getHid, _toast, _sbGet, _sbUpsert, _get, _save, _normShortlist, readPendingWrites, _journalPendingWrite, _clearPendingWrite, drainPendingWrites };
