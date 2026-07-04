// finance-load.js — the ONE way a browser page gets enriched finances.
//
// Every finance-reading coordinator was re-implementing the same dance: getFinances()
// + getInvestments() + deriveFinances(finances, { investments }). Pages that forgot the
// investments arg (or skipped deriveFinances entirely, e.g. page-profile) rendered the
// deposit savings as £0 because the cross-resource ISA portion was missing. This helper
// removes that footgun: call getDerivedFinances() and you always get the same enriched
// shape the dashboard uses — savings.totalSavings = cash + earmarked ISA.
//
// Thin glue over the guard-railed storage layer (§16) + finance-derive (§16-exempt);
// it adds no new math of its own.
import { getFinances, getInvestments, getInvestmentsHistory } from './storage.js';
import { deriveFinances } from './finance-derive.js';

/**
 * Load raw finances + investments and return the enriched finances object.
 * @param {object} [opts]
 * @param {function} [opts.onUpdate] re-invoked with freshly-derived finances when the
 *        background revalidation of EITHER finances or investments changes the cache.
 * @returns {Promise<object|null>} enriched finances, or null if no finances on record.
 */
export async function getDerivedFinances(opts = {}) {
  const onUpdate = typeof opts.onUpdate === 'function' ? opts.onUpdate : null;
  let lastFin = null;
  let lastInv = null;
  let lastHist = null;
  const emit = () => {
    if (!onUpdate || !lastFin) return;
    onUpdate(deriveFinances(lastFin, { investments: lastInv, history: lastHist }));
  };
  // History feeds the LIVE savings-rate average (savings-average.js); it is
  // read-only and rarely changes mid-session, so it is not revalidated.
  const [finances, investments, history] = await Promise.all([
    getFinances(onUpdate ? { onUpdate: (f) => { lastFin = f; emit(); } } : {}),
    getInvestments(onUpdate ? { onUpdate: (i) => { lastInv = i; emit(); } } : {}),
    getInvestmentsHistory().catch(() => null),
  ]);
  lastFin = finances;
  lastInv = investments;
  lastHist = history;
  if (!finances) return null;
  return deriveFinances(finances, { investments, history });
}
