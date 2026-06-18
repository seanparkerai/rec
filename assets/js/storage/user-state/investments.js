// storage/user-state/investments.js — investments account (investments_accounts)
// read/write + derived history. Split from storage/user-state.js.
import { _get, _save, _initSb, _getHid, _toast, readLocal, writeLocal } from '../core.js';

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

// v3 — investments account WRITE (user-state, §18.1; source of truth = Supabase).
// Updates the household's investments_accounts row IN PLACE: the jsonb `data` blob
// is replaced with the passed trading212ISA object — so callers MUST pass the full
// merged blob (holdings / strategyEpochs / snapshot preserved), not a bare patch —
// and the scalar current_value / earmark_pct mirror columns are kept in step.
// Accepts the same { trading212ISA } shape getInvestments() returns. Write-through:
// localStorage is updated immediately so consumers re-render from the new figure,
// then the row is updated in Supabase (fire-and-forget, like _save).
export async function saveInvestments(value) {
  writeLocal('investments', value);
  const isa = value?.trading212ISA || {};
  const [sb, hid] = await Promise.all([_initSb(), _getHid()]);
  if (!sb || !hid) return true;
  try {
    const patch = { data: isa, updated_at: new Date().toISOString() };
    if (isa.currentPortfolioValue !== undefined) patch.current_value = Number(isa.currentPortfolioValue) || 0;
    if (isa.earmarkPct !== undefined) patch.earmark_pct = Number(isa.earmarkPct) || 0;
    const { error } = await sb
      .from('investments_accounts')
      .update(patch)
      .eq('household_id', hid);
    if (error) throw error;
  } catch (e) {
    console.error('storage: write investments_accounts', e.message);
    _toast(`Sync error (investments): ${e.message}`, true);
  }
  return true;
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
