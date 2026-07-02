// page-listings/progress.js — pure view-builders for the listings page's progress
// surfaces: the review-pipeline summary line, the review-deck progress bar, and the
// Stage-5 training-progress widget (milestone bar + balance meter + "what it learned").
// No DOM events beyond the optional <details> toggle; no closure state. Split from
// page-listings.js; imported by it (and exercised indirectly via the page).
import { el } from '../dom.js';
import { describeSignal } from '../learned-preferences.js';
import { LEARNED_PREF } from '../intelligence-constants.js';

// The listings summary makes the review pipeline legible at a glance: how many
// are still to review vs already handled (liked / passed / rejected), plus the
// affordability gate and any filter-hidden count. Returns an array of segment
// nodes (separator-interleaved) appended into the summary <p>; recomputed live as
// the user reacts (renderSummary re-runs on every Save), so the totals move.
export function buildSummary({ review, like, pass, reject, gated, hiddenJunk, hiddenByRefinement, hiddenByFilter, decided, dup }) {
  const seg = (n, label, mod) => el('span', { class: `listings-summary__seg listings-summary__seg--${mod}` }, [
    el('b', { class: 'listings-summary__n' }, String(n)),
    ` ${label}`,
  ]);
  // `to review` is always shown (the primary CTA count); the handled verbs render
  // only when non-zero, so suppression doesn't leave misleading "0 liked / 0
  // rejected" noise once decided rows are hidden out of the feed.
  const segs = [seg(review, 'to review', 'review')];
  if (like) segs.push(seg(like, 'liked', 'like'));
  if (pass) segs.push(seg(pass, 'passed', 'pass'));
  if (reject) segs.push(seg(reject, 'rejected', 'reject'));
  if (decided) segs.push(seg(decided, 'already decided (hidden)', 'decided'));
  if (dup) segs.push(seg(dup, 'duplicates merged', 'dup'));
  if (gated) segs.push(seg(gated, 'out of reach (hidden)', 'gated'));
  if (hiddenJunk) segs.push(seg(hiddenJunk, 'hidden: auction / over-55', 'junk'));
  if (hiddenByRefinement) segs.push(seg(hiddenByRefinement, 'hidden by refinement', 'refinement'));
  if (hiddenByFilter) segs.push(seg(hiddenByFilter, 'hidden by filters', 'filtered'));
  const nodes = [];
  segs.forEach((s, i) => {
    if (i) nodes.push(el('span', { class: 'listings-summary__sep', 'aria-hidden': 'true' }, '·'));
    nodes.push(s);
  });
  return nodes;
}

// ── Review deck (cold-start bulk triage) ────────────────────────────────────
// One full listing at a time; a reaction advances to the next un-reviewed recent
// listing. Built for clearing the whole recent wave en masse so Layer-2 learning
// gets dense, contrastive signal fast (the cold-start strategy).
export function buildDeckProgress(done, total) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  const fill = el('span', { class: 'deck-progress__fill' });
  fill.style.setProperty('--fill-pct', `${pct}%`); // the sanctioned dynamic-value idiom (DESIGN.md §6.7)
  return el('div', { class: 'deck-progress' }, [
    el('div', {
      class: 'deck-progress__bar', role: 'progressbar',
      'aria-valuenow': String(done), 'aria-valuemin': '0', 'aria-valuemax': String(total),
      'aria-label': 'Review progress',
    }, [fill]),
    el('p', { class: 'deck-progress__label num' }, `${done} of ${total} reviewed`),
  ]);
}

// ── Training-progress visual (Stage 5) ──────────────────────────────────────
// An honest, balance-aware answer to "how close am I to a well-trained model?".
// A segmented milestone bar shows VOLUME reached; the % + balance meter show
// EFFECTIVE strength (penalised when the signal is one-sided). NOT one magic
// number — the parts are shown side by side. All math is pure (trainingProgress).
const MILESTONE_SEGMENTS = [
  { key: 'warming-up', label: 'Warming up' },
  { key: 'usable', label: 'Usable' },
  { key: 'solid', label: 'Solid' },
  { key: 'mature', label: 'Mature' },
];
const MILESTONE_INDEX = { 'warming-up': 0, learning: 0, usable: 1, solid: 2, mature: 3 };
const MILESTONE_LABEL = { 'warming-up': 'Warming up', learning: 'Learning', usable: 'Usable', solid: 'Solid', mature: 'Mature' };

