// finances/calc-outlay.js (REFACTOR P9): upfront cash outlay - total + 3-group breakdown.
// Split verbatim from finances.js; computeOutlayBreakdown reuses calcSDLT from calc-purchase.
import { calcSDLT } from './calc-purchase.js';

/**
 * Estimate total cash outlay at purchase: deposit + SDLT + one-time costs.
 * @param {object} args
 * @param {number} args.deposit
 * @param {number} args.sdlt
 * @param {Array<{cost:number}>} [args.oneTimeCosts]
 * @returns {{deposit:number, sdlt:number, otherCosts:number, total:number}}
 */
export function totalInitialOutlay({ deposit = 0, sdlt = 0, oneTimeCosts = [] }) {
  const otherCosts = oneTimeCosts.reduce((sum, c) => sum + (Number(c.cost) || 0), 0);
  // SDLT may already be in oneTimeCosts — caller's responsibility to avoid double-counting.
  return {
    deposit,
    sdlt,
    otherCosts,
    total: deposit + sdlt + otherCosts,
  };
}

/**
 * Three-group outlay breakdown derived from itemised oneTimeCosts (each item
 * requires a `category` field) and the shoppingList.
 *
 * Groups:
 *   corePurchase   = targetDeposit + SDLT + legalCosts (removal + contingency included)
 *   furnishing     = shoppingList total
 *   majorPurchases = transport category items (e.g. car)
 *
 * @returns {{ sdlt, legalCosts, corePurchase, furnishing, majorPurchases, grandTotal }}
 */
export function computeOutlayBreakdown({
  targetDeposit = 0, offerTarget = 0, firstTimeBuyer = true,
  oneTimeCosts = [], shoppingList = [],
} = {}) {
  const sdlt = calcSDLT(offerTarget, { firstTimeBuyer });
  const byCat = (cat) =>
    (oneTimeCosts || []).filter((c) => c.category === cat)
      .reduce((s, c) => s + (Number(c.cost) || 0), 0);
  const legalCosts     = byCat('legal') + byCat('removal') + byCat('contingency');
  const majorPurchases = byCat('transport');
  const furnishing     = (shoppingList || []).reduce((s, c) => s + (Number(c.cost) || 0), 0);
  const corePurchase   = targetDeposit + sdlt + legalCosts;
  const grandTotal     = corePurchase + furnishing + majorPurchases;
  return { sdlt, legalCosts, corePurchase, furnishing, majorPurchases, grandTotal };
}
