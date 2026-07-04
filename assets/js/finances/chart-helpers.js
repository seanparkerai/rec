// finances/chart-helpers.js — shared chart configuration and helpers for chart.js rendering. DOM manipulation for stub states. Used by all section-*-charts.js renderers.

import { cssVar } from '../css-vars.js';
import { prefersReducedMotion } from '../motion.js';

export function fmtMonthLabel(label) {
  if (!label || label.length < 7) return label ?? '';
  const [y, m] = label.split('-').map(Number);
  const d = new Date(y, m - 1, 1);
  return d.toLocaleString('en-GB', { month: 'short', year: 'numeric' });
}

export function chartOpts({ yLabel, stacked = false } = {}) {
  const ink = cssVar('--ink-muted');
  const grid = cssVar('--hairline');
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: prefersReducedMotion() ? false : { duration: 300 },
    plugins: {
      legend: { labels: { color: ink, font: { size: 11 } } },
      tooltip: {
        mode: 'index', intersect: false,
        // Show the human month ("Jan 2026") in the tooltip title, not "2026-01".
        callbacks: { title: (items) => items.length ? fmtMonthLabel(items[0].label) : '' },
      },
    },
    interaction: { mode: 'nearest', axis: 'x', intersect: false },
    scales: {
      // autoSkip + maxTicksLimit keep the axis readable as months accumulate
      // over time (the series grows with every new deposit); maxRotation:0 stops
      // labels tilting to vertical on a phone. Labels render as "Jan 2026".
      x: {
        stacked,
        ticks: {
          color: ink, font: { size: 10 },
          autoSkip: true, maxTicksLimit: 8, maxRotation: 0, minRotation: 0,
          callback(value) { return fmtMonthLabel(this.getLabelForValue(value)); },
        },
        grid: { color: grid },
      },
      y: { stacked, ticks: { color: ink, font: { size: 10 }, callback: (v) => '£' + Math.round(v).toLocaleString() }, grid: { color: grid }, title: { display: !!yLabel, text: yLabel, color: ink, font: { size: 10 } } },
    },
  };
}

export function setStub(sectionId, captionId) {
  const card = document.getElementById(sectionId);
  if (!card) return;
  const wrap = card.querySelector('.chart-wrap') || card.querySelector('svg');
  if (wrap && wrap.tagName === 'DIV') wrap.innerHTML = '<p class="muted">No investment history on file yet — this chart fills in automatically once monthly history rows exist in Supabase.</p>';
  if (wrap && wrap.tagName === 'svg') wrap.replaceChildren();
  const cap = document.getElementById(captionId);
  if (cap) cap.textContent = 'Waiting for investment history.';
}

/**
 * Width the custom SVG charts should draw at: the element's rendered width in
 * CSS px (clamped 300–900), so text set in viewBox units displays ~1:1 on every
 * device instead of shrinking on phones. Falls back to the chart's designed
 * width when the SVG has no layout yet (e.g. jsdom).
 */
export function svgViewWidth(svg, fallback) {
  const w = svg?.clientWidth;
  return Number.isFinite(w) && w > 0
    ? Math.min(900, Math.max(300, Math.round(w)))
    : fallback;
}
