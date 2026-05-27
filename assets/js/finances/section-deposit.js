import * as fin from '../finances.js';
import { gbp, monthsAsDuration } from '../format.js';
import { assessAffordability, BANDS } from '../affordability.js';
import { esc, byId as $, setText } from '../dom.js';

export function renderTiles(finData) {
  const target = finData.goal?.targetDeposit || 0;
  const saved = finData.savings?.totalSavings || 0;
  const pct = fin.calcDepositProgress(saved, target);
  const months = fin.calcMonthsToTarget(saved, target, finData.savings?.monthlyContribution || 0);
  setText('tile-progress', String(pct));
  const bar = $('progress-bar'); if (bar) bar.style.width = `${pct}%`;
  setText('tile-saved', gbp(saved));
  const goalMo = Number(finData.savings?.monthlyContribution || 0);
  const avgMo = finData.savings?.avgMonthlyDepositEstimate;
  setText('tile-monthly', goalMo ? `${gbp(goalMo)} goal` : '—');
  setText('tile-monthly-avg', Number.isFinite(avgMo) && avgMo > 0 ? `${gbp(avgMo)} avg` : '');
  setText('tile-months', Number.isFinite(months) ? `${monthsAsDuration(months)}` : '—');

  const goalPrice = finData.goal?.targetPropertyPrice || finData.goal?.offerTarget || 0;
  const lisaEl = $('tile-lisa');
  if (lisaEl) {
    if (goalPrice > 0 && goalPrice <= BANDS.lisaCap) {
      lisaEl.innerHTML = `LISA eligible at <strong>${esc(gbp(goalPrice))}</strong> — bonus up to <strong>£1,000/yr</strong>`;
    } else if (goalPrice > BANDS.lisaCap) {
      lisaEl.innerHTML = `LISA cap is <strong>${esc(gbp(BANDS.lisaCap))}</strong>; at ${esc(gbp(goalPrice))} the bonus is forfeited.`;
    } else {
      lisaEl.innerHTML = `LISA cap <strong>${esc(gbp(BANDS.lisaCap))}</strong>`;
    }
  }
}
