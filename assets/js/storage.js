// storage.js — the storage abstraction.
// Supabase-backed with localStorage write-through cache.
// If supabase-client.js is not present (pre-setup), operates in localStorage-only mode.
// Public API is identical to the localStorage-only version; no page changes needed.
import { loadJSON } from './data-loader.js';
import { STORAGE_NS } from './config.js';
import { normaliseReaction, latestPerListing, isPersonalStatus } from './listing-reactions.js';

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

// ── Exported API ──────────────────────────────────────────────────────
// Each getter accepts { onUpdate } so pages can re-render when background
// revalidation pulls a divergent row from Supabase.

export async function getProfile(opts = {})   { return _get('profile',   'profile',   'fixtures/profile.sample',  opts.onUpdate || null); }
export async function saveProfile(d)          { return _save('profile',  'profile',   d); }

export async function getCriteria(opts = {})  { return _get('criteria',  'criteria',  'fixtures/criteria.sample', opts.onUpdate || null); }
export async function saveCriteria(d)         { return _save('criteria', 'criteria',  d); }

export async function getFinances(opts = {})  { return _get('finances',  'finances',  'fixtures/finances.sample', opts.onUpdate || null); }
export async function saveFinances(d)         { return _save('finances', 'finances',  d); }

// v3 — goals (blob pattern)
export async function getGoals(opts = {})     { return _get('goals',     'goals',     'fixtures/goals.sample',    opts.onUpdate || null); }
export async function saveGoals(d)            { return _save('goals',    'goals',     d); }

// v3 — readiness checklist (row-per-item; no blob).
export async function getReadinessChecklist(opts = {}) {
  const cached = readLocal('readiness');
  if (cached !== null) {
    _sbGetReadinessRows().then((fresh) => {
      if (!fresh) return;
      if (JSON.stringify(fresh) !== JSON.stringify(cached)) {
        writeLocal('readiness', fresh);
        if (opts.onUpdate) opts.onUpdate(fresh);
      }
    }).catch(() => {});
    return cached;
  }
  const fresh = await _sbGetReadinessRows();
  if (fresh && fresh.length > 0) { writeLocal('readiness', fresh); return fresh; }
  // Fallback: derive from sample fixture so the dashboard works on a fresh install.
  try {
    const goals = await loadJSON('fixtures/goals.sample');
    const items = Object.entries(goals?.readiness?.checklist ?? {}).map(([key, val]) => ({
      item_key: key, item_label: key, completed: val === true, updated_at: null,
    }));
    writeLocal('readiness', items);
    return items;
  } catch { return []; }
}

export async function saveReadinessItem({ item_key, item_label, completed }) {
  const [sb, hid] = await Promise.all([_initSb(), _getHid()]);
  if (!sb || !hid) return false;
  try {
    const { error } = await sb
      .from('readiness_checklist')
      .upsert(
        { household_id: hid, item_key, item_label: item_label ?? item_key, completed: !!completed, updated_at: new Date().toISOString() },
        { onConflict: 'household_id,item_key' }
      );
    if (error) throw error;
    // Refresh cache.
    const fresh = await _sbGetReadinessRows();
    if (fresh) writeLocal('readiness', fresh);
    return true;
  } catch (e) {
    console.error('storage: write readiness_checklist', e.message);
    _toast(`Sync error (readiness): ${e.message}`, true);
    return false;
  }
}

async function _sbGetReadinessRows() {
  const [sb, hid] = await Promise.all([_initSb(), _getHid()]);
  if (!sb || !hid) return null;
  try {
    const { data, error } = await sb
      .from('readiness_checklist')
      .select('item_key, item_label, completed, updated_at')
      .eq('household_id', hid);
    if (error) throw error;
    return data ?? [];
  } catch (e) {
    console.error('storage: read readiness_checklist', e.message);
    return null;
  }
}

