import { loadJSON } from '../data-loader.js';
import { analysePerformance, getMonthlyCumulativeDeposits, getEpochAttribution } from '../investment-performance.js';
import { buildSavingsSeries } from '../savings-series.js';
import { gbp } from '../format.js';
import { cssVar } from '../css-vars.js';
import { SVG_NS as SVG_NS_F } from '../svg.js';
import { chartOpts, fmtMonthLabel, setStub } from './chart-helpers.js';

const _v3Charts = {};

export async function renderSavingsOverTime(finData) {
  const canvas = document.getElementById('savings-over-time-canvas');
  if (!canvas || !finData) return;
  let history; try { history = await loadJSON('imports/trading212-history'); } catch { history = null; }
  const goal = Number(finData?.goal?.targetDeposit ?? 0);
  const series = buildSavingsSeries({ history, finances: finData, goal });
  const cap = document.getElementById('sot-caption');

  if (series.isStub || series.points.length === 0) {
    setStub('savings-over-time-card', 'sot-caption');
    return;
  }

  const labels = series.points.map((p) => p.month);
  const actual = series.points.map((p) => p.cumulative);
  const targetVals = labels.map(() => goal);

  if (_v3Charts.savingsOverTime) _v3Charts.savingsOverTime.destroy();
  _v3Charts.savingsOverTime = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: 'Actual cumulative', data: actual, borderColor: cssVar('--accent'), backgroundColor: cssVar('--accent-soft'), fill: true, tension: 0.15, pointRadius: 2 },
        { label: 'Target', data: targetVals, borderColor: cssVar('--ink-muted'), borderDash: [4, 4], pointRadius: 0, fill: false },
      ],
    },
    options: chartOpts({ yLabel: 'Cumulative £' }),
  });

  if (cap) {
    const eta = series.targetLine.etaMonth;
    const last = series.points[series.points.length - 1];
    if (eta) cap.textContent = `At current pace you hit ${gbp(goal)} in ${fmtMonthLabel(eta)} — ${gbp(Math.round(last.cumulative))} saved so far.`;
    else cap.textContent = `${gbp(Math.round(last.cumulative))} saved across ${series.points.length} months.`;
  }
}

export async function renderMonthlyDeposits(finData) {
  const canvas = document.getElementById('monthly-deposits-canvas');
  if (!canvas || !finData) return;
  let history; try { history = await loadJSON('imports/trading212-history'); } catch { history = null; }
  const series = getMonthlyCumulativeDeposits(history);
  const cap = document.getElementById('md-caption');

  if (series.length === 0) { setStub('monthly-deposits-card', 'md-caption'); return; }

  const labels = series.map((p) => p.month);
  const data = series.map((p) => p.delta);

  if (_v3Charts.monthlyDeposits) _v3Charts.monthlyDeposits.destroy();
  _v3Charts.monthlyDeposits = new Chart(canvas, {
    type: 'bar',
    data: { labels, datasets: [{ label: 'Net deposit', data, backgroundColor: cssVar('--accent') }] },
    options: chartOpts({ yLabel: '£ per month' }),
  });

  const goalMo = Number(finData?.savings?.monthlyContribution ?? 2000);
  const avg = data.reduce((s, v) => s + v, 0) / data.length;
  const delta = avg - goalMo;
  if (cap) {
    const dir = delta >= 0 ? 'above' : 'below';
    cap.textContent = `Avg ${gbp(Math.round(avg))}/mo across ${data.length} months — ${gbp(Math.abs(Math.round(delta)))} ${dir} the ${gbp(goalMo)} goal.`;
  }
}

