// refinement/trends-glance.js — the "Trends at a glance" summary band at the top of
// the Trends page. Four panels built from the user's like/pass/reject reactions and
// their saved search criteria:
//   1. Reaction mix      — Chart.js stacked horizontal bar (liked / passed / rejected)
//   2. Preference drivers — Chart.js diverging horizontal bar (signed learned weights)
//   3. Top reasons        — ranked HTML table (reject vs like, with CSS mini-bars)
//   4. Selected vs liked  — coverage chips (searched types annotated ✓ liked / ✗ never)
//
// The pure aggregation helpers (reactionMix / topDrivers / reasonCounts / coverage /
// shortLabel) are exported for unit testing in tests/trends-glance.test.js. Rendering
// reuses the honest provenance summary (sweeps stripped) and the shared reason/signal
// vocab — nothing is recomputed here. Charts read colours from tokens via cssVar so they
// honour the palette + dark mode, and animation is disabled under prefers-reduced-motion.
import { provenanceSummary } from '../listings/reaction-provenance.js';
import { REJECT_REASONS, LIKE_REASONS } from '../listings/reactions.js';
import { cssVar } from '../css-vars.js';
import { prefersReducedMotion } from '../motion.js';
import { esc } from '../dom.js';

const REJECT_LABEL = new Map(REJECT_REASONS.map((r) => [r.key, r.label]));
const LIKE_LABEL = new Map(LIKE_REASONS.map((r) => [r.key, r.label]));

// ── pure aggregation helpers (unit-tested) ───────────────────────────────────

/** Headline totals from the honest provenance summary (bulk sweeps already stripped). */
export function reactionMix(log) {
  const ind = provenanceSummary(log || []).individual;
  return { liked: ind.likes, passed: ind.passes, rejected: ind.rejects, total: ind.total };
}

/** Compact axis label for a learned-signal key, e.g. 'type:detached' → 'Detached'. */
export function shortLabel(signal) {
  const [kind, ...rest] = String(signal).split(':');
  const val = rest.join(':');
  const cap = (s) => s.replace(/(^|[\s-])([a-z])/g, (_, sep, ch) => sep + ch.toUpperCase());
  switch (kind) {
    case 'type':       return cap(val.replace(/-/g, ' '));
    case 'beds':       return `${val} bed${val === '1' ? '' : 's'}`;
    case 'baths':      return `${val} bath${val === '1' ? '' : 's'}`;
    case 'outcode':    return val.toUpperCase();
    case 'area':       return cap(val.replace(/-/g, ' '));
    case 'price-band': return `£${val}`;
    case 'outdoor':    return val === 'yes' ? 'Has outdoor' : 'No outdoor';
    case 'parking':    return val === 'yes' ? 'Has parking' : 'No parking';
    default:           return signal;
  }
}

/**
 * The strongest learned signals by absolute weight. Returns signed rows so a diverging
 * chart can lean like-positive right / reject-negative left.
 * @param {object} derived  learned_preferences.derived map
 * @param {number} [n=6]
 */
export function topDrivers(derived, n = 6) {
  return Object.entries(derived || {})
    .map(([signal, d]) => ({
      signal,
      label: shortLabel(signal),
      weight: Number(d?.weight) || 0,
      n_liked: d?.n_liked || 0,
      n_rejected: d?.n_rejected || 0,
    }))
    .filter((r) => r.weight !== 0)
    .sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight))
    .slice(0, n);
}

