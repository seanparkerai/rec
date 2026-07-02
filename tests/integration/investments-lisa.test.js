// investments-lisa.test.js — step 5.5 (A3): the REAL getInvestments() read path
// under Node via the core.js test seam. Pins the extend-only storage change:
// a Lifetime ISA row in investments_accounts surfaces as `lisa` (with the
// GOV.UK 12-month clock start), while the S&S ISA blob keeps its exact legacy
// { trading212ISA } shape — and a LISA row can never be mistaken for it.
import { MockSupabaseClient } from '../mocks/supabase-client.js';

const HID = 'house-001';
const SESSION = { user: { id: 'user-001', email: 'test@example.com' }, access_token: 't' };

function tables({ lisaRow = null } = {}) {
  const rows = [{
    household_id: HID, provider: 'Trading 212', account_type: 'Stocks & Shares ISA',
    account_opened: '2024-04-10', current_value: 50000, earmark_pct: 100,
    data: { provider: 'Trading 212', currentPortfolioValue: 50000 },
  }];
  if (lisaRow) rows.push(lisaRow);
  return {
    household_members: [{ user_id: 'user-001', household_id: HID }],
    investments_accounts: rows,
  };
}

async function loadInvestments(t) {
  const core = await import('../../assets/js/storage/core.js');
  core._resetStorageForTests();
  // Node ≥22 ships a global localStorage — flush the write-through cache so
  // one test's fetch can't serve the next test's read.
  core._internal.removeLocal('investments');
  globalThis.__REC_TEST_SB__ = new MockSupabaseClient(t, { session: SESSION });
  return import('../../assets/js/storage/user-state/investments.js');
}

export async function register({ test, assert, assertEqual }) {
  test('investments (5.5): no LISA row → no lisa key; trading212ISA shape unchanged', async () => {
    const inv = await loadInvestments(tables());
    const r = await inv.getInvestments();
    assertEqual(r.trading212ISA.provider, 'Trading 212');
    assert(!('lisa' in r), 'no lisa key when no Lifetime ISA row exists');
  });

  test('investments (5.5): Lifetime ISA row surfaces as lisa with the opened-date clock proxy', async () => {
    const inv = await loadInvestments(tables({ lisaRow: {
      household_id: HID, provider: 'Example', account_type: 'Lifetime ISA',
      account_opened: '2026-01-15', current_value: 1, earmark_pct: 100, data: {},
    } }));
    const r = await inv.getInvestments();
    assertEqual(r.lisa.accountOpened, '2026-01-15');
    assertEqual(r.lisa.firstContributionDate, '2026-01-15', 'opened date is the proxy clock start');
    assertEqual(r.trading212ISA.provider, 'Trading 212',
      'the LISA row must never displace the S&S ISA blob');
  });

  test('investments (5.5): explicit data.firstContributionDate wins over the opened date', async () => {
    const inv = await loadInvestments(tables({ lisaRow: {
      household_id: HID, provider: 'Example', account_type: 'lifetime isa',
      account_opened: '2026-01-15', current_value: 1, earmark_pct: 100,
      data: { firstContributionDate: '2026-02-01' },
    } }));
    const r = await inv.getInvestments();
    assertEqual(r.lisa.firstContributionDate, '2026-02-01');
  });
}
