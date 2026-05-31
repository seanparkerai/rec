// page-listings.js — v3 Live Listings page coordinator (L1 + L2).
// Loads fetcher-written listings, scores each with the listing-fit engine
// (5-band verdict + affordability hard gate + explainable contributions),
// and renders a fit-ranked feed with the "why" for every verdict. L3 adds
// per-row reaction capture (like/pass/reject + reject reason chips, append-only)
// and a personal-status select on the shortlist record. Learned preferences
// (using these reactions) arrive in L4.
import {
  getListings, getCriteria, getFinances, getAreas,
  getListingReactions, saveListingReaction,
  getShortlistStatuses, setShortlistStatus,
  getLearnedPreferences, recomputeLearnedPreferences,
  getReactionLog, dismissConflict,
  getReviewedListings, addReviewedListing,
} from './storage.js';
import { detectConflicts, dismissUntil } from './meta-observations.js';
import { deriveFinances } from './finance-derive.js';
import { scoreListingFit } from './listing-fit.js';
import { PERSONAL_STATUSES } from './listing-reactions.js';
import { buildReasonPicker } from './listing-reactions-ui.js';
import {
  effectiveWeights, listingLearnedPrefs, isRecent, gradedCount, isColdStart,
  diversifySelection, listingBucketKey, describeSignal, trainingProgress,
} from './learned-preferences.js';
import { LEARNED_PREF, RECENCY_DAYS, TRAINING_MILESTONES } from './intelligence-constants.js';
import { url } from './config.js';
import { el, clear } from './dom.js';

const dossierHref = (listing) => `${url('pages/property.html')}?id=${encodeURIComponent(listing.rightmove_id)}`;

const PERSONAL_STATUS_LABELS = {
  new: 'New', saved: 'Saved', viewed: 'Viewed', offered: 'Offered', rejected: 'Rejected',
};

const VERDICT_LABELS = {
  strong: 'Strong match',
  possible: 'Possible match',
  stretch: 'Stretch',
  weak: 'Weak match',
  reject: 'Reject',
  unknown: 'Unscored',
};

const STATUS_LABELS = {
  live: 'For sale',
  under_offer: 'Under offer',
  sstc: 'Sold STC',
  withdrawn: 'Withdrawn',
};

function fmtPrice(n) {
  if (n == null) return '—';
  return '£' + Math.round(n).toLocaleString('en-GB');
}

