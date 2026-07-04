// investments-history.test.js — the REAL getInvestmentsHistory() read path
// under Node via the core.js test seam. Pins the extend-only storage change
// (Trading 212 audit, 2026-07-04): the account's declared portfolio value
// surfaces as summary.currentValueDeclared, so analysePerformance() can
// attribute unrealised market growth. Before this, the Supabase-built history
// had no summary at all — currentValue derived to 0 and every growth /
// attribution chart silently rendered £0 market growth forever.
import { MockSupabaseClient } from '../mocks/supabase-client.js';
import { analysePerformance } from '../../assets/js/investment-performance.js';

const HID = 'house-001';
const SESSION = { user: { id: 'user-001', email: 'test@example.com' }, access_token: 't' };

const ACCOUNT_DATA = {
  provider: 'Trading 212',
  currentPortfolioValue: 12000,
  strategyEpochs: [
    { id: 'etfCore', label: 'ETF core', start: '2026-01-02', end: null },
  ],
  holdings: [
    { symbol: 'VHYL', name: 'Vanguard High Dividend', value: 9000, allocationPct: 75, unrealisedPnl: 900, unrealisedPnlPct: 11.1, assetClass: 'equity-etf' },
    { symbol: 'SGLN', name: 'iShares Physical Gold', value: 3000, allocationPct: 25, unrealisedPnl: -50, unrealisedPnlPct: -1.6, assetClass: 'commodity-etf' },
  ],
};

function tables() {
  return {
    household_members: [{ user_id: 'user-001', household_id: HID }],
    investments_accounts: [{
      household_id: HID, provider: 'Trading 212', account_type: 'Stocks & Shares ISA',
      account_opened: '2025-05-26', current_value: 12000, earmark_pct: 100,
      data: ACCOUNT_DATA,
    }],
    investments_history: [
      { household_id: HID, month: '2026-01', deposits: 5000, withdrawals: 0, net: 5000, dividends: 10, interest: 1, realised_pnl: 0, epoch: 'etfCore' },
      { household_id: HID, month: '2026-02', deposits: 6000, withdrawals: 500, net: 5500, dividends: 20, interest: 2, realised_pnl: 30, epoch: 'etfCore' },
    ],
  };
}

async function loadInvestments(t) {
  const core = await import('../../assets/js/storage/core.js');
  core._resetStorageForTests();
  core._internal.removeLocal('investments');
  globalThis.__REC_TEST_SB__ = new MockSupabaseClient(t, { session: SESSION });
  return import('../../assets/js/storage/user-state/investments.js');
}

export async function register({ test, assert, assertEqual }) {
  test('history: declared account value surfaces as summary.currentValueDeclared', async () => {
    const inv = await loadInvestments(tables());
    const h = await inv.getInvestmentsHistory();
    assertEqual(h._status, 'from-supabase');
    assertEqual(h.summary?.currentValueDeclared, 12000,
      'the account blob currentPortfolioValue rides along with the history');
    assertEqual(h.monthlySummary.length, 2);
  });

  test('history: analysePerformance attributes market growth from the declared value', async () => {
    const inv = await loadInvestments(tables());
    const perf = analysePerformance(await inv.getInvestmentsHistory());
    assertEqual(perf.currentValue, 12000);
    // 12000 − net 10500 − div 30 − int 3 − realised 30 = 1437 unrealised.
    assertEqual(perf.unrealisedGain, 1437,
      'unrealised growth is the declared value minus the cash basis — non-zero when the market moved');
  });

  test('history: no account value → no summary key (stub-safe shape unchanged)', async () => {
    const t = tables();
    t.investments_accounts[0].data = { provider: 'Trading 212' };
    const inv = await loadInvestments(t);
    const h = await inv.getInvestmentsHistory();
    assert(!('summary' in h), 'summary only appears when a positive declared value exists');
    assertEqual(analysePerformance(h).currentValue, 0);
  });
}
