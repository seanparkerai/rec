// finances/section-deposit.js — renders the Deposit section tiles: progress bar, saved amount, monthly contribution goal, and LISA eligibility banner. DOM. Rendered on the finances page.

import * as fin from '../finances.js';
import { gbp, monthsAsDuration } from '../format.js';
import { assessAffordability, BANDS } from '../affordability.js';
import { esc, byId as $, setText } from '../dom.js';

export function renderTiles(finData) {
  const target = finData.goal?.targetDeposit || 0;
  // `saved` is the derived cash + earmarked-ISA total. Distinguish a genuinely
  // missing figure (render "—") from a real £0 so the tile never misleads.
  const saved = finData.savings?.totalSavings;
  const savedNum = Number.isFinite(saved) ? saved : 0;
  const pct = fin.calcDepositProgress(savedNum, target);
  const months = fin.calcMonthsToTarget(savedNum, target, finData.savings?.monthlyContribution || 0);
  setText('tile-progress', String(pct));
  // Sanctioned dynamic-value idiom (DESIGN.md §6.7): CSS consumes --fill-pct.
  const bar = $('progress-bar'); if (bar) bar.style.setProperty('--fill-pct', `${pct}%`);
  setText('tile-saved', Number.isFinite(saved) ? gbp(saved) : '—');
  const goalMo = Number(finData.savings?.monthlyContribution || 0);
  const avgMo = finData.savings?.avgMonthlyDepositEstimate;
  setText('tile-monthly', goalMo ? `${gbp(goalMo)} goal` : '—');
  setText('tile-monthly-avg', Number.isFinite(avgMo) && avgMo > 0 ? `${gbp(avgMo)} avg` : '');
  setText('tile-months', Number.isFinite(months) ? `${monthsAsDuration(months)}` : '—');

  const goalPrice = finData.goal?.targetPropertyPrice || finData.goal?.offerTarget || 0;
  const lisaEl = $('tile-lisa');
  if (lisaEl) {
    // A4 (5.6): one-line caveat wherever LISA figures render — reform pending.
    const caveat = ' <small>LISA rules under review (2026 consultation).</small>';
    if (goalPrice > 0 && goalPrice <= BANDS.lisaCap) {
      lisaEl.innerHTML = `LISA eligible at <strong>${esc(gbp(goalPrice))}</strong> — bonus up to <strong>£1,000/yr</strong>.${caveat}`;
    } else if (goalPrice > BANDS.lisaCap && goalPrice <= 500_000) {
      // A4: the £450k–£500k band keeps FTB stamp-duty relief but loses LISA.
      lisaEl.innerHTML = `At <strong>${esc(gbp(goalPrice))}</strong> FTB stamp-duty relief still applies, but the LISA bonus is lost — withdrawing LISA funds for it costs 25%.${caveat}`;
    } else if (goalPrice > BANDS.lisaCap) {
      lisaEl.innerHTML = `LISA cap is <strong>${esc(gbp(BANDS.lisaCap))}</strong>; at ${esc(gbp(goalPrice))} the bonus is forfeited.${caveat}`;
    } else {
      lisaEl.innerHTML = `LISA cap <strong>${esc(gbp(BANDS.lisaCap))}</strong>.${caveat}`;
    }
  }
}
