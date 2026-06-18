// tile-money-flow.js — renders stacked flow bars (today vs post-move) showing bills,
// expenses, savings, mortgage, and spare income, with interactive drilldown into line
// items per bucket. DOM-rendering tile for the home dashboard.
import * as fin from '../finances.js';
import { gbp } from '../format.js';
import { getMoneyFlow, getMoneyFlowPostMove } from '../money-flow.js';
import { esc, byId as $, setText, setHTML } from '../dom.js';
import { FLOW_PALETTE } from '../flow-constants.js';

function buildFlowBar(flow, maxTotal) {
  const w = 300, h = 40, padX = 4, barY = 8, barH = 24;
  const innerW = w - 2 * padX;
  const scale = (val) => Math.max(0, (val / maxTotal) * innerW);
  let x = padX;
  let svg = '';
  for (const bucket of flow.buckets) {
    if (bucket.amount <= 0) continue;
    const bw = scale(bucket.amount);
    const cls = `flow__seg flow__seg--${FLOW_PALETTE[bucket.kind] || 'bills'}`;
    svg += `<rect class="${cls}" x="${x.toFixed(1)}" y="${barY}" width="${bw.toFixed(1)}" height="${barH}" data-bucket="${esc(bucket.kind)}" data-name="${esc(bucket.name)}" />`;
    if (bw > 36) {
      svg += `<text class="flow__seg-label" x="${(x + bw / 2).toFixed(1)}" y="${(barY + barH / 2 + 3).toFixed(1)}" text-anchor="middle" pointer-events="none">${esc(gbp(bucket.amount))}</text>`;
    }
    x += bw;
  }
  if (flow.spare < 0) {
    const sw = scale(Math.abs(flow.spare));
    svg += `<rect class="flow__seg flow__seg--negative" x="${(w - padX - sw).toFixed(1)}" y="${barY}" width="${sw.toFixed(1)}" height="${barH}" data-bucket="negative" data-name="Shortfall" />`;
  }
  return svg;
}

function buildFlowLegend(flow) {
  return flow.buckets.map((b) => `
    <li>
      <span class="swatch swatch--${esc(FLOW_PALETTE[b.kind] || 'bills')}" aria-hidden="true"></span>
      <span>${esc(b.name)}</span>
      <span class="num">${esc(gbp(b.amount))}</span>
    </li>
  `).join('');
}

function lineItemsFor(kind, financesData, monthlyMortgage) {
  if (kind === 'bills') return (financesData.ongoingBills || []).map((b) => ({ label: b.item, amount: b.monthly }));
  if (kind === 'expenses') return (financesData.expenses || []).map((b) => ({ label: b.item, amount: b.monthly }));
  if (kind === 'savings') return [{ label: 'Monthly savings contribution', amount: financesData.savings?.monthlyContribution || 0 }];
  if (kind === 'mortgage') {
    const r = financesData.mortgage?.ratePctAssumed;
    const t = financesData.mortgage?.termYears;
    return [{ label: `Mortgage P&I (${r}% over ${t}y)`, amount: monthlyMortgage }];
  }
  if (kind === 'spare') return [{ label: 'Discretionary / unallocated', amount: 0 }];
  return [];
}

export function renderMoneyFlow(financesData, criteria) {
  const offerTarget = Number(criteria?.budget?.offerTarget || financesData?.goal?.offerTarget || 380000);
  const targetDeposit = Number(financesData?.goal?.targetDeposit || 0);
  const loan = Math.max(0, offerTarget - targetDeposit);
  const monthlyMortgage = fin.calcMonthlyMortgage(loan, financesData.mortgage?.ratePctAssumed || 0, financesData.mortgage?.termYears || 0);

  const today = getMoneyFlow(financesData);
  const after = getMoneyFlowPostMove(financesData, monthlyMortgage);

  const maxTotal = Math.max(
    today.buckets.reduce((s, b) => s + Math.max(0, b.amount), 0),
    after.buckets.reduce((s, b) => s + Math.max(0, b.amount), 0),
  );

  setHTML('tf-flow-today', buildFlowBar(today, maxTotal));
  setHTML('tf-flow-after', buildFlowBar(after, maxTotal));
  setHTML('tf-legend-today', buildFlowLegend(today));
  setHTML('tf-legend-after', buildFlowLegend(after));

  setText('tf-headline', `Spare ${gbp(today.spare)} → ${gbp(after.spare)}/mo`);
  const cap = $('tf-caption');
  if (cap) {
    if (after.spare < 0) {
      cap.innerHTML = `Spare drops from <strong>${esc(gbp(today.spare))}</strong> to <strong>${esc(gbp(after.spare))}/mo</strong> — outgoings exceed take-home at the offer price (${esc(gbp(offerTarget))}).`;
    } else {
      cap.innerHTML = `Spare drops from <strong>${esc(gbp(today.spare))}</strong> to <strong>${esc(gbp(after.spare))}/mo</strong> at the offer price (${esc(gbp(offerTarget))}).`;
    }
  }

  const detailsEl = $('tf-details');
  const summaryEl = $('tf-details-summary');
  const listEl = $('tf-details-list');
  const openDetails = (kind, name, items) => {
    if (!detailsEl || !summaryEl || !listEl) return;
    detailsEl.hidden = false;
    detailsEl.open = true;
    summaryEl.textContent = `${name} — line items`;
    listEl.innerHTML = items.map((it) => `
      <li><span>${esc(it.label)}</span><span class="num">${esc(gbp(it.amount))}</span></li>
    `).join('');
  };

  ['tf-flow-today', 'tf-flow-after'].forEach((id) => {
    const svg = $(id);
    if (!svg) return;
    svg.addEventListener('click', (e) => {
      const target = e.target.closest('[data-bucket]');
      if (!target) return;
      const kind = target.dataset.bucket;
      const name = target.dataset.name || kind;
      if (kind === 'negative') {
        openDetails(kind, 'Shortfall', [
          { label: `Outgoings exceed take-home by`, amount: Math.abs(after.spare) },
        ]);
        return;
      }
      openDetails(kind, name, lineItemsFor(kind, financesData, monthlyMortgage));
    });
  });
}