/** Ranked reason counts from the reaction log, split reject vs like, top `n` each. */
export function reasonCounts(log, n = 5) {
  const tally = (rows, labels) => {
    const counts = new Map();
    for (const r of rows) {
      const list = Array.isArray(r.reasons) ? r.reasons : [];
      for (const item of list) {
        const key = typeof item === 'string' ? item : item?.key;
        if (!key || !labels.has(key)) continue; // skip system/unknown keys
        counts.set(key, (counts.get(key) || 0) + 1);
      }
    }
    return [...counts.entries()]
      .map(([key, count]) => ({ key, label: labels.get(key), count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, n);
  };
  const rows = Array.isArray(log) ? log : [];
  return {
    reject: tally(rows.filter((r) => r.reaction === 'reject'), REJECT_LABEL),
    like: tally(rows.filter((r) => r.reaction === 'like'), LIKE_LABEL),
  };
}

/**
 * Coverage of the property types the user SEARCHES for (criteria) vs whether they've
 * ever actually liked one. Surfaces "searched but never picked" gaps.
 */
export function coverage(criteria, derived) {
  const types = Array.isArray(criteria?.propertyTypes) ? criteria.propertyTypes : [];
  const likedTypes = new Set(
    Object.entries(derived || {})
      .filter(([sig, d]) => sig.startsWith('type:') && (d?.n_liked || 0) > 0)
      .map(([sig]) => sig.slice('type:'.length)),
  );
  return types.map((t) => ({ type: t, liked: likedTypes.has(String(t).toLowerCase()) }));
}

// ── rendering ────────────────────────────────────────────────────────────────

const charts = {}; // id → Chart instance (destroyed before re-render to avoid leaks)

function chartBase() {
  const ink = cssVar('--ink-muted');
  const grid = cssVar('--hairline');
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: prefersReducedMotion() ? false : { duration: 300 },
    ink, grid,
  };
}

function renderMixChart(mix) {
  const canvas = document.getElementById('glance-mix-canvas');
  const caption = document.getElementById('glance-mix-caption');
  const table = document.getElementById('glance-mix-table');
  if (!canvas || typeof window.Chart === 'undefined') return;
  charts.mix?.destroy();

  const graded = mix.liked + mix.rejected;
  if (mix.total === 0) {
    if (caption) caption.textContent = 'React to a few homes to see your keep-vs-reject split.';
    if (table) table.textContent = '';
    return;
  }
  const base = chartBase();
  charts.mix = new window.Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels: ['Homes you reviewed'],
      datasets: [
        { label: 'Liked', data: [mix.liked], backgroundColor: cssVar('--accent') },
        { label: 'Passed', data: [mix.passed], backgroundColor: cssVar('--ink-subtle') },
        { label: 'Rejected', data: [mix.rejected], backgroundColor: cssVar('--danger') },
      ],
    },
    options: {
      indexAxis: 'y',
      responsive: base.responsive,
      maintainAspectRatio: base.maintainAspectRatio,
      animation: base.animation,
      plugins: { legend: { labels: { color: base.ink, font: { size: 11 } } }, tooltip: { mode: 'index', intersect: false } },
      scales: {
        x: { stacked: true, ticks: { color: base.ink, font: { size: 10 }, precision: 0 }, grid: { color: base.grid } },
        y: { stacked: true, ticks: { color: base.ink, font: { size: 10 } }, grid: { display: false } },
      },
    },
  });
  if (caption) {
    const pct = graded ? Math.round((mix.liked / graded) * 100) : 0;
    caption.textContent = `You like ${pct}% of the homes you judge — ${mix.liked} kept, ${mix.rejected} rejected, ${mix.passed} skipped.`;
  }
  if (table) {
    table.innerHTML = `<table><caption>Reaction totals</caption><tbody>
      <tr><th scope="row">Liked</th><td>${mix.liked}</td></tr>
      <tr><th scope="row">Passed</th><td>${mix.passed}</td></tr>
      <tr><th scope="row">Rejected</th><td>${mix.rejected}</td></tr></tbody></table>`;
  }
}

