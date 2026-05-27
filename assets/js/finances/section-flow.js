import { gbp } from '../format.js';
import { getMoneyFlow } from '../money-flow.js';
import { esc, byId as $, setText, setHTML } from '../dom.js';
import { FLOW_PALETTE } from '../flow-constants.js';

export function buildFlowBar(flow, maxTotal) {
  const w = 300, h = 40, padX = 4, barY = 8, barH = 24;
  const innerW = w - 2 * padX;
  const scale = (val) => Math.max(0, (val / maxTotal) * innerW);
  let x = padX;
  let svg = '';
  for (const bucket of flow.buckets) {
    if (bucket.amount <= 0) continue;
    const bw = scale(bucket.amount);
    const cls = `flow__seg flow__seg--${FLOW_PALETTE[bucket.kind] || 'bills'}`;
    svg += `<rect class="${cls}" x="${x.toFixed(1)}" y="${barY}" width="${bw.toFixed(1)}" height="${barH}" data-bucket="${esc(bucket.kind)}" />`;
    if (bw > 36) {
      svg += `<text class="flow__seg-label" x="${(x + bw / 2).toFixed(1)}" y="${(barY + barH / 2 + 3).toFixed(1)}" text-anchor="middle" pointer-events="none">${esc(gbp(bucket.amount))}</text>`;
    }
    x += bw;
  }
  if (flow.spare < 0) {
    const sw = scale(Math.abs(flow.spare));
    svg += `<rect class="flow__seg flow__seg--negative" x="${(w - padX - sw).toFixed(1)}" y="${barY}" width="${sw.toFixed(1)}" height="${barH}" data-bucket="negative" />`;
  }
  return svg;
}

export function buildFlowLegend(flow) {
  return flow.buckets.map((b) => `
    <li>
      <span class="swatch swatch--${esc(FLOW_PALETTE[b.kind] || 'bills')}" aria-hidden="true"></span>
      <span>${esc(b.name)}</span>
      <span class="num">${esc(gbp(b.amount))}</span>
    </li>
  `).join('');
}

export function renderNowFlow(finData) {
  const flow = getMoneyFlow(finData);
  const total = flow.buckets.reduce((s, b) => s + Math.max(0, b.amount), 0);
  setHTML('now-flow-bar', buildFlowBar(flow, total));
  setHTML('now-flow-legend', buildFlowLegend(flow));
  setText('now-flow-headline', `${gbp(flow.income.total)}/mo in · ${gbp(flow.spare)} spare`);
  const cap = $('now-flow-caption');
  if (cap) {
    const billsPct = ((flow.buckets.find((b) => b.kind === 'bills')?.amount || 0) / total) * 100;
    const savingsPct = ((flow.buckets.find((b) => b.kind === 'savings')?.amount || 0) / total) * 100;
    cap.innerHTML = `Bills take <strong>${billsPct.toFixed(0)}%</strong> of monthly income; savings absorb <strong>${savingsPct.toFixed(0)}%</strong>.`;
  }
}
