// debts.test.js — the REAL getCreditCardDebt() read path under Node via the
// core.js test seam. Pins the extend-only storage addition (2026-07-04): the
// net-worth donut's "effective deposit" must subtract real card debt from
// debts_credit_cards, which is not carried on the finances blob.
import { MockSupabaseClient } from '../mocks/supabase-client.js';

const HID = 'house-001';
const SESSION = { user: { id: 'user-001', email: 'test@example.com' }, access_token: 't' };

function tables(cards) {
  return {
    household_members: [{ user_id: 'user-001', household_id: HID }],
    debts_credit_cards: cards,
  };
}

async function loadDebts(t) {
  const core = await import('../../assets/js/storage/core.js');
  core._resetStorageForTests();
  core._internal.removeLocal('debts-credit-cards');
  globalThis.__REC_TEST_SB__ = new MockSupabaseClient(t, { session: SESSION });
  return import('../../assets/js/storage/user-state/debts.js');
}

export async function register({ test, assert, assertEqual }) {
  test('debts: aggregates balance + min payment across cards', async () => {
    const d = await loadDebts(tables([
      { household_id: HID, provider: 'Barclaycard', current_balance: 307, minimum_monthly_payment: 13, pays_in_full_monthly: false },
      { household_id: HID, provider: 'Amex', current_balance: 120, minimum_monthly_payment: 5, pays_in_full_monthly: true },
    ]));
    const r = await d.getCreditCardDebt();
    assertEqual(r.totalBalance, 427, 'balances summed');
    assertEqual(r.totalMinPayment, 18, 'min payments summed');
    assertEqual(r.cards.length, 2);
    assertEqual(r.cards[0].paysInFull, false);
    assertEqual(r.cards[1].paysInFull, true);
  });

  test('debts: no cards → zeroed totals, empty list (never throws)', async () => {
    const d = await loadDebts(tables([]));
    const r = await d.getCreditCardDebt();
    assertEqual(r.totalBalance, 0);
    assertEqual(r.totalMinPayment, 0);
    assertEqual(r.cards.length, 0);
  });

  test('debts: null numeric columns coerce to 0, not NaN', async () => {
    const d = await loadDebts(tables([
      { household_id: HID, provider: 'MBNA', current_balance: null, minimum_monthly_payment: null, pays_in_full_monthly: null },
    ]));
    const r = await d.getCreditCardDebt();
    assertEqual(r.totalBalance, 0, 'null balance → 0');
    assert(Number.isFinite(r.totalBalance), 'no NaN leaks into the total');
  });
}