export async function renderISAStackedArea(finData) {
  const canvas = document.getElementById('isa-stacked-canvas');
  if (!canvas || !finData) return;
  let history; try { history = await loadJSON('imports/trading212-history'); } catch { history = null; }
  if (!Array.isArray(history?.monthlySummary) || history.monthlySummary.length === 0) {
    setStub('isa-stacked-area-card', 'isasa-caption'); return;
  }
  const sorted = [...history.monthlySummary].sort((a, b) => a.month.localeCompare(b.month));
  let cumContrib = 0, cumDiv = 0, cumInt = 0;
  const labels = sorted.map((m) => m.month);
  const contrib = [], divs = [], ints = [];
  sorted.forEach((m) => {
    cumContrib += Number(m.net) || 0;
    cumDiv += Number(m.dividends) || 0;
    cumInt += Number(m.interest) || 0;
    contrib.push(cumContrib); divs.push(cumDiv); ints.push(cumInt);
  });
  const perf = analysePerformance(history);
  const growthEnd = Math.max(0, perf.unrealisedGain);
  const growth = labels.map((_, i) => Math.round((growthEnd * (i + 1) / labels.length)));

  if (_v3Charts.isaStacked) _v3Charts.isaStacked.destroy();
  _v3Charts.isaStacked = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: 'Contributed', data: contrib, borderColor: cssVar('--accent'),      backgroundColor: cssVar('--accent-soft'),    fill: true, tension: 0.1, pointRadius: 0 },
        { label: 'Dividends',   data: divs,    borderColor: cssVar('--accent-ink'),  backgroundColor: cssVar('--hairline'),        fill: true, tension: 0.1, pointRadius: 0 },
        { label: 'Interest',    data: ints,    borderColor: cssVar('--ink-muted'),   backgroundColor: cssVar('--hairline'),        fill: true, tension: 0.1, pointRadius: 0 },
        { label: 'Market growth', data: growth, borderColor: cssVar('--ink-subtle'), backgroundColor: cssVar('--hairline-strong'), fill: true, tension: 0.1, pointRadius: 0 },
      ],
    },
    options: chartOpts({ yLabel: '£', stacked: true }),
  });

  const total = perf.netContributed + perf.dividendsReceived + perf.interestEarned + growthEnd;
  const pct = (n) => total > 0 ? Math.round((n / total) * 100) : 0;
  const cap = document.getElementById('isasa-caption');
  if (cap) cap.textContent = `Of ${gbp(Math.round(total))} balance: ${pct(perf.netContributed)}% contributed, ${pct(perf.dividendsReceived + perf.interestEarned)}% dividends + interest, ${pct(growthEnd)}% market growth.`;
}

export async function renderDividendsInterest() {
  const canvas = document.getElementById('div-int-canvas');
  if (!canvas) return;
  let history; try { history = await loadJSON('imports/trading212-history'); } catch { history = null; }
  if (!Array.isArray(history?.monthlySummary) || history.monthlySummary.length === 0) {
    setStub('div-int-cumulative-card', 'di-caption'); return;
  }
  const sorted = [...history.monthlySummary].sort((a, b) => a.month.localeCompare(b.month));
  let cumDiv = 0, cumInt = 0;
  const labels = sorted.map((m) => m.month);
  const divs = [], ints = [];
  sorted.forEach((m) => {
    cumDiv += Number(m.dividends) || 0;
    cumInt += Number(m.interest) || 0;
    divs.push(cumDiv); ints.push(cumInt);
  });

  if (_v3Charts.divInt) _v3Charts.divInt.destroy();
  _v3Charts.divInt = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: 'Dividends', data: divs, borderColor: cssVar('--accent'),    pointRadius: 2, tension: 0.15 },
        { label: 'Interest',  data: ints, borderColor: cssVar('--ink-muted'), pointRadius: 2, tension: 0.15 },
      ],
    },
    options: chartOpts({ yLabel: 'Cumulative £' }),
  });

  const totalPassive = divs[divs.length - 1] + ints[ints.length - 1];
  const cap = document.getElementById('di-caption');
  if (cap) cap.textContent = `${gbp(Math.round(totalPassive))} in passive income across ${labels.length} months.`;
}

