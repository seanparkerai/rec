// calc-golden-grid.test.js — step 5.1: the golden-master GRID over the pure finance
// calculators, pinned BEFORE any Phase-5 correction (A5 rate-rise sensitivity, A3
// LISA 12-month) may move a number. Where characterization-finances-calc.test.js
// pins spot values, this grid pins EVERY boundary the trust surface leans on:
//   • SDLT: every band edge ±£1 in both regimes (standard Apr-2025 bands
//     125k/250k/925k/1.5m; FTB relief 0%≤300k, 5% 300–500k, relief LOST >500k —
//     the £500,000→£500,001 cliff is exactly +£5,000). NOTE the real FTB cliffs
//     are £300k/£500k — the old plan line's "£625k cliff" was the pre-Apr-2025
//     regime (reality wins, corrected at 5.1).
//   • Mortgage: principal × rate × term grid incl. 0% straight-line and
//     fractional terms (2dp banking rounding).
//   • LTV: tier-edge values incl. the 89.95 → 90 round-half-up case (1dp).
//   • LISA: the £4,000 allowance and £450,000 property-cap edges, string coercion.
//   • Savings: progress rounding/caps, months-to-target 1dp + Infinity, projection.
//   • Outlay: category grouping incl. unknown categories and non-numeric costs.
//
// The grid is REGENERATED from the live modules on every run and diffed line-by-line
// against the committed fixture (tests/characterization/golden/calc-grid.golden.txt).
// A legitimate, owner-flagged §3.10b change regenerates the fixture DELIBERATELY in
// the same commit; anything else is a caught regression.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  calcSDLT, calcMonthlyMortgage, calcLTV, calcLISABonus, lisaEligible,
  calcDepositProgress, calcMonthsToTarget, projectSavings,
  totalInitialOutlay, computeOutlayBreakdown,
} from '../../assets/js/finances.js';

const GOLDEN = join(dirname(fileURLToPath(import.meta.url)), 'golden/calc-grid.golden.txt');

/** Serialize one value exactly; Infinity is pinned explicitly (JSON would null it). */
const S = (v) => (v === Infinity ? 'Infinity' : JSON.stringify(v));

/** Rebuild the full grid from the live calculators — same generator that wrote the fixture. */
function buildGrid() {
  const rows = [];
  const prices = [1, 50000, 124999, 125000, 125001, 249999, 250000, 250001, 299999, 300000,
    300001, 425000, 449999, 450000, 450001, 499999, 500000, 500001, 600000, 924999, 925000,
    925001, 1000000, 1499999, 1500000, 1500001, 2000000, 300000.5];
  for (const p of prices) rows.push(`sdlt.std(${p})=${S(calcSDLT(p))}`);
  for (const p of prices) rows.push(`sdlt.ftb(${p})=${S(calcSDLT(p, { firstTimeBuyer: true }))}`);
  for (const P of [90000, 200000, 297500]) {
    for (const r of [0, 3.99, 5.35, 7]) {
      for (const t of [20, 25, 30, 35]) rows.push(`mortgage(${P},${r},${t})=${S(calcMonthlyMortgage(P, r, t))}`);
    }
  }
  rows.push(`mortgage(200000,5.35,25.5)=${S(calcMonthlyMortgage(200000, 5.35, 25.5))}`);
  rows.push(`mortgage(0.01,5,25)=${S(calcMonthlyMortgage(0.01, 5, 25))}`);
  for (const [l, v] of [[359800, 400000], [359799, 400000], [359760, 400000], [240000, 400000],
    [300000, 400000], [340000, 400000], [360000, 400000], [380000, 400000], [420000, 400000],
    [100, 0], [-100, 400000]]) rows.push(`ltv(${l},${v})=${S(calcLTV(l, v))}`);
  for (const c of [-50, 0, 1, 3999.99, 4000, 4000.01, 5000, null]) rows.push(`lisaBonus(${S(c)})=${S(calcLISABonus(c))}`);
  for (const p of [0, 1, 449999, 450000, 450001, '300000', 'x']) rows.push(`lisaEligible(${S(p)})=${S(lisaEligible(p))}`);
  for (const [s, t] of [[0, 100000], [49999, 100000], [50000, 100000], [99500, 100000],
    [100000, 100000], [120000, 100000], [-500, 100000], [500, 0], [500, -1]]) {
    rows.push(`progress(${s},${t})=${S(calcDepositProgress(s, t))}`);
  }
  for (const [s, t, m] of [[50000, 100000, 5000], [50000, 100000, 3000], [99999, 100000, 3000],
    [100001, 100000, 3000], [0, 1000, 0], [0, 1000, -5], [0, 100000, 333.33]]) {
    rows.push(`months(${s},${t},${m})=${S(calcMonthsToTarget(s, t, m))}`);
  }
  rows.push(`project(1000,333.33,4)=${S(projectSavings(1000, 333.33, 4))}`);
  rows.push(`outlay.total=${S(totalInitialOutlay({ deposit: 40000, sdlt: 5000, oneTimeCosts: [{ cost: 1000 }, { cost: '750' }, { cost: 'n/a' }, {}] }))}`);
  rows.push(`outlay.breakdown.ftb400k=${S(computeOutlayBreakdown({
    targetDeposit: 40000, offerTarget: 400000, firstTimeBuyer: true,
    oneTimeCosts: [{ category: 'legal', cost: 1500 }, { category: 'removal', cost: 800 },
      { category: 'contingency', cost: 2000 }, { category: 'transport', cost: 8000 },
      { category: 'mystery', cost: 999 }],
    shoppingList: [{ cost: 2000 }, { cost: '500' }],
  }))}`);
  rows.push(`outlay.breakdown.std550k=${S(computeOutlayBreakdown({ targetDeposit: 55000, offerTarget: 550000, firstTimeBuyer: false, oneTimeCosts: [], shoppingList: [] }))}`);
  rows.push(`outlay.breakdown.empty=${S(computeOutlayBreakdown())}`);
  return rows;
}

export async function register({ test, assert, assertEqual }) {
  test('golden grid (5.1): every calculator output matches the committed fixture exactly', () => {
    const want = readFileSync(GOLDEN, 'utf8').trim().split('\n');
    const have = buildGrid();
    assertEqual(have.length, want.length,
      `grid size ${have.length} vs fixture ${want.length} — generator and fixture must move together`);
    for (let i = 0; i < want.length; i++) {
      assertEqual(have[i], want[i], `grid line ${i + 1} diverged from the golden fixture`);
    }
  });

  test('golden grid (5.1): the trust-surface anchor values hold, independent of the fixture', () => {
    // Hand-computed anchors so a corrupted fixture can't silently bless a regression.
    assertEqual(calcSDLT(500001, { firstTimeBuyer: true }) - calcSDLT(500000, { firstTimeBuyer: true }),
      5000, 'the FTB relief cliff at £500k is exactly +£5,000');
    assertEqual(calcSDLT(300001, { firstTimeBuyer: true }), 0, 'FTB 5% band rounds £0.05 to £0');
    assertEqual(calcSDLT(425000, { firstTimeBuyer: true }), 6250, 'FTB £425k = 5% of £125k');
    assertEqual(calcLTV(359800, 400000), 90, '89.95 rounds half-up to 90.0 (tier-edge behaviour)');
    assertEqual(calcLISABonus(4000.01).bonus, 1000, 'bonus never exceeds £1,000');
    assertEqual(calcMonthsToTarget(0, 1000, 0), Infinity, 'no pace → Infinity, never NaN');
  });
}