// v3 — investments account (row in investments_accounts; data jsonb holds the
// legacy data/investments.json shape, exposed as { trading212ISA }).
// Cached in localStorage; revalidated in background like _get.
export async function getInvestments(opts = {}) {
  const lsKey = 'investments';
  const cached = readLocal(lsKey);
  const fetchFresh = async () => {
    const [sb, hid] = await Promise.all([_initSb(), _getHid()]);
    if (!sb || !hid) return null;
    try {
      const { data, error } = await sb
        .from('investments_accounts')
        .select('data, provider, current_value, earmark_pct, account_opened, account_type')
        .eq('household_id', hid)
        .limit(1);
      if (error) throw error;
      const row = data?.[0];
      if (!row) return null;
      // The jsonb `data` column mirrors the legacy investments.json blob; expose
      // it under trading212ISA so existing consumers (finance-derive, deposit-risk,
      // tile-*) work unchanged.
      return { trading212ISA: row.data ?? {
        provider: row.provider,
        accountType: row.account_type,
        accountOpened: row.account_opened,
        earmarkPct: Number(row.earmark_pct) || 0,
        currentPortfolioValue: Number(row.current_value) || 0,
      } };
    } catch (e) {
      console.error('storage: read investments_accounts', e.message);
      return null;
    }
  };
  if (cached !== null) {
    fetchFresh().then((fresh) => {
      if (fresh === null) return;
      if (JSON.stringify(fresh) !== JSON.stringify(cached)) {
        writeLocal(lsKey, fresh);
        if (opts.onUpdate) opts.onUpdate(fresh);
      }
    }).catch(() => {});
    return cached;
  }
  const fresh = await fetchFresh();
  if (fresh !== null) writeLocal(lsKey, fresh);
  return fresh;
}

// v3 — investments history (row-per-month; falls back to repo JSON).
// Returns the same shape as data/imports/trading212-history.json so the
// existing analysePerformance() / buildSavingsSeries() consumers don't have
// to know whether the data came from Supabase or the file.
export async function getInvestmentsHistory() {
  const [sb, hid] = await Promise.all([_initSb(), _getHid()]);
  if (sb && hid) {
    try {
      const { data, error } = await sb
        .from('investments_history')
        .select('month, deposits, withdrawals, net, dividends, interest, realised_pnl, epoch')
        .eq('household_id', hid)
        .order('month', { ascending: true });
      if (error) throw error;
      if (data && data.length > 0) {
        // Also pull strategyEpochs + holdings off the investments_accounts row so
        // consumers (getEpochAttribution, renderTickerTreemap) can resolve epoch
        // metadata and current per-ticker exposure.
        let epochs = {};
        let tickerExposure = {};
        try {
          const { data: acct } = await sb
            .from('investments_accounts')
            .select('data')
            .eq('household_id', hid)
            .limit(1);
          const acctData = acct?.[0]?.data;
          const arr = acctData?.strategyEpochs;
          if (Array.isArray(arr)) {
            for (const ep of arr) {
              if (ep?.id) epochs[ep.id] = { label: ep.label ?? ep.id, start: ep.start ?? null, end: ep.end ?? null };
            }
          }
          const holdings = acctData?.holdings;
          if (Array.isArray(holdings)) {
            for (const h of holdings) {
              if (!h?.symbol) continue;
              const value = Number(h.value) || 0;
              if (value <= 0) continue;
              tickerExposure[h.symbol] = {
                value,
                netDeployed: value,
                name: h.name ?? h.symbol,
                allocationPct: Number(h.allocationPct) || null,
                unrealisedPnl: Number(h.unrealisedPnl) || 0,
                unrealisedPnlPct: Number(h.unrealisedPnlPct) || 0,
                assetClass: h.assetClass ?? null,
              };
            }
          }
        } catch { /* non-fatal */ }
        return {
          _status: 'from-supabase',
          epochs,
          tickerExposure,
          monthlySummary: data.map((r) => ({
            month: r.month, deposits: r.deposits, withdrawals: r.withdrawals,
            net: r.net, dividends: r.dividends, interest: r.interest,
            realisedPnL: r.realised_pnl, epoch: r.epoch,
          })),
        };
      }
    } catch (e) { console.error('storage: read investments_history', e.message); }
  }
  // Fallback: stub (importer hasn't run yet; real history lives in Supabase).
  return { _status: 'awaiting Phase 3 import', monthlySummary: [], tickerExposure: {}, realisedPnL: null };
}