export async function renderEpochComparison() {
  const svg = document.getElementById('epoch-svg');
  if (!svg) return;
  let history; try { history = await loadJSON('imports/trading212-history'); } catch { history = null; }
  const epochs = getEpochAttribution(history);
  const cap = document.getElementById('ec-caption');

  if (epochs.length === 0) {
    svg.replaceChildren();
    if (cap) cap.textContent = 'Run the Trading 212 importer to compare strategy epochs.';
    return;
  }

  const W = 600, H = 180, PAD_L = 140, PAD_R = 40, PAD_T = 20, PAD_B = 20;
  const rowH = (H - PAD_T - PAD_B) / epochs.length;
  const maxContrib = Math.max(...epochs.map((e) => e.contributedDuringEpoch), 1);

  svg.replaceChildren();
  epochs.forEach((ep, i) => {
    const y = PAD_T + i * rowH + 4;
    const labelEl = document.createElementNS(SVG_NS_F, 'text');
    labelEl.setAttribute('x', String(PAD_L - 8));
    labelEl.setAttribute('y', String(y + rowH / 2 + 4));
    labelEl.setAttribute('text-anchor', 'end');
    labelEl.setAttribute('class', 'epoch-comparison__label');
    labelEl.textContent = ep.label;
    svg.appendChild(labelEl);

    const barW = ((ep.contributedDuringEpoch / maxContrib) * (W - PAD_L - PAD_R - 80));
    const bar = document.createElementNS(SVG_NS_F, 'rect');
    bar.setAttribute('x', String(PAD_L));
    bar.setAttribute('y', String(y + 8));
    bar.setAttribute('width', String(Math.max(2, barW)));
    bar.setAttribute('height', String(rowH - 24));
    bar.setAttribute('class', 'epoch-comparison__bar');
    svg.appendChild(bar);

    const val = document.createElementNS(SVG_NS_F, 'text');
    val.setAttribute('x', String(PAD_L + barW + 6));
    val.setAttribute('y', String(y + rowH / 2 + 4));
    val.setAttribute('class', 'epoch-comparison__value');
    val.textContent = `${gbp(Math.round(ep.contributedDuringEpoch))}${ep.returnPct != null ? ` · ${ep.returnPct > 0 ? '+' : ''}${ep.returnPct}%/yr est` : ''}`;
    svg.appendChild(val);
  });

  if (cap) {
    const best = [...epochs].filter((e) => e.returnPct != null).sort((a, b) => b.returnPct - a.returnPct)[0];
    if (best) cap.textContent = `${best.label} returned ~${best.returnPct > 0 ? '+' : ''}${best.returnPct}%/yr (estimated, contribution-weighted).`;
    else cap.textContent = `${epochs.length} strategy epochs since opening.`;
  }
}

export async function renderTickerTreemap() {
  const svg = document.getElementById('ticker-treemap-svg');
  if (!svg) return;
  let history; try { history = await loadJSON('imports/trading212-history'); } catch { history = null; }
  const exposure = history?.tickerExposure;
  const cap = document.getElementById('tt-caption');
  if (!exposure || typeof exposure !== 'object' || Object.keys(exposure).length === 0) {
    svg.replaceChildren();
    if (cap) cap.textContent = 'Run the Trading 212 importer to see your ticker exposure.';
    return;
  }

  const entries = Object.entries(exposure)
    .map(([t, v]) => ({ ticker: t, value: Number(v?.netDeployed ?? v?.value ?? v) || 0 }))
    .filter((e) => e.value > 0)
    .sort((a, b) => b.value - a.value);
  const total = entries.reduce((s, e) => s + e.value, 0);
  if (total === 0) { svg.replaceChildren(); if (cap) cap.textContent = '—'; return; }

  const W = 600, H = 360;
  svg.replaceChildren();

  function drawRect(item, x, y, w, h) {
    const r = document.createElementNS(SVG_NS_F, 'rect');
    r.setAttribute('x', x.toFixed(1)); r.setAttribute('y', y.toFixed(1));
    r.setAttribute('width', Math.max(0, w - 2).toFixed(1));
    r.setAttribute('height', Math.max(0, h - 2).toFixed(1));
    r.setAttribute('class', 'ticker-treemap__rect');
    svg.appendChild(r);
    if (w > 50 && h > 28) {
      const t = document.createElementNS(SVG_NS_F, 'text');
      t.setAttribute('x', (x + 6).toFixed(1)); t.setAttribute('y', (y + 16).toFixed(1));
      t.setAttribute('class', 'ticker-treemap__ticker');
      t.textContent = item.ticker;
      svg.appendChild(t);
      const v = document.createElementNS(SVG_NS_F, 'text');
      v.setAttribute('x', (x + 6).toFixed(1)); v.setAttribute('y', (y + 32).toFixed(1));
      v.setAttribute('class', 'ticker-treemap__value');
      v.textContent = `${gbp(Math.round(item.value))} · ${Math.round((item.value / total) * 100)}%`;
      svg.appendChild(v);
    }
  }

  function layout(items, x, y, w, h, horizontal) {
    if (items.length === 0) return;
    if (items.length === 1) { drawRect(items[0], x, y, w, h); return; }
    const sum = items.reduce((s, e) => s + e.value, 0);
    const half = sum / 2;
    let acc = 0, splitIdx = 0;
    for (let i = 0; i < items.length; i++) {
      acc += items[i].value;
      if (acc >= half) { splitIdx = i + 1; break; }
    }
    const a = items.slice(0, splitIdx);
    const b = items.slice(splitIdx);
    const aSum = a.reduce((s, e) => s + e.value, 0);
    const aFrac = aSum / sum;
    if (horizontal) {
      const aW = w * aFrac;
      layout(a, x, y, aW, h, !horizontal);
      layout(b, x + aW, y, w - aW, h, !horizontal);
    } else {
      const aH = h * aFrac;
      layout(a, x, y, w, aH, !horizontal);
      layout(b, x, y + aH, w, h - aH, !horizontal);
    }
  }

  layout(entries, 0, 0, W, H, true);

  if (cap) {
    const top = entries[0];
    cap.textContent = `${top.ticker} is your largest holding at ${Math.round((top.value / total) * 100)}% of deployed capital.`;
  }
}

