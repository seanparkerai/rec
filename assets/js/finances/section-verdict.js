// finances/section-verdict.js — the verdict-led lede (3.8a): the page answers
// "can we buy at the target price, and what's the headroom?" in the first
// viewport (DESIGN.md §5 rule 1). Composed ENTIRELY from the already-pinned
// calculator surface — assessAffordability at the goal price — so no new
// maths and no altered numbers (§3.10b-safe by construction: every figure
// shown here already renders in the afford widget below at the same price).
import { assessAffordability } from '../affordability.js';
import { gbp } from '../format.js';
import { esc, byId as $ } from '../dom.js';

export function renderFinanceVerdict(finData, criteria) {
  const strip = $('finance-verdict');
  if (!strip) return;
  const price = Number(finData?.goal?.offerTarget || finData?.goal?.targetPropertyPrice || 0);
  if (!(price > 0)) { strip.hidden = true; return; }

  const r = assessAffordability({ price, finances: finData, criteria });
  strip.hidden = false;
  strip.className = `finance-verdict finance-verdict--${r.verdict}`;
  const dot = $('finance-verdict-dot');
  if (dot) dot.className = `fit-dot fit-dot--${r.verdict}`;
  const txt = $('finance-verdict-text');
  if (txt) txt.textContent = r.headline;
  const num = $('finance-verdict-num');
  if (num) {
    num.innerHTML = [
      `<span>Target <strong>${esc(gbp(price))}</strong></span>`,
      `<span><strong>${esc(gbp(r.monthlyPI))}/mo</strong></span>`,
      `<span>Max <strong>${esc(gbp(r.maxPropertyAtTargetDeposit))}</strong> at 4.5&times;</span>`,
    ].join('');
  }
}