// Read-only, repo-owned content (no Supabase — served from data/ in the repo).
export async function getAreas()        { return await loadJSON('areas'); }
export async function getAreaDetail(id) { return await loadJSON(`data/areas/${id}.json`); }
export async function getHouseTypes()   { return await loadJSON('house-types'); }

// Shortlist follows the _get pattern (Supabase-first, localStorage write-through cache).
//
// Record shape (v3 L3): the shortlist row's `data` jsonb is normalised to
// `{ ids: string[], status: { [id]: personalStatus } }`. The personal-status map
// (new/saved/viewed/offered/rejected) lives ON this existing record — it is NOT a
// parallel state machine. Legacy rows stored a bare `string[]`; `_normShortlist`
// reads both forms so getShortlist() keeps returning a plain id array unchanged.
function _normShortlist(raw) {
  if (Array.isArray(raw)) return { ids: raw.filter((x) => typeof x === 'string'), status: {} };
  if (raw && typeof raw === 'object') {
    return {
      ids: Array.isArray(raw.ids) ? raw.ids.filter((x) => typeof x === 'string') : [],
      status: (raw.status && typeof raw.status === 'object') ? raw.status : {},
    };
  }
  return { ids: [], status: {} };
}

export async function getShortlist(opts = {}) {
  const onUpdate = opts.onUpdate ? (rec) => opts.onUpdate(_normShortlist(rec).ids) : null;
  const rec = await _get('shortlist', 'shortlist', null, onUpdate);
  return _normShortlist(rec).ids;
}

// saveShortlist(ids) preserves the personal-status map for ids that survive,
// so toggling the shortlist never wipes a status set on the same record.
export function saveShortlist(ids) {
  const arr = Array.isArray(ids) ? ids.filter((x) => typeof x === 'string') : [];
  const prev = _normShortlist(readLocal('shortlist'));
  const status = {};
  for (const id of arr) if (prev.status[id]) status[id] = prev.status[id];
  const rec = { ids: arr, status };
  writeLocal('shortlist', rec);
  _sbUpsert('shortlist', rec);
  return true;
}

// Personal-status lifecycle map (id → new/saved/viewed/offered/rejected), read
// from the same shortlist record.
export async function getShortlistStatuses(opts = {}) {
  const onUpdate = opts.onUpdate ? (rec) => opts.onUpdate(_normShortlist(rec).status) : null;
  const rec = await _get('shortlist', 'shortlist', null, onUpdate);
  return _normShortlist(rec).status;
}

// Set (or clear, when status is null/'') the personal status for one id. Setting
// a status also adds the id to the shortlist, since the status lives on that
// record. Re-reads the freshest record first so a status change never clobbers
// shortlist ids set on another device.
export async function setShortlistStatus(id, status) {
  if (!id) return false;
  if (status != null && status !== '' && !isPersonalStatus(status)) {
    console.error('storage: invalid shortlist status', status);
    return false;
  }
  const rec = _normShortlist((await _sbGet('shortlist')) ?? readLocal('shortlist'));
  const ids = new Set(rec.ids);
  const map = { ...rec.status };
  if (status == null || status === '') { delete map[id]; }
  else { map[id] = status; ids.add(id); }
  const next = { ids: [...ids], status: map };
  writeLocal('shortlist', next);
  _sbUpsert('shortlist', next);
  return true;
}
export function getDrawnZones()   { return readLocal('zones') ?? null; }
export function saveDrawnZones(g) { writeLocal('zones', g); _sbUpsert('zones', g); return true; }

// ── Reports (read-only; no localStorage cache needed) ─────────────────────
// Returns the full row (id, slug, title, data, created_at…) or null.
// Throws on Supabase error so the caller can show a retry affordance.
export async function getReport() {
  const [sb, hid] = await Promise.all([_initSb(), _getHid()]);
  if (!sb || !hid) return null;
  const { data, error } = await sb
    .from('reports')
    .select('*')
    .eq('household_id', hid)
    .eq('status', 'published')
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) throw error;
  return data?.[0] ?? null;
}

