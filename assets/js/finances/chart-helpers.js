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
      tooltip: { mode: 'index', intersect: false },
    },
    interaction: { mode: 'nearest', axis: 'x', intersect: false },
    scales: {
      x: { stacked, ticks: { color: ink, font: { size: 10 } }, grid: { color: grid } },
      y: { stacked, ticks: { color: ink, font: { size: 10 }, callback: (v) => '£' + Math.round(v).toLocaleString() }, grid: { color: grid }, title: { display: !!yLabel, text: yLabel, color: ink, font: { size: 10 } } },
    },
  };
}

export function setStub(sectionId, captionId) {
  const card = document.getElementById(sectionId);
  if (!card) return;
  const wrap = card.querySelector('.chart-wrap') || card.querySelector('svg');
  if (wrap && wrap.tagName === 'DIV') wrap.innerHTML = '<p class="muted">ISA history not yet imported — run <code>node tools/import-trading212.mjs</code> to populate this chart.</p>';
  if (wrap && wrap.tagName === 'svg') wrap.replaceChildren();
  const cap = document.getElementById(captionId);
  if (cap) cap.textContent = 'Run the Trading 212 importer to see this chart.';
}