function renderDriversChart(derived) {
  const canvas = document.getElementById('glance-drivers-canvas');
  const caption = document.getElementById('glance-drivers-caption');
  const table = document.getElementById('glance-drivers-table');
  if (!canvas || typeof window.Chart === 'undefined') return;
  charts.drivers?.destroy();

  const rows = topDrivers(derived, 6);
  if (rows.length === 0) {
    if (caption) caption.textContent = 'Once the engine has enough signal, the attributes driving your choices appear here.';
    if (table) table.textContent = '';
    return;
  }
  const base = chartBase();
  const accent = cssVar('--accent');
  const danger = cssVar('--danger');
  charts.drivers = new window.Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels: rows.map((r) => r.label),
      datasets: [{
        data: rows.map((r) => Number(r.weight.toFixed(3))),
        backgroundColor: rows.map((r) => (r.weight >= 0 ? accent : danger)),
        borderWidth: 0,
      }],
    },
    options: {
      indexAxis: 'y',
      responsive: base.responsive,
      maintainAspectRatio: base.maintainAspectRatio,
      animation: base.animation,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => `${c.raw >= 0 ? 'Pulls toward like' : 'Pushes toward reject'} (${c.raw})` } } },
      scales: {
        x: { ticks: { color: base.ink, font: { size: 10 } }, grid: { color: base.grid }, suggestedMin: -1, suggestedMax: 1 },
        y: { ticks: { color: base.ink, font: { size: 10 } }, grid: { display: false } },
      },
    },
  });
  const pos = rows.find((r) => r.weight > 0);
  const neg = rows.find((r) => r.weight < 0);
  if (caption) {
    const parts = [];
    if (pos) parts.push(`strongest pull: ${pos.label}`);
    if (neg) parts.push(`biggest turn-off: ${neg.label}`);
    caption.textContent = parts.length ? `${parts.join(' · ')}.` : 'Your preference signals are still settling.';
  }
  if (table) {
    table.innerHTML = `<table><caption>Preference drivers (signed weight)</caption><tbody>${
      rows.map((r) => `<tr><th scope="row">${esc(r.label)}</th><td>${r.weight >= 0 ? 'like' : 'reject'} ${r.weight.toFixed(2)}</td></tr>`).join('')
    }</tbody></table>`;
  }
}

function reasonColumn(title, items, empty) {
  if (!items.length) return `<div class="glance-reasons__col"><h4 class="glance-reasons__h">${esc(title)}</h4><p class="glance-reasons__empty">${esc(empty)}</p></div>`;
  const max = Math.max(...items.map((i) => i.count));
  const rows = items.map((i) => {
    const pct = Math.round((i.count / max) * 100);
    return `<li class="glance-reason"><span class="glance-reason__label">${esc(i.label)}</span>
      <span class="glance-reason__bar" data-pct="${pct}"></span>
      <span class="glance-reason__n">${i.count}</span></li>`;
  }).join('');
  return `<div class="glance-reasons__col"><h4 class="glance-reasons__h">${esc(title)}</h4><ul class="glance-reasons__list">${rows}</ul></div>`;
}

function renderReasons(log) {
  const el = document.getElementById('glance-reasons');
  if (!el) return;
  const { reject, like } = reasonCounts(log, 5);
  if (!reject.length && !like.length) {
    el.innerHTML = '<p class="glance-reasons__empty">Add reasons when you like or reject a home and they\'ll be ranked here.</p>';
    return;
  }
  el.innerHTML = reasonColumn('Why you reject', reject, 'No reject reasons logged yet.')
    + reasonColumn('Why you like', like, 'No like reasons logged yet.');
  // Set bar widths via CSS custom property (lint: no inline style / .style.width).
  el.querySelectorAll('.glance-reason__bar').forEach((bar) => {
    bar.style.setProperty('--pct', `${bar.dataset.pct}%`);
  });
}

function renderCoverage(criteria, derived) {
  const el = document.getElementById('glance-coverage');
  if (!el) return;
  const rows = coverage(criteria, derived);
  if (!rows.length) {
    el.innerHTML = '<p class="glance-reasons__empty">Set the property types you\'re searching for in Criteria to see coverage here.</p>';
    return;
  }
  const chips = rows.map((r) => `<li class="glance-chip glance-chip--${r.liked ? 'liked' : 'never'}">
      <span class="glance-chip__icon" aria-hidden="true">${r.liked ? '✓' : '✗'}</span>
      <span class="glance-chip__type">${esc(r.type)}</span>
      <span class="glance-chip__state">${r.liked ? 'liked' : 'never picked'}</span></li>`).join('');
  const never = rows.filter((r) => !r.liked);
  const note = never.length
    ? `You search for ${rows.length} types but have never liked ${never.map((r) => esc(r.type)).join(', ')}.`
    : `You've liked at least one home in every property type you search for.`;
  el.innerHTML = `<ul class="glance-chips">${chips}</ul><p class="glance-coverage__note">${note}</p>`;
}

/** Render the whole "Trends at a glance" band. Called from page-refinement.js refresh(). */
export function renderTrendsGlance({ reactionLog, prefs, criteria }) {
  const derived = prefs?.derived || {};
  renderMixChart(reactionMix(reactionLog));
  renderDriversChart(derived);
  renderReasons(reactionLog || []);
  renderCoverage(criteria || {}, derived);
}