function fmtAgo(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return '';
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days}d ago`;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function lastPriceDrop(listing) {
  const h = Array.isArray(listing.price_history) ? listing.price_history : [];
  if (h.length < 2) return null;
  const prev = h[h.length - 2]?.price, now = h[h.length - 1]?.price;
  if (prev != null && now != null && now < prev) return prev - now;
  return null;
}

function buildWhy(scored) {
  const items = (scored.contributions || [])
    .slice()
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .map((c) => {
      const sign = c.delta > 0 ? '＋' : '－';
      // Prettify the L4 learned-preference contributions (the scoring seam labels
      // them "Learned preference: <signal>"); keep everything else verbatim.
      let label = c.label;
      if (typeof c.signal === 'string' && c.signal.startsWith('learned:')) {
        const verb = c.delta > 0 ? 'You tend to like' : 'You tend to pass on';
        label = `${verb} ${describeSignal(c.signal.slice('learned:'.length))}`;
      }
      return el('li', { class: `listing-why__item listing-why__item--${c.delta > 0 ? 'pos' : 'neg'}` }, [
        el('span', { class: 'listing-why__sign', 'aria-hidden': 'true' }, sign),
        el('span', { class: 'listing-why__label' }, label),
      ]);
    });
  if (!items.length) items.push(el('li', { class: 'listing-why__item' }, 'No distinguishing signals — neutral fit.'));
  return el('details', { class: 'listing-why' }, [
    el('summary', {}, 'Why this verdict'),
    el('ul', { class: 'listing-why__list' }, items),
  ]);
}

// Personal-status select (lives on the shortlist record, not a parallel machine).
function buildStatus(listing, current, onStatus) {
  const sel = el('select', { class: 'listing-status', 'aria-label': 'Personal status' }, [
    el('option', { value: '' }, 'No status'),
    ...PERSONAL_STATUSES.map((s) => el('option', { value: s, selected: current === s }, PERSONAL_STATUS_LABELS[s])),
  ]);
  sel.addEventListener('change', () => onStatus(sel.value || null));
  return el('label', { class: 'listing-status-wrap' }, [
    el('span', { class: 'listing-status__label' }, 'Status'),
    sel,
  ]);
}

// Shared media well with graceful fallback: a broken/blocked image swaps to a
// monogram so a card never shows a stretched or empty box. `base` is the BEM block.
// When `href` is given (Stage 6b), the media is a keyboard-accessible link that
// opens OUR dossier (distinct from the external Rightmove button) — the whole
// image becomes the affordance, not a bare click handler on an <img>.
function buildMedia(listing, base, href) {
  const title = listing.title || `${listing.beds ?? '?'}-bed ${listing.property_type || 'property'}`;
  const monogram = () => el('div', { class: `${base} ${base}--none`, 'aria-hidden': 'true' },
    (listing.property_type || '•').slice(0, 1).toUpperCase());
  const inner = listing.image_url
    ? (() => {
        const img = el('img', {
          class: `${base}__img`, src: listing.image_url, alt: '',
          loading: 'lazy', decoding: 'async', referrerpolicy: 'no-referrer',
        });
        const box = el('div', { class: base }, [img]);
        // Replace only the inner box on error; any wrapping link stays in place.
        img.addEventListener('error', () => box.replaceWith(monogram()), { once: true });
        return box;
      })()
    : monogram();
  function wrapLink(node) {
    return el('a', {
      class: `${base}-link`, href, 'aria-label': `Open dossier for ${title}`,
    }, [node]);
  }
  return href ? wrapLink(inner) : inner;
}

function metaLine(listing) {
  return [
    listing.beds != null ? `${listing.beds} bed` : '',
    listing.baths != null ? `${listing.baths} bath` : '',
    listing.property_type || '',
    fmtAgo(listing.added_date || listing.first_seen),
  ].filter(Boolean).join(' · ');
}

function buildRow(listing, idx, scored, area, ctx = {}) {
  const verdict = scored?.verdict || 'unknown';

  const placeBits = [];
  if (listing.address) placeBits.push(listing.address);
  else if (area?.name) placeBits.push(area.name);
  if (listing.outcode) placeBits.push(listing.outcode);

  const tags = [];
  if (listing.status && listing.status !== 'live') {
    tags.push(el('span', { class: `listing-tag listing-tag--${listing.status}` }, STATUS_LABELS[listing.status] || listing.status));
  }
  const drop = lastPriceDrop(listing);
  if (drop) tags.push(el('span', { class: 'listing-tag listing-tag--drop' }, `↓ ${fmtPrice(drop)}`));
  if (listing.update_reason === 'new') tags.push(el('span', { class: 'listing-tag listing-tag--new' }, 'New'));
  const tagRow = tags.length ? el('div', { class: 'listing-tags' }, tags) : null;

  const controls = ctx.onSave
    ? el('div', { class: 'listing-controls' }, [
        buildReasonPicker({
          variant: 'row',
          current: ctx.reaction,
          onSave: (d) => ctx.onSave(listing, d),
        }),
        buildStatus(listing, ctx.status, (status) => ctx.onStatus(listing, status)),
      ])
    : null;

  // Stage 6b: the external Rightmove link as a clear button, visually distinct
  // from the image-link (which opens OUR dossier).
  const open = listing.url
    ? el('a', { class: 'listing-card__rm btn-rm', href: listing.url, target: '_blank', rel: 'noopener' }, 'View on Rightmove ↗')
    : null;

  const content = el('div', { class: 'listing-card__content' }, [
    el('div', { class: 'listing-card__head' }, [
      el('span', { class: `fit-dot fit-dot--${verdict}`, 'aria-hidden': 'true' }),
      el('span', { class: `verdict verdict--${verdict}` }, VERDICT_LABELS[verdict]),
      ctx.reviewed ? el('span', { class: 'listing-card__reviewed-tag' }, '✓ Reviewed') : null,
      el('span', { class: 'listing-card__price num' }, fmtPrice(listing.price)),
    ].filter(Boolean)),
    el('p', { class: 'listing-card__title' }, [
      el('a', { class: 'listing-card__title-link', href: dossierHref(listing) },
        listing.title || `${listing.beds ?? '?'}-bed ${listing.property_type || 'property'}`),
    ]),
    el('p', { class: 'listing-card__place' }, placeBits.join(' · ')),
    el('p', { class: 'listing-card__meta num' }, metaLine(listing)),
    tagRow,
    buildWhy(scored),
    controls,
    open,
  ].filter(Boolean));

  const reviewedClass = ctx.reviewed
    ? ` listing-card--reviewed listing-card--${REVIEWED_MOD[ctx.reaction?.reaction] || 'reviewed'}`
    : '';
  return el('li', { class: `listing-card${reviewedClass}`, 'data-id': listing.rightmove_id }, [
    buildMedia(listing, 'listing-media', dossierHref(listing)),
    content,
  ]);
}

// Reaction verb → reviewed-card modifier (green "actioned" tint, distinct per verb).
const REVIEWED_MOD = { like: 'liked', reject: 'rejected', pass: 'passed' };

function buildSummary(shown, total, gatedCount) {
  const bits = [`${shown} listing${shown === 1 ? '' : 's'} shown`];
  if (gatedCount) bits.push(`${gatedCount} out of reach (hidden)`);
  if (total !== shown + gatedCount) bits.push(`${total} fetched`);
  return el('p', { class: 'listings-summary' }, bits.join(' · '));
}

// ── Review deck (cold-start bulk triage) ────────────────────────────────────
// One full listing at a time; a reaction advances to the next un-reviewed recent
// listing. Built for clearing the whole recent wave en masse so Layer-2 learning
// gets dense, contrastive signal fast (the cold-start strategy).
function buildDeckProgress(done, total) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  const fill = el('span', { class: 'deck-progress__fill' });
  fill.style.width = `${pct}%`;
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

function buildTrainingProgress(p, deckDone, deckTotal) {
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
  likeFill.style.width = `${likePct}%`;
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

  return el('div', { class: 'training' }, [
    el('div', { class: 'training__head' }, [
      el('span', { class: `learning-status__dot${p.cold ? '' : ' learning-status__dot--on'}`, 'aria-hidden': 'true' }),
      el('span', { class: 'training__headline' }, headline),
    ]),
    bar,
    balance,
    el('p', { class: `training__next${p.imbalanced ? ' training__next--alert' : ''}` }, p.nextAction),
    reviewedLine,
  ].filter(Boolean));
}

function buildDeckCard(listing, scored, area, handlers) {
  const verdict = scored?.verdict || 'unknown';
  const media = buildMedia(listing, 'deck-media', dossierHref(listing));

  const tags = [];
  if (listing.status && listing.status !== 'live') tags.push(el('span', { class: `listing-tag listing-tag--${listing.status}` }, STATUS_LABELS[listing.status] || listing.status));
  const drop = lastPriceDrop(listing);
  if (drop) tags.push(el('span', { class: 'listing-tag listing-tag--drop' }, `↓ ${fmtPrice(drop)}`));

  const placeBits = [];
  if (listing.address) placeBits.push(listing.address);
  else if (area?.name) placeBits.push(area.name);
  if (listing.outcode) placeBits.push(listing.outcode);

  const metaBits = [
    listing.beds != null ? `${listing.beds} bed` : '',
    listing.baths != null ? `${listing.baths} bath` : '',
    listing.property_type || '',
    fmtAgo(listing.added_date),
  ].filter(Boolean);

  const body = el('div', { class: 'deck-card__body' }, [
    el('div', { class: 'deck-card__head' }, [
      el('span', { class: `fit-dot fit-dot--${verdict}`, 'aria-hidden': 'true' }),
      el('span', { class: `verdict verdict--${verdict}` }, VERDICT_LABELS[verdict]),
      el('span', { class: 'deck-card__price num' }, fmtPrice(listing.price)),
    ]),
    el('p', { class: 'deck-card__title' }, listing.title || `${listing.beds ?? '?'}-bed ${listing.property_type || 'property'}`),
    el('p', { class: 'deck-card__place' }, placeBits.join(' · ')),
    el('p', { class: 'deck-card__meta num' }, metaBits.join(' · ')),
    tags.length ? el('div', { class: 'listing-tags' }, tags) : null,
    buildWhy(scored),
    el('div', { class: 'deck-card__links' }, [
      el('a', { class: 'deck-card__open', href: dossierHref(listing) }, 'Full details →'),
      listing.url ? el('a', { class: 'deck-card__rm btn-rm', href: listing.url, target: '_blank', rel: 'noopener' }, 'View on Rightmove ↗') : null,
    ].filter(Boolean)),
    buildReasonPicker({
      variant: 'deck',
      current: handlers.current || null,
      onSave: (d) => handlers.onSave(d),
    }),
  ].filter(Boolean));

  return el('article', { class: 'deck-card', 'data-id': listing.rightmove_id }, [media, body]);
}

async function render() {
  const main = document.querySelector('#main') || document.body;
  const listEl = main.querySelector('[data-listings]') || main.querySelector('.area-list');
  const deckEl = main.querySelector('[data-review-deck]');
  const summaryEl = main.querySelector('[data-listings-summary]');
  const learningEl = main.querySelector('[data-learning]');
  const conflictsEl = main.querySelector('[data-conflicts]');
  const showOOR = main.querySelector('[data-show-oor]');
  const browseOnly = main.querySelector('[data-browse-only]');
  const reviewCountEl = main.querySelector('[data-review-count]');
  const modeBtns = [...main.querySelectorAll('[data-mode]')];
  if (!listEl) return;

  const [listings, criteria, rawFinances, areas, reactions, statuses, learned, reactionLogInit] = await Promise.all([
    getListings({ limit: 200 }), getCriteria(), getFinances(), getAreas(),
    getListingReactions(), getShortlistStatuses(), getLearnedPreferences(), getReactionLog(),
  ]);
  const finances = rawFinances ? deriveFinances(rawFinances) : null;
  const areasById = new Map((areas || []).map((a) => [a.id, a]));
  const now = new Date();

  // Layer 2 ⊕ Layer 3 → the effective weights fed (per-listing) into scoring.
  let overrides = learned?.overrides || {};
  let effective = effectiveWeights(learned?.derived || {}, overrides);
  let dismissals = learned?.dismissals || {};
  let reactionLog = reactionLogInit || [];

  const areaOf = (l) => (l.area_id ? areasById.get(l.area_id) : null);
  const scoreOf = (l) => (finances
    ? scoreListingFit({ listing: l, finances, criteria, area: areaOf(l), learnedPrefs: listingLearnedPrefs(l, effective) })
    : { verdict: 'unknown', score: 0, gated: false, contributions: [] });

  // Reviewed set (Stage 4 Browse collapse). "Reviewed" = the user pressed Save on
  // the property. Seeded from the local marker store UNION the ids that already
  // carry a reaction at load (pre-existing decisions read as reviewed), then grown
  // by each Save. Local-only affordance over the append-only log.
  const reviewedSet = new Set([
    ...getReviewedListings().map(String),
    ...Object.keys(reactions || {}).map(String),
  ]);
  const isReviewed = (id) => reviewedSet.has(String(id));

  // Snapshot the listing at reaction time so the training signal survives the
  // live row being withdrawn/deleted (L3 durability).
  const snapshotOf = (l) => ({
    rightmove_id: l.rightmove_id, title: l.title, address: l.address, outcode: l.outcode,
    area_id: l.area_id, price: l.price, beds: l.beds, baths: l.baths,
    property_type: l.property_type, status: l.status, url: l.url,
  });

  // Persist ONLY on Save (one clean consolidated row per finished decision). Verb
  // taps in the picker stay local — writing them too would double-count in the
  // full-log training (deriveWeights reads every row) and a no-reasons verb row
  // would dilute the attributed Save row. Append-only + snapshot-durable intact.
  const onSave = async (listing, { reaction, reasons }) => {
    const ok = await saveListingReaction({
      listing_id: listing.rightmove_id, reaction, reasons, listing_snapshot: snapshotOf(listing),
    });
    if (!ok) return false;
    reactions[listing.rightmove_id] = {
      reaction,
      reason: reaction === 'reject' ? (reasons?.[0]?.key ?? null) : null,
      reasons: reasons || [],
      created_at: new Date().toISOString(),
    };
    reviewedSet.add(String(listing.rightmove_id));
    addReviewedListing(listing.rightmove_id);
    return true;
  };
  const onStatus = async (listing, status) => {
    const ok = await setShortlistStatus(listing.rightmove_id, status);
    if (ok) { if (status) statuses[listing.rightmove_id] = status; else delete statuses[listing.rightmove_id]; }
  };

  // The recent "wave" the cold-start deck reviews: added within RECENCY_DAYS and
  // not affordability-gated (gating is learning-independent, so the wave is
  // stable). Diversified once so consecutive cards contrast (faster learning).
  const deckOrder = diversifySelection(
    listings.filter((l) => isRecent(l, now) && !scoreOf(l).gated),
    listingBucketKey,
  );
  // ── learning state / training feedback (Stage 5 rich, balance-aware) ──────
  const deckDoneCount = () => deckOrder.filter((l) => isReviewed(l.rightmove_id)).length;
  function updateLearning() {
    if (!learningEl) return;
    if (!listings.length) { learningEl.hidden = true; return; }
    const p = trainingProgress(Object.values(reactions));
    clear(learningEl);
    learningEl.hidden = false;
    learningEl.classList.add('learning-status--rich');
    learningEl.classList.toggle('learning-status--cold', p.cold);
    learningEl.classList.toggle('training--imbalanced', p.imbalanced);
    learningEl.appendChild(buildTrainingProgress(p, deckDoneCount(), deckOrder.length));
  }
  function updateReviewCount() {
    const n = deckOrder.filter((l) => !isReviewed(l.rightmove_id)).length;
    if (reviewCountEl) { reviewCountEl.hidden = n === 0; reviewCountEl.textContent = n ? ` ${n}` : ''; }
  }

  // ── conflict prompts (L5) — likes that contradict stated criteria ─────────
  function updateConflicts() {
    if (!conflictsEl) return;
    clear(conflictsEl);
    const conflicts = detectConflicts(reactionLog, criteria, { now: new Date(), dismissals });
    for (const c of conflicts) {
      const dismiss = el('button', { type: 'button', class: 'conflict-prompt__dismiss' }, 'Dismiss for 14 days');
      dismiss.addEventListener('click', async () => {
        const until = dismissUntil(new Date());
        dismissals = { ...dismissals, [c.key]: until };
        await dismissConflict(c.key, until);
        updateConflicts();
      });
      conflictsEl.appendChild(el('div', { class: 'conflict-prompt', role: 'note' }, [
        el('div', { class: 'conflict-prompt__body' }, [
          el('p', { class: 'conflict-prompt__msg' }, c.message),
          el('p', { class: 'conflict-prompt__hint' }, c.suggestion),
        ]),
        el('div', { class: 'conflict-prompt__actions' }, [
          el('a', { class: 'conflict-prompt__adjust', href: `${url('pages/about-search.html')}#search` }, 'Adjust criteria →'),
          dismiss,
        ]),
      ]));
    }
  }

  // ── debounced authoritative re-training (full reaction log) ─────────────
  let retrainTimer = null;
  let retraining = false;
  function scheduleRetrain() {
    if (retrainTimer) clearTimeout(retrainTimer);
    retrainTimer = setTimeout(runRetrain, 1800);
  }
  async function runRetrain() {
    if (retraining) { scheduleRetrain(); return; }
    retraining = true;
    try {
      const res = await recomputeLearnedPreferences({ now: new Date() });
      if (res) { overrides = res.overrides || {}; effective = effectiveWeights(res.derived || {}, overrides); dismissals = res.dismissals || dismissals; }
      reactionLog = await getReactionLog();
    } catch { /* surfaced via storage toast */ }
    retraining = false;
    updateLearning();
    updateConflicts();
    if (mode === 'browse') paint();
  }

  // ── Browse mode ─────────────────────────────────────────────────────────
  function paint() {
    clear(listEl);
    const includeOOR = !!(showOOR && showOOR.checked);
    if (!listings.length) {
      listEl.appendChild(el('li', { class: 'listings-empty' }, [
        el('p', {}, 'No listings yet.'),
        el('p', { class: 'listings-empty__hint' }, 'The daily fetch (fetch-listings workflow) hasn’t populated the listings table yet — tap “Fetch new listings” above to run it on GitHub, or check the Apify / Supabase secrets are set.'),
      ]));
      if (summaryEl) clear(summaryEl);
      return;
    }
    const scoredRows = listings.map((listing) => ({ listing, scored: scoreOf(listing), area: areaOf(listing) }));
    const gated = scoredRows.filter((r) => r.scored.gated);
    const visible = includeOOR ? scoredRows : scoredRows.filter((r) => !r.scored.gated);
    visible.sort((a, b) =>
      (b.scored.score - a.scored.score) ||
      (new Date(b.listing.first_seen) - new Date(a.listing.first_seen)));

    // Stage 4: partition into still-to-review (top, fit-ranked) and reviewed
    // (collapsed at the bottom). Reviewed = a Saved consolidated decision.
    const rowCtx = (r, reviewed) => buildRow(r.listing, 0, r.scored, r.area, {
      reaction: reactions[r.listing.rightmove_id] || null,
      status: statuses[r.listing.rightmove_id] || '',
      reviewed, onSave, onStatus,
    });
    const unreviewed = visible.filter((r) => !isReviewed(r.listing.rightmove_id));
    const reviewed = visible.filter((r) => isReviewed(r.listing.rightmove_id));

    unreviewed.forEach((r) => listEl.appendChild(rowCtx(r, false)));

    if (reviewed.length) {
      // Editing a reviewed card in place (change verb/reasons → Save) re-saves and
      // keeps it in this section — the smoother UX than bouncing it back to the top.
      const reviewedUl = el('ul', { class: 'listings reviewed-list' }, reviewed.map((r) => rowCtx(r, true)));
      const details = el('details', { class: 'reviewed-collapse' }, [
        el('summary', { class: 'reviewed-collapse__summary' }, [
          el('span', { class: 'reviewed-collapse__title' }, 'Reviewed'),
          el('span', { class: 'reviewed-collapse__count num' }, String(reviewed.length)),
        ]),
        reviewedUl,
      ]);
      listEl.appendChild(el('li', { class: 'reviewed-collapse-item' }, [details]));
    }

    if (summaryEl) { clear(summaryEl); summaryEl.appendChild(buildSummary(visible.length, listings.length, includeOOR ? 0 : gated.length)); }
  }

  // ── Review mode (the deck) ──────────────────────────────────────────────
  // Save consolidates the decision (verb + reasons) and advances to the next
  // un-reviewed card, so the deck reviews the recent wave one finished decision
  // at a time.
  const deckOnSave = async (cur, d) => {
    const ok = await onSave(cur, d);
    if (!ok) return false;
    paintDeck();
    updateReviewCount();
    updateLearning();
    scheduleRetrain();
    return true;
  };
  function paintDeck() {
    if (!deckEl) return;
    clear(deckEl);
    const total = deckOrder.length;
    const done = deckOrder.filter((l) => isReviewed(l.rightmove_id)).length;
    deckEl.appendChild(buildDeckProgress(done, total));
    if (!total) {
      deckEl.appendChild(el('div', { class: 'deck-done' }, [
        el('p', { class: 'deck-done__title' }, 'Nothing recent to review'),
        el('p', { class: 'deck-done__hint' }, `No listings added in the last ${RECENCY_DAYS} days. Run a fetch to pull fresh recent listings from every area, then come back to review them.`),
      ]));
      return;
    }
    const next = deckOrder.find((l) => !isReviewed(l.rightmove_id));
    if (!next) {
      deckEl.appendChild(el('div', { class: 'deck-done' }, [
        el('p', { class: 'deck-done__title' }, `All ${total} reviewed — your taste is trained.`),
        el('p', { class: 'deck-done__hint' }, 'Switch to Browse for the re-ranked feed, or run a fetch to pull fresh recent listings from every area using your new filters.'),
        el('button', { type: 'button', class: 'deck-done__browse', 'data-goto-browse': '' }, 'See re-ranked feed →'),
      ]));
      const goto = deckEl.querySelector('[data-goto-browse]');
      if (goto) goto.addEventListener('click', () => setMode('browse'));
      return;
    }
    deckEl.appendChild(buildDeckCard(next, scoreOf(next), areaOf(next), {
      current: reactions[next.rightmove_id] || null,
      onSave: (d) => deckOnSave(next, d),
    }));
  }

  // ── Mode switching ──────────────────────────────────────────────────────
  let mode = 'browse';
  function setMode(m) {
    mode = m;
    modeBtns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === m)));
    const review = m === 'review';
    listEl.hidden = review;
    if (deckEl) deckEl.hidden = !review;
    if (browseOnly) browseOnly.hidden = review;
    if (review) { if (summaryEl) clear(summaryEl); paintDeck(); } else { paint(); }
  }
  modeBtns.forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));
  if (showOOR) showOOR.addEventListener('change', () => { if (mode === 'browse') paint(); });

  updateLearning();
  updateReviewCount();
  updateConflicts();
  setMode('browse');
}

render();
