// tests/live-feed-stats.test.js — savings-parity for the /live-feed kiosk.
//
// The deposit-savings total is now mirrored in THREE places: the browser
// (assets/js/finance-derive.js#computeDepositSavings), the Ask edge function
// (supabase/functions/ask/pure.js — pinned by tests/ask-tools.test.js), and the
// admin RPC (public.live_feed_stats, migration live_feed_stats_admin_rpc). This
// test pins the RPC's savings ARITHMETIC against computeDepositSavings so the
// earmark logic + rounding can never silently drift.
//
// Source-of-value note (owner decision 2026-06-22): the RPC reads the ISA value
// from the scalar investments_accounts.current_value / earmark_pct columns (the
// "current latest" figure), NOT the older data->>'currentPortfolioValue' snapshot.
// `rpcSavings` below replicates that SQL; the parity assertions feed
// computeDepositSavings the SAME row, so the two formulas stay in lockstep.
//
// The live RPC values were verified via MCP on 2026-06-22 (admin-only; a non-admin
// caller raises `forbidden`): Luke £33,500.00, Suzanne £53,000.00 — asserted below.
import { computeDepositSavings } from '../../assets/js/finance-derive.js';

const round2 = (n) => Math.round(n * 100) / 100;

// Faithful JS replica of the migration's `savings` CTE (per-account earmark sum).
// financesData = finances.data ({ savings: { current } }); rows = investments_accounts
// rows ({ current_value, earmark_pct }).
function rpcSavings(financesData, rows) {
  const cash = Number(financesData?.savings?.current) || 0;
  let isa = 0;
  for (const r of rows || []) {
    const cv = Number(r.current_value) || 0;
    const ep = Number(r.earmark_pct) || 0;
    isa += ep > 0 ? round2((cv * ep) / 100) : cv;
  }
  return round2(cash + isa);
}

// Build the { trading212ISA } investments shape computeDepositSavings expects from
// a single investments_accounts row (the canonical one-ISA household shape).
const isaFromRow = (row) => (row
  ? { trading212ISA: { currentPortfolioValue: Number(row.current_value) || 0, earmarkPct: Number(row.earmark_pct) || 0 } }
  : null);

export async function register({ test, assert, assertEqual }) {
  const parity = (financesData, row, expected, label) => {
    const sql = rpcSavings(financesData, row ? [row] : []);
    const js = computeDepositSavings(financesData, isaFromRow(row));
    assertEqual(sql, js, `${label}: RPC formula vs computeDepositSavings`);
    assertEqual(sql, expected, `${label}: value`);
  };

  test('savings parity: Luke (cash £0 + ISA £33,500 @100%) = £33,500', () => {
    parity({ savings: { current: 0 } }, { current_value: 33500, earmark_pct: 100 }, 33500, 'Luke');
  });

  test('savings parity: Suzanne (cash £53,000, no ISA) = £53,000', () => {
    parity({ savings: { current: 53000 } }, null, 53000, 'Suzanne');
  });

  test('savings parity: earmarkPct 0 counts the full ISA value', () => {
    // Mirrors the JS "no earmark ⇒ full value" branch.
    parity({ savings: { current: 500 } }, { current_value: 10000, earmark_pct: 0 }, 10500, 'no-earmark');
  });

  test('savings parity: partial earmark (50%) + cash', () => {
    parity({ savings: { current: 1000 } }, { current_value: 20000, earmark_pct: 50 }, 11000, 'partial');
  });

  test('savings parity: rounding matches to 2dp', () => {
    // 33333.33 * 33 / 100 = 10999.9989 → 11000.00 both sides.
    parity({ savings: { current: 0 } }, { current_value: 33333.33, earmark_pct: 33 }, 11000, 'rounding');
  });

  test('rpcSavings: sums multiple investment accounts (RPC-only — JS models one ISA)', () => {
    const total = rpcSavings({ savings: { current: 0 } }, [
      { current_value: 1000, earmark_pct: 100 },
      { current_value: 2000, earmark_pct: 50 },
    ]);
    assertEqual(total, 2000); // 1000 + 1000
  });

  test('rpcSavings: missing finances → 0 (coalesce parity)', () => {
    assertEqual(rpcSavings(null, []), 0);
    assertEqual(rpcSavings({}, null), 0);
  });
}
