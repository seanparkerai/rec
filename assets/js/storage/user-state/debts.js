// storage/user-state/debts.js — read-only credit-card debt (debts_credit_cards).
// User-state (§18.1); source of truth = Supabase. Extend-only addition to the
// guard-railed storage layer: a household's card balances are needed by the
// net-worth donut ("effective deposit" = liquid savings − card debt) and are
// not carried on the finances blob. Read path mirrors getInvestmentsHistory:
// direct table select, localStorage write-through cache, background revalidate.
import { _initSb, _getHid, readLocal, writeLocal } from '../core.js';

/**
 * Aggregate credit-card debt for the current household.
 * @returns {Promise<{ totalBalance:number, totalMinPayment:number,
 *   cards: Array<{ provider:string|null, balance:number, minPayment:number,
 *   paysInFull:boolean }> }>}
 */
export async function getCreditCardDebt(opts = {}) {
  const lsKey = 'debts-credit-cards';
  const cached = readLocal(lsKey);

  const fetchFresh = async () => {
    const [sb, hid] = await Promise.all([_initSb(), _getHid()]);
    if (!sb || !hid) return null;
    try {
      const { data, error } = await sb
        .from('debts_credit_cards')
        .select('provider, current_balance, minimum_monthly_payment, pays_in_full_monthly')
        .eq('household_id', hid);
      if (error) throw error;
      const cards = (data ?? []).map((r) => ({
        provider: r.provider ?? null,
        balance: Number(r.current_balance) || 0,
        minPayment: Number(r.minimum_monthly_payment) || 0,
        paysInFull: r.pays_in_full_monthly === true,
      }));
      return {
        totalBalance: cards.reduce((s, c) => s + c.balance, 0),
        totalMinPayment: cards.reduce((s, c) => s + c.minPayment, 0),
        cards,
      };
    } catch (e) {
      console.error('storage: read debts_credit_cards', e.message);
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
  return fresh ?? { totalBalance: 0, totalMinPayment: 0, cards: [] };
}