export async function renderRealisedUnrealised() {
  const svg = document.getElementById('ru-svg');
  if (!svg) return;
  let history; try { history = await loadJSON('imports/trading212-history'); } catch { history = null; }
  const perf = analysePerformance(history);
  const cap = document.getElementById('ru-caption');

  if (perf.isStub) {
    svg.replaceChildren();
    if (cap) cap.textContent = 'Run the Trading 212 importer to compare realised vs unrealised P&L.';
    return;
  }

  const realised = perf.realisedPnL || 0;
  const unrealised = Math.max(0, perf.unrealisedGain || 0);
  const max = Math.max(Math.abs(realised), Math.abs(unrealised), 1);

  const W = 400, H = 120, PAD_L = 120, PAD_R = 12, ROW_H = 36;
  const barW = (v) => Math.max(2, (Math.abs(v) / max) * (W - PAD_L - PAD_R - 60));

  svg.replaceChildren();
  ['Realised', 'Unrealised'].forEach((label, i) => {
    const v = i === 0 ? realised : unrealised;
    const y = 16 + i * (ROW_H + 12);

    const lbl = document.createElementNS(SVG_NS_F, 'text');
    lbl.setAttribute('x', String(PAD_L - 8)); lbl.setAttribute('y', String(y + ROW_H / 2 + 4));
    lbl.setAttribute('text-anchor', 'end'); lbl.setAttribute('class', 'realised-unrealised__label');
    lbl.textContent = label; svg.appendChild(lbl);

    const bar = document.createElementNS(SVG_NS_F, 'rect');
    bar.setAttribute('x', String(PAD_L)); bar.setAttribute('y', String(y));
    bar.setAttribute('width', String(barW(v))); bar.setAttribute('height', String(ROW_H));
    bar.setAttribute('class', `realised-unrealised__bar--${label.toLowerCase()}`);
    svg.appendChild(bar);

    const val = document.createElementNS(SVG_NS_F, 'text');
    val.setAttribute('x', String(PAD_L + barW(v) + 6)); val.setAttribute('y', String(y + ROW_H / 2 + 4));
    val.setAttribute('class', 'realised-unrealised__value');
    val.textContent = gbp(Math.round(v));
    svg.appendChild(val);
  });

  if (cap) {
    cap.textContent = `${gbp(Math.round(realised))} locked in by selling; ${gbp(Math.round(unrealised))} still riding the market.`;
  }
}