// The strongest features the model currently rewards (↑) or penalises (↓),
// derived from the effective weights — the human-readable "what it learned".
export function topLearnedSignals(weights, n = 3) {
  const entries = Object.entries(weights || {}).filter(([, w]) => Number.isFinite(w) && w !== 0);
  const pick = (dir) => entries
    .filter(([, w]) => (dir === 'up' ? w > 0 : w < 0))
    .sort((a, b) => (dir === 'up' ? b[1] - a[1] : a[1] - b[1]))
    .slice(0, n)
    .map(([k]) => ({ label: describeSignal(k), dir }));
  return [...pick('up'), ...pick('down')];
}

// @param {object} [opts] { collapsible, expanded, onToggle, learned } — when
//   collapsible, the widget is a native <details> (summary = live one-line
//   status; body = the bars + what the model has learned). The review deck
//   passes nothing and keeps the original always-open block.
export function buildTrainingProgress(p, deckDone, deckTotal, opts = {}) {
  const { collapsible = false, expanded = false, onToggle, learned = [] } = opts;
  const reached = MILESTONE_INDEX[p.milestone] ?? 0;
  const segs = MILESTONE_SEGMENTS.map((s, i) => el('span', {
    class: `training-seg${i <= reached ? ' training-seg--on' : ''}${i === reached ? ' training-seg--current' : ''}`,
  }, el('span', { class: 'training-seg__label' }, s.label)));
  const bar = el('div', {
    class: 'training-bar', role: 'progressbar',
    'aria-valuenow': String(p.strengthPct), 'aria-valuemin': '0', 'aria-valuemax': '100',
    'aria-label': `Training strength ${p.strengthPct}% — milestone ${p.milestone}`,
  }, segs);

  const total = p.likes + p.rejects;
  const likePct = total ? Math.round((p.likes / total) * 100) : 0;
  const likeFill = el('span', { class: 'training-balance__likes' });
  likeFill.style.setProperty('--fill-pct', `${likePct}%`); // the sanctioned dynamic-value idiom (DESIGN.md §6.7)
  const balance = el('div', { class: 'training-balance' }, [
    el('div', { class: 'training-balance__track', 'aria-hidden': 'true' }, [likeFill]),
    el('p', { class: 'training-balance__label num' }, total
      ? `${p.likes} like${p.likes === 1 ? '' : 's'} · ${p.rejects} reject${p.rejects === 1 ? '' : 's'}`
      : 'No graded reactions yet'),
  ]);

  const headline = p.cold
    ? `Warming up — ${p.graded} of ${LEARNED_PREF.COLD_START_MIN} graded reactions`
    : `${MILESTONE_LABEL[p.milestone]} · ${p.graded} graded · ${p.strengthPct}% trained`;

  const reviewedLine = deckTotal
    ? el('p', { class: 'training__reviewed num' }, `≈${deckDone} reviewed of ${deckTotal} recent`)
    : null;

  const dot = () => el('span', { class: `learning-status__dot${p.cold ? '' : ' learning-status__dot--on'}`, 'aria-hidden': 'true' });
  const nextLine = el('p', { class: `training__next${p.imbalanced ? ' training__next--alert' : ''}` }, p.nextAction);

  if (!collapsible) {
    return el('div', { class: 'training' }, [
      el('div', { class: 'training__head' }, [dot(), el('span', { class: 'training__headline' }, headline)]),
      bar, balance, nextLine, reviewedLine,
    ].filter(Boolean));
  }

  // "Slightly more detail": what the model has actually learned from your
  // graded reactions — shown only in the expanded body, collapsed by default.
  let learnedBlock = null;
  if (learned.length) {
    learnedBlock = el('div', { class: 'training__learned' }, [
      el('p', { class: 'training__learned-title' }, 'What your reactions have taught the model'),
      el('ul', { class: 'training__learned-list' }, learned.map((s) => el('li', {
        class: `training__learned-item training__learned-item--${s.dir}`,
      }, `${s.dir === 'up' ? '↑ leans toward' : '↓ leans away from'} ${s.label}`))),
    ]);
  } else if (!p.cold) {
    learnedBlock = el('p', { class: 'training__learned-empty' }, 'No standout patterns yet — keep reacting and they’ll surface here.');
  }

  const details = el('details', { class: 'training', open: expanded }, [
    el('summary', { class: 'training__summary' }, [
      dot(),
      el('span', { class: 'training__headline' }, headline),
      el('span', { class: 'training__summary-hint' }, 'Details'),
    ]),
    el('div', { class: 'training__body' }, [bar, balance, nextLine, reviewedLine, learnedBlock].filter(Boolean)),
  ]);
  if (onToggle) details.addEventListener('toggle', () => onToggle(details.open));
  return details;
}
