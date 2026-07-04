// savings-average.test.js — trailingMonthlyAverage() live savings-rate average.

import { trailingMonthlyAverage } from '../../assets/js/savings-average.js';

const NOW = new Date('2026-07-15T00:00:00Z'); // current month = 2026-07 (partial)

function history(rows) {
  return { _status: 'from-supabase', monthlySummary: rows };
}

export async function register({ test, assert, assertEqual }) {
  await test('avg: null when no history', () => {
    assertEqual(trailingMonthlyAverage(null), null);
    assertEqual(trailingMonthlyAverage(history([])), null);
  });

  await test('avg: excludes the still-filling current month', () => {
    const h = history([
      { month: '2026-05', deposits: 2000, withdrawals: 0, net: 2000 },
      { month: '2026-06', deposits: 2000, withdrawals: 0, net: 2000 },
      { month: '2026-07', deposits: 50, withdrawals: 0, net: 50 }, // partial — must not drag
    ]);
    const r = trailingMonthlyAverage(h, { now: NOW });
    assertEqual(r.monthsCounted, 2, 'current month dropped');
    assertEqual(r.net, 2000, 'average over complete months only');
    assertEqual(r.windowEnd, '2026-06');
  });

  await test('avg: net nets out withdrawals; gross is deposits only', () => {
    const h = history([
      { month: '2026-05', deposits: 3000, withdrawals: 1000, net: 2000 },
      { month: '2026-06', deposits: 1000, withdrawals: 0, net: 1000 },
    ]);
    const r = trailingMonthlyAverage(h, { now: NOW });
    assertEqual(r.net, 1500, '(2000+1000)/2');
    assertEqual(r.gross, 2000, '(3000+1000)/2');
    assertEqual(r.withdrawalsTotal, 1000);
    assertEqual(r.netContributionsTotal, 3000);
  });

  await test('avg: window caps at the most recent N complete months', () => {
    const rows = [];
    for (let m = 1; m <= 13; m++) rows.push({ month: `2025-${String(m).padStart(2, '0')}`, deposits: m * 100, withdrawals: 0, net: m * 100 });
    // months 2025-01..2025-13 is invalid; build 2025-01..2026-01 instead:
    const good = [];
    let y = 2025, mo = 1;
    for (let i = 0; i < 14; i++) { good.push({ month: `${y}-${String(mo).padStart(2, '0')}`, deposits: 100, withdrawals: 0, net: 100 }); mo++; if (mo > 12) { mo = 1; y++; } }
    const r = trailingMonthlyAverage(history(good), { windowMonths: 12, now: NOW });
    assertEqual(r.monthsCounted, 12, 'capped to the window');
    assert(r.windowStart > good[0].month, 'oldest months fall outside the 12-month window');
  });

  await test('avg: all-current-month history falls back to those rows (fresh account)', () => {
    const h = history([{ month: '2026-07', deposits: 500, withdrawals: 0, net: 500 }]);
    const r = trailingMonthlyAverage(h, { now: NOW });
    assertEqual(r.monthsCounted, 1);
    assertEqual(r.net, 500, 'a brand-new account still shows something, not nothing');
  });
}
