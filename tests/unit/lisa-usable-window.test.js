// lisa-usable-window.test.js — step 5.5 (A3): the GOV.UK LISA first-home rule.
// A Lifetime ISA can fund a first-home purchase only once the account is
// ≥ 12 months old, counted from the FIRST contribution (GOV.UK Lifetime ISA;
// an opening deposit starts the clock). The old spec's "~4–5 year seasoning"
// was wrong and is dead; this pins the corrected pure rule end to end, plus a
// source rail on the dashboard tile that renders it.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { lisaUsableWindow } from '../../assets/js/finances.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');

export async function register({ test, assert, assertEqual }) {
  const D = (s) => new Date(`${s}T12:00:00`);

  test('lisa window (5.5): no LISA / no date / invalid date → null', () => {
    assertEqual(lisaUsableWindow(null), null);
    assertEqual(lisaUsableWindow(undefined), null);
    assertEqual(lisaUsableWindow({}), null);
    assertEqual(lisaUsableWindow({ firstContributionDate: 'not-a-date' }), null);
  });

  test('lisa window (5.5): usable-from = first contribution + 12 months exactly', () => {
    const w = lisaUsableWindow({ firstContributionDate: '2026-01-15' }, D('2026-07-02'));
    assertEqual(w.usableFrom.getFullYear(), 2027);
    assertEqual(w.usableFrom.getMonth(), 0);
    assertEqual(w.usableFrom.getDate(), 15);
    assertEqual(w.met, false);
    assert(w.pct > 40 && w.pct < 55, `mid-window pct plausible, got ${w.pct}`);
    assert(w.daysRemaining > 190 && w.daysRemaining < 200,
      `~197 days from 2 Jul 2026 to 15 Jan 2027, got ${w.daysRemaining}`);
  });

  test('lisa window (5.5): met at/after the 12-month point; pct capped at 100', () => {
    const onTheDay = lisaUsableWindow({ firstContributionDate: '2025-07-02' }, D('2026-07-02'));
    assertEqual(onTheDay.met, true, 'the anniversary day itself is usable');
    assertEqual(onTheDay.daysRemaining, 0);
    const longMet = lisaUsableWindow({ firstContributionDate: '2020-01-01' }, D('2026-07-02'));
    assertEqual(longMet.met, true);
    assertEqual(longMet.pct, 100, 'pct never exceeds 100');
  });

  test('lisa window (5.5): explicit firstContributionDate beats accountOpened; opened is the proxy', () => {
    const explicit = lisaUsableWindow(
      { accountOpened: '2025-01-01', firstContributionDate: '2026-03-01' }, D('2026-07-02'));
    assertEqual(explicit.met, false, 'clock runs from the first contribution, not opening');
    const proxy = lisaUsableWindow({ accountOpened: '2025-01-01' }, D('2026-07-02'));
    assertEqual(proxy.met, true, 'opening date is the fallback clock start');
  });

  test('lisa window (5.5): source rail — the dashboard tile renders the rule with both captions', () => {
    const src = readFileSync(join(ROOT, 'assets/js/dashboard/tile-savings-visuals.js'), 'utf8');
    assert(/lisaUsableWindow\(investments\?\.lisa\)/.test(src),
      'renderWithdrawalReadiness must consult lisaUsableWindow(investments?.lisa)');
    assert(/12-month rule met/.test(src), 'met caption present');
    assert(/12 months after your first contribution/.test(src), 'countdown caption present');
    assert(/SEASONING_MONTHS = 3/.test(src),
      'the no-LISA sell-and-transfer seasoning fallback must survive');
  });
}
