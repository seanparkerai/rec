// storage/user-state.js (REFACTOR P8): household user-state split from storage.js -
// profile/criteria/finances/goals, readiness, investments, shortlist (+status/ratings/zones).
import {
  _get, _save, _sbGet, _sbUpsert, _initSb, _getHid, _toast, readLocal, writeLocal, _normShortlist,
} from './core.js';
import { loadJSON } from '../data-loader.js';
import { isPersonalStatus } from '../listings/reactions.js';

export async function getProfile(opts = {})   { return _get('profile',   'profile',   'fixtures/profile.sample',  opts.onUpdate || null); }
export async function saveProfile(d)          { return _save('profile',  'profile',   d); }

export async function getCriteria(opts = {})  { return _get('criteria',  'criteria',  'fixtures/criteria.sample', opts.onUpdate || null); }
export async function saveCriteria(d)         { return _save('criteria', 'criteria',  d); }

export async function getFinances(opts = {})  { return _get('finances',  'finances',  'fixtures/finances.sample', opts.onUpdate || null); }
export async function saveFinances(d)         { return _save('finances', 'finances',  d); }

// v3 — goals (blob pattern)
export async function getGoals(opts = {})     { return _get('goals',     'goals',     'fixtures/goals.sample',    opts.onUpdate || null); }
export async function saveGoals(d)            { return _save('goals',    'goals',     d); }

// v3 — buying-journey progress (blob; the set of ticked task ids from
// data/journey.json). Source of truth = Supabase; no seed JSON — tick-state
// starts empty like shortlist/zones. Defaults to { tasks: {} } when absent.
export async function getJourneyProgress(opts = {}) {
  return (await _get('journey-progress', 'journey_progress', null, opts.onUpdate || null)) ?? { tasks: {} };
}
export async function saveJourneyProgress(d)  { return _save('journey-progress', 'journey_progress', d); }

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
// Shortlist follows the _get pattern (Supabase-first, localStorage write-through cache).
//
// Record shape (v3 L3): the shortlist row's `data` jsonb is normalised to
// `{ ids: string[], status: { [id]: personalStatus }, ratings: { [id]: 1..10 } }`.
// The personal-status map (new/saved/viewed/offered/rejected) and the 1–10 priority
// ratings map both live ON this existing record — they are NOT parallel state
// machines. Legacy rows stored a bare `string[]`; `_normShortlist` reads every form
// so getShortlist() keeps returning a plain id array unchanged.
export async function getShortlist(opts = {}) {
  const onUpdate = opts.onUpdate ? (rec) => opts.onUpdate(_normShortlist(rec).ids) : null;
  const rec = await _get('shortlist', 'shortlist', null, onUpdate);
  return _normShortlist(rec).ids;
}

// saveShortlist(ids) preserves the personal-status and ratings maps for ids that
// survive, so toggling the shortlist never wipes a status or rating set on the same
// record.
export function saveShortlist(ids) {
  const arr = Array.isArray(ids) ? ids.filter((x) => typeof x === 'string') : [];
  const prev = _normShortlist(readLocal('shortlist'));
  const status = {};
  const ratings = {};
  for (const id of arr) {
    if (prev.status[id]) status[id] = prev.status[id];
    if (prev.ratings[id]) ratings[id] = prev.ratings[id];
  }
  const rec = { ids: arr, status, ratings };
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
  const next = { ids: [...ids], status: map, ratings: { ...rec.ratings } };
  writeLocal('shortlist', next);
  _sbUpsert('shortlist', next);
  return true;
}

// 1–10 priority ratings map (id → integer 1..10), read from the same shortlist
// record. A rating expresses how strongly a saved listing matters; it feeds the
// fit score as a positive-only nudge (see listing-fit.js) and orders the saved view.
export async function getListingRatings(opts = {}) {
  const onUpdate = opts.onUpdate ? (rec) => opts.onUpdate(_normShortlist(rec).ratings) : null;
  const rec = await _get('shortlist', 'shortlist', null, onUpdate);
  return _normShortlist(rec).ratings;
}

// Set (or clear, when rating is null) the 1–10 rating for one id. Setting a rating
// also adds the id to the shortlist, since the rating lives on that record. Re-reads
// the freshest record first so a rating change never clobbers ids/status set on
// another device, and preserves the personal-status map untouched.
export async function setListingRating(id, rating) {
  if (!id) return false;
  let val = null;
  if (rating != null && rating !== '') {
    val = Math.round(Number(rating));
    if (!Number.isFinite(val) || val < 1 || val > 10) {
      console.error('storage: invalid listing rating', rating);
      return false;
    }
  }
  const rec = _normShortlist((await _sbGet('shortlist')) ?? readLocal('shortlist'));
  const ids = new Set(rec.ids);
  const map = { ...rec.ratings };
  if (val == null) { delete map[id]; }
  else { map[id] = val; ids.add(id); }
  const next = { ids: [...ids], status: { ...rec.status }, ratings: map };
  writeLocal('shortlist', next);
  _sbUpsert('shortlist', next);
  return true;
}
export function getDrawnZones()   { return readLocal('zones') ?? null; }
export function saveDrawnZones(g) { writeLocal('zones', g); _sbUpsert('zones', g); return true; }