// ── Live listings (v3 L1 — fetcher-written content; public read) ──────────
// Read-only from the portal: rows are written by tools/fetch-listings.mjs via
// the service role. listings is the one fetcher-written table (live-content
// class — see docs/SUPABASE_SYNC.md), so there is no save path here.
export async function getListings({ limit = 200, status = null } = {}) {
  const sb = await _initSb();
  if (!sb) return [];
  try {
    let q = sb
      .from('listings')
      .select('rightmove_id, url, title, address, postcode, outcode, area_id, price, beds, baths, property_type, tenure, epc, council_tax, status, lat, lng, image_url, first_seen, last_seen, added_date, update_reason, price_history')
      .order('first_seen', { ascending: false })
      .limit(limit);
    if (status) q = q.eq('status', status);
    const { data, error } = await q;
    if (error) throw error;
    return data ?? [];
  } catch (e) {
    console.error('storage: read listings', e.message);
    return [];
  }
}

// ── Listing reactions (v3 L3 — append-only graded preference signal) ───────
// User-state, household-scoped. Every reaction is a new row (append-only); the
// latest row per listing is the current reaction. getListingReactions returns a
// { [listing_id]: { reaction, reason, created_at } } map of the *current*
// reaction per listing, cached + revalidated like the readiness checklist.
async function _sbGetReactionRows() {
  const [sb, hid] = await Promise.all([_initSb(), _getHid()]);
  if (!sb || !hid) return null;
  try {
    const { data, error } = await sb
      .from('listing_reactions')
      .select('listing_id, reaction, reason, created_at')
      .eq('household_id', hid)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data ?? [];
  } catch (e) {
    console.error('storage: read listing_reactions', e.message);
    return null;
  }
}

function _reactionsToMap(rows) {
  const latest = latestPerListing(rows || []);
  const obj = {};
  for (const [id, row] of latest) {
    obj[id] = { reaction: row.reaction, reason: row.reason ?? null, created_at: row.created_at };
  }
  return obj;
}

export async function getListingReactions(opts = {}) {
  const cached = readLocal('listing-reactions');
  if (cached !== null) {
    _sbGetReactionRows().then((rows) => {
      if (!rows) return;
      const fresh = _reactionsToMap(rows);
      if (JSON.stringify(fresh) !== JSON.stringify(cached)) {
        writeLocal('listing-reactions', fresh);
        if (opts.onUpdate) opts.onUpdate(fresh);
      }
    }).catch(() => {});
    return cached;
  }
  const rows = await _sbGetReactionRows();
  const map = rows ? _reactionsToMap(rows) : {};
  if (rows) writeLocal('listing-reactions', map);
  return map;
}

export async function saveListingReaction({ listing_id, reaction, reason = null, listing_snapshot = null }) {
  const norm = normaliseReaction({ listing_id, reaction, reason, listing_snapshot });
  if (!norm) { console.error('storage: invalid listing reaction', reaction); return false; }
  const [sb, hid] = await Promise.all([_initSb(), _getHid()]);
  if (!sb || !hid) return false;
  try {
    const { data: { session } } = await sb.auth.getSession();
    const { error } = await sb.from('listing_reactions').insert({
      household_id: hid,
      user_id: session?.user?.id ?? null,
      listing_id: norm.listing_id,
      reaction: norm.reaction,
      reason: norm.reason,
      listing_snapshot: norm.listing_snapshot,
    });
    if (error) throw error;
    // Optimistically refresh the current-reaction cache so the UI is instant.
    const cached = readLocal('listing-reactions') ?? {};
    cached[norm.listing_id] = { reaction: norm.reaction, reason: norm.reason, created_at: norm.created_at };
    writeLocal('listing-reactions', cached);
    return true;
  } catch (e) {
    console.error('storage: write listing_reactions', e.message);
    _toast(`Sync error (reactions): ${e.message}`, true);
    return false;
  }
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
