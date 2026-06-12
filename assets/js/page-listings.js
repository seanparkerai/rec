// page-listings.js — v3 Live Listings page coordinator (L1 + L2).
// Loads fetcher-written listings, scores each with the listing-fit engine
// (5-band verdict + affordability hard gate + explainable contributions),
// and renders a fit-ranked feed with the "why" for every verdict. L3 adds
// per-row reaction capture (like/pass/reject + reject reason chips, append-only)
// and a personal-status select on the shortlist record. Learned preferences
// (using these reactions) arrive in L4.
import {
  getListings, getCriteria, getFinances, getHouseholdAreas,
  saveListingReaction,
  getShortlistStatuses, setShortlistStatus,
  getLearnedPreferences, recomputeLearnedPreferences,
  getReactionLog, dismissConflict,
  getReviewedListings, addReviewedListing,
  getListingRatings,
} from './storage.js';
import { createListingsControls } from './listings/controls.js';
import { wireReturnTracking, restoreListFocus } from './listings/nav.js';
import { detectConflicts, dismissUntil } from './meta-observations.js';
import { deriveFinances } from './finance-derive.js';
import { scoreListingFit } from './listings/fit.js';
import { classifyListing, HIDE_LABELS } from './listings/flags.js';
import { PERSONAL_STATUSES, latestPerListing } from './listings/reactions.js';
import { decidedSets, isDecided, foldDecision } from './listings/suppress.js';
import { partitionFeed } from './listings/feed-partition.js';
import { buildReasonPicker } from './listings/reactions-ui.js';
import {
  effectiveWeights, listingLearnedPrefs, isRecent,
  diversifySelection, listingBucketKey, describeSignal, trainingProgress, deriveSearchSpec,
  inferOutdoorSpace, inferParking,
} from './learned-preferences.js';
import { hiddenRulesFromOverrides, listingHiddenByRefinement, matchingHideRule } from './refinement/view.js';
import { LEARNED_PREF, RECENCY_DAYS } from './intelligence-constants.js';
import { url } from './config.js';
import { el, clear } from './dom.js';
import { wireListingsFetch } from './listings/fetch.js';
import { fmtPrice, fmtAgo, lastPriceDrop } from './listings/format.js';
import { VERDICT_LABELS, STATUS_LABELS, PERSONAL_STATUS_LABELS } from './listings/labels.js';

const dossierHref = (listing) => `${url('pages/property.html')}?id=${encodeURIComponent(listing.rightmove_id)}&from=listings`;

const mapBtn = (listing) => {
  if (listing.lat == null || listing.lng == null) return null;
  const a = el('a', { class: 'btn-map', href: `https://maps.google.com/?q=${listing.lat},${listing.lng}`, target: '_blank', rel: 'noopener', 'aria-label': 'Open location in Google Maps' });
  a.innerHTML = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false"><path d="M8 1.5C5.515 1.5 3.5 3.515 3.5 6c0 3.5 4.5 8.5 4.5 8.5s4.5-5 4.5-8.5C12.5 3.515 10.485 1.5 8 1.5zm0 6.25A1.75 1.75 0 1 1 8 4.25a1.75 1.75 0 0 1 0 3.5z" fill="currentColor"/></svg>`;
  return a;
};

// VERDICT / STATUS / PERSONAL_STATUS labels now live in ./listings/labels.js (imported above).

// fmtPrice / fmtAgo / lastPriceDrop now live in ./listings/format.js (imported above).

// Build the geofence chips (distance · village, and the ⚠ flag for an unconfirmed
// location). Shared by the row and the deck card. `area` is the matched area record.
function geoChips(listing, area) {
  const chips = [];
  if (listing.distance_mi != null && listing.area_id) {
    const village = area?.name || listing.area_id;
    chips.push(el('span', { class: 'listing-tag listing-tag--geo' }, `${Number(listing.distance_mi).toFixed(1)} mi · ${village}`));
  }
  if (listing.corroborated === false) {
    chips.push(el('span', { class: 'listing-tag listing-tag--warn', title: 'The map position and the address text disagree on the village' }, '⚠ location unconfirmed'));
  }
  return chips;
}

// Post-fetch classifier chips (listing-flags.js). FLAG chips (new build, condition
// red-flags) are always shown — they're judgement calls you still want to see. The
// HIDE-reason chip only renders when a hidden listing is on screen (i.e. the user
// turned on "Show hidden"), labelling WHY it was hidden. Shared by row + deck card.
function flagChips(listing, hiddenRules = []) {
  const { hide, hideReasons, flags } = classifyListing(listing);
  const chips = flags.map((f) => el('span', { class: 'listing-tag listing-tag--flag' }, f.label));
  if (hide) {
    for (const r of hideReasons) {
      chips.push(el('span', {
        class: 'listing-tag listing-tag--hidden',
        title: 'Normally hidden — showing because “Show hidden” is on',
      }, `🚫 ${HIDE_LABELS[r] || r}`));
    }
  }
  // Stage 5: a listing hidden by a confirmed refinement (a value the user chose to
  // hide from the feed) only renders when "Show hidden" is on; label WHY it's hidden.
  const refRule = matchingHideRule(listing, hiddenRules);
  if (refRule) {
    chips.push(el('span', {
      class: 'listing-tag listing-tag--hidden',
      title: 'Hidden by a refinement you confirmed — showing because “Show hidden” is on',
    }, `🚫 Hidden by refinement: ${refRule.label}`));
  }
  return chips;
}

function buildWhy(scored, listing = null, area = null) {
  // L7 location context (never silent): surface the geofence distance and, when
  // the two location signals disagree, an explicit caution.
  const context = [];
  if (listing && listing.corroborated === false) {
    const mi = listing.distance_mi != null ? `${Number(listing.distance_mi).toFixed(1)} mi from ${area?.name || 'the nearest village'}` : `near ${area?.name || 'the nearest village'}`;
    context.push(el('li', { class: 'listing-why__item listing-why__item--warn' }, [
      el('span', { class: 'listing-why__sign', 'aria-hidden': 'true' }, '⚠'),
      el('span', { class: 'listing-why__label' }, `Coordinates place this ${mi}, but the listing's address text reads differently — check the location before trusting.`),
    ]));
  } else if (listing && listing.distance_mi != null && area) {
    context.push(el('li', { class: 'listing-why__item listing-why__item--context' }, [
      el('span', { class: 'listing-why__sign', 'aria-hidden': 'true' }, '📍'),
      el('span', { class: 'listing-why__label' }, `${Number(listing.distance_mi).toFixed(1)} mi from ${area.name}.`),
    ]));
  }
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
    el('ul', { class: 'listing-why__list' }, [...context, ...items]),
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
          // Inside the labelled dossier link the image is decorative (alt="" avoids
          // a double announcement); standalone it carries the property as its alt.
          class: `${base}__img`, src: listing.image_url, alt: href ? '' : `Photo of ${title}`,
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
  tags.push(...geoChips(listing, area));
  tags.push(...flagChips(listing, ctx.hiddenRules));
  const tagRow = tags.length ? el('div', { class: 'listing-tags' }, tags) : null;

  const controls = ctx.onSave
    ? el('div', { class: 'listing-controls' }, [
        buildReasonPicker({
          variant: 'row',
          current: ctx.reaction,
          draft: ctx.draft || null,
          onDraftChange: ctx.onDraftChange || null,
          onSave: (d) => ctx.onSave(listing, d),
        }),
        buildStatus(listing, ctx.status, (status) => ctx.onStatus(listing, status)),
      ])
    : null;

  // Stage 6b: the external Rightmove link as a clear button, visually distinct
  // from the image-link (which opens OUR dossier).
  const rmLink = listing.url
    ? el('a', { class: 'listing-card__rm btn-rm', href: listing.url, target: '_blank', rel: 'noopener' }, 'View on Rightmove ↗')
    : null;
  const cardLinks = (rmLink || mapBtn(listing))
    ? el('div', { class: 'listing-card__links' }, [rmLink, mapBtn(listing)].filter(Boolean))
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
    buildWhy(scored, listing, area),
    controls,
    cardLinks,
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

// Reviewed listings are split by the user's verdict so the end of a session lands
// on a tidy, consolidated home: Liked, then Passed, then Rejected — all collapsed
// by default so a finished session is a compact set of summaries, not a long feed.
const REVIEWED_GROUPS = [
  { key: 'like',   title: 'Liked',    mod: 'liked',    open: false },
  { key: 'pass',   title: 'Passed',   mod: 'passed',   open: false },
  { key: 'reject', title: 'Rejected', mod: 'rejected', open: false },
];

// One collapsible group (a <li> in the listings <ol>) of reviewed cards. The cards
// are built lazily on first expand (build-on-toggle): a finished session can hold
// many reviewed rows across three collapsed groups, and building every card upfront
// is wasted work. `rows` are raw row-contexts; `buildCard(r)` makes the card <li>.
function buildReviewedGroup(cfg, rows, buildCard) {
  const list = el('ul', { class: 'listings reviewed-list' });
  let built = false;
  const fill = () => {
    if (built) return;
    built = true;
    for (const r of rows) list.appendChild(buildCard(r));
  };
  list.setAttribute('aria-label', `${cfg.title} — reviewed listings`);
  const details = el('details', { class: `reviewed-collapse reviewed-collapse--${cfg.mod}` }, [
    el('summary', {
      class: 'reviewed-collapse__summary',
      'aria-label': `${cfg.title}: ${rows.length} reviewed listing${rows.length === 1 ? '' : 's'}`,
    }, [
      el('span', { class: 'reviewed-collapse__title' }, cfg.title),
      el('span', { class: 'reviewed-collapse__count num' }, String(rows.length)),
    ]),
    list,
  ]);
  details.open = cfg.open;
  if (details.open) fill();               // an initially-open group builds immediately
  details.addEventListener('toggle', () => { if (details.open) fill(); });
  return el('li', { class: 'reviewed-collapse-item' }, [details]);
}

// The listings summary makes the review pipeline legible at a glance: how many
// are still to review vs already handled (liked / passed / rejected), plus the
// affordability gate and any filter-hidden count. Returns an array of segment
// nodes (separator-interleaved) appended into the summary <p>; recomputed live as
// the user reacts (renderSummary re-runs on every Save), so the totals move.
function buildSummary({ review, like, pass, reject, gated, hiddenJunk, hiddenByRefinement, hiddenByFilter, decided, dup }) {
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

// The strongest features the model currently rewards (↑) or penalises (↓),
// derived from the effective weights — the human-readable "what it learned".
function topLearnedSignals(weights, n = 3) {
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
function buildTrainingProgress(p, deckDone, deckTotal, opts = {}) {
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

function buildDeckCard(listing, scored, area, handlers) {
  const verdict = scored?.verdict || 'unknown';
  const media = buildMedia(listing, 'deck-media', dossierHref(listing));

  const tags = [];
  if (listing.status && listing.status !== 'live') tags.push(el('span', { class: `listing-tag listing-tag--${listing.status}` }, STATUS_LABELS[listing.status] || listing.status));
  const drop = lastPriceDrop(listing);
  if (drop) tags.push(el('span', { class: 'listing-tag listing-tag--drop' }, `↓ ${fmtPrice(drop)}`));
  tags.push(...geoChips(listing, area));
  tags.push(...flagChips(listing, handlers.hiddenRules));

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
    buildWhy(scored, listing, area),
    el('div', { class: 'deck-card__links' }, [
      el('a', { class: 'deck-card__open', href: dossierHref(listing) }, 'Full details →'),
      listing.url ? el('a', { class: 'deck-card__rm btn-rm', href: listing.url, target: '_blank', rel: 'noopener' }, 'View on Rightmove ↗') : null,
      mapBtn(listing),
    ].filter(Boolean)),
    buildReasonPicker({
      variant: 'deck',
      current: handlers.current || null,
      draft: handlers.draft || null,
      onDraftChange: handlers.onDraftChange || null,
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
  const showHidden = main.querySelector('[data-show-hidden]');
  const browseOnly = main.querySelector('[data-browse-only]');
  const filterBar = main.querySelector('[data-listings-filter]');
  const reviewCountEl = main.querySelector('[data-review-count]');
  const modeBtns = [...main.querySelectorAll('[data-mode]')];
  if (!listEl) return;

  const [listings, criteria, rawFinances, areas, statuses, learned, reactionLogInit, ratings] = await Promise.all([
    getListings({ limit: null }), getCriteria(), getFinances(), getHouseholdAreas(),
    getShortlistStatuses(), getLearnedPreferences(), getReactionLog(),
    getListingRatings(),
  ]);
  const finances = rawFinances ? deriveFinances(rawFinances) : null;
  const areasById = new Map((areas || []).map((a) => [a.id, a]));
  const now = new Date();

  // Household radius preference: hide listings beyond the chosen distance.
  // Applied as a pre-filter inside paint() so it composes with the other hides
  // (affordability gate, junk, refinements, decided) and is counted separately.
  // Null distance_mi = pass through (not yet backfilled — don't hide it).
  const searchRadiusMi = Number(criteria?.location?.searchRadiusMi ?? 3);
  const passesRadiusFilter = (listing) => {
    if (listing.distance_mi == null) return true;
    if (searchRadiusMi === 0) return listing.geofence_pass === true;
    return Number(listing.distance_mi) <= searchRadiusMi;
  };

  // Layer 2 ⊕ Layer 3 → the effective weights fed (per-listing) into scoring.
  let overrides = learned?.overrides || {};
  let effective = effectiveWeights(learned?.derived || {}, overrides);
  let dismissals = learned?.dismissals || {};
  // Stage 5: active display-hide rules from the reserved overrides key — listings
  // matching a confirmed refinement are filtered from the default feed (revealed by
  // "Show hidden"). Recomputed after a retrain (overrides can change in runRetrain).
  let hiddenRules = hiddenRulesFromOverrides(overrides);
  let reactionLog = reactionLogInit || [];

  // Feed suppression derives the CURRENT reaction per listing from the live
  // append-only log (the same source the Saved page reads) — not a cached map — so
  // the feed and Saved can never disagree. A property whose latest reaction is
  // like/reject is "decided" and is suppressed from the fresh feed by id AND by
  // physical-property fingerprint, so a re-list under a new rightmove_id is caught.
  // `pass` is a soft skip and stays resurfaceable.
  const liveById = new Map(listings.map((l) => [String(l.rightmove_id), l]));
  const latest = latestPerListing(reactionLog);
  const reactions = {};
  for (const [id, row] of latest) {
    reactions[String(id)] = {
      reaction: row.reaction,
      reason: row.reason ?? null,
      reasons: Array.isArray(row.reasons) ? row.reasons : [],
      created_at: row.created_at,
    };
  }
  const decided = decidedSets(latest, liveById);
  const isDecidedListing = (l) => isDecided(l, decided);

  const areaOf = (l) => (l.area_id ? areasById.get(l.area_id) : null);
  // Fit scoring is the per-paint hot path (every sort/filter calls paint(), which
  // scores every listing). Memoise per rightmove_id so repeated paints reuse the
  // computed verdict; the cache is cleared whenever the learned weights change
  // (runRetrain) — the only scoring input that varies within a session.
  const scoreCache = new Map();
  const scoreOf = (l) => {
    if (!finances) return { verdict: 'unknown', score: 0, gated: false, contributions: [] };
    let s = scoreCache.get(l.rightmove_id);
    if (!s) {
      s = scoreListingFit({ listing: l, finances, criteria, area: areaOf(l), learnedPrefs: listingLearnedPrefs(l, effective), rating: ratings[l.rightmove_id] });
      scoreCache.set(l.rightmove_id, s);
    }
    return s;
  };

  // Shared search/sort/filter (same module as the saved view). Score and rating
  // read through the memoised scoreOf cache above, so sorting never re-runs the
  // fit engine.
  const controls = createListingsControls({
    scoreOf: (l) => scoreOf(l).score,
    ratingOf: (l) => Number(ratings[l.rightmove_id]) || 0,
    areaNameOf: (l) => areaOf(l)?.name || '',
    onChange: () => { if (mode === 'browse') paint(); },
  });
  controls.wire(filterBar, listings);

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
    image_url: l.image_url ?? null,   // cover photo persists once the live row is withdrawn
    distance_mi: l.distance_mi ?? null,   // L7.5: lets meta-observations propose a tighter buffer
    // Outdoor/parking aren't structured feed fields — prefer a structured value if
    // one ever appears, else conservatively infer from the description (null when
    // ambiguous, so no guessed value enters the training set).
    outdoor_space: l.outdoor_space ?? inferOutdoorSpace(l.description),
    has_parking:   l.has_parking   ?? inferParking(l.description),
  });

  // In-progress (un-saved) picker drafts, keyed by rightmove_id. The picker calls
  // onDraftChange on every tap; an async repaint (retrain completion, a
  // reactions-changed event) rebuilds the card WITH the stashed draft, so a tapped
  // Reject + reason chips survive the rebuild instead of "randomly deselecting".
  const pickerDrafts = new Map();
  const draftCtx = (id) => ({
    draft: pickerDrafts.get(String(id)) || null,
    onDraftChange: (d) => {
      if (d) pickerDrafts.set(String(id), d);
      else pickerDrafts.delete(String(id));
    },
  });

  // Persist ONLY on Save (one clean consolidated row per finished decision). Verb
  // taps in the picker stay local — writing them too would double-count in the
  // full-log training (deriveWeights reads every row) and a no-reasons verb row
  // would dilute the attributed Save row. Append-only + snapshot-durable intact.
  // THROWS on a failed write so the picker lands in its error state — a silent
  // false return used to render "Saved ✓" over a lost reaction.
  const onSave = async (listing, { reaction, reasons }) => {
    const ok = await saveListingReaction({
      listing_id: listing.rightmove_id, reaction, reasons, listing_snapshot: snapshotOf(listing),
    });
    if (!ok) throw new Error('Could not save your decision — check your connection and try again.');
    pickerDrafts.delete(String(listing.rightmove_id));
    reactions[listing.rightmove_id] = {
      reaction,
      reason: reaction === 'reject' ? (reasons?.[0]?.key ?? null) : null,
      reasons: reasons || [],
      created_at: new Date().toISOString(),
    };
    // Keep the suppression sets live so the next paint hides a just-decided property
    // (by id AND fingerprint); `pass` is a soft skip and never suppresses. Same
    // primitive the cross-page `reactions-changed` listener uses, so they can't drift.
    foldDecision(decided, listing.rightmove_id, reaction, listing, liveById);
    reviewedSet.add(String(listing.rightmove_id));
    addReviewedListing(listing.rightmove_id);
  };
  const onStatus = async (listing, status) => {
    const ok = await setShortlistStatus(listing.rightmove_id, status);
    if (ok) { if (status) statuses[listing.rightmove_id] = status; else delete statuses[listing.rightmove_id]; }
  };
  // Every programmatic repaint (save, retrain completion, cross-page reaction
  // event) preserves the reading position: the reacted card's slot collapses and
  // the rows below slide up (inbox-style), with no jump to top.
  function repaintPreservingScroll() {
    const y = window.scrollY;
    paint();
    window.scrollTo({ top: y });
  }

  // Browse rows: persist, then re-partition the feed so the just-decided property
  // LEAVES the active list immediately — like/reject are suppressed from the feed
  // (by id AND physical-property fingerprint, so a re-list is caught too), and a
  // pass drops into the collapsed "Passed" group. paint() is the single source of
  // truth for that split (and refreshes the summary), so we repaint rather than
  // hand-maintain the DOM. A failed save THROWS out of onSave before any of this
  // runs — the picker shows the error and the feed stays put.
  // Like the deck path, a browse reaction also schedules the debounced retrain so
  // the model learns from browse decisions live (parity with deckOnSave).
  const browseOnSave = async (listing, d) => {
    await onSave(listing, d);
    repaintPreservingScroll(); // re-partitions + calls renderSummary()
    flagDecisionDestination(d.reaction);
    updateReviewCount();
    updateLearning();
    scheduleRetrain();
  };

  // After a Save the card leaves the active list — show WHERE it went: flash the
  // matching reviewed group when it's on screen (a pass lands in "Passed"; likes/
  // rejects appear under "Show hidden"), else the summary line whose counts just
  // moved. One-shot class, motion-safe in CSS.
  function flagDecisionDestination(reaction) {
    const group = listEl.querySelector(`.reviewed-collapse--${REVIEWED_MOD[reaction] || 'reviewed'}`);
    const target = group || summaryEl;
    if (!target) return;
    const cls = group ? 'reviewed-collapse--received' : 'listings-summary--received';
    target.classList.remove(cls);
    void target.offsetWidth; // restart the animation when saves come back-to-back
    target.classList.add(cls);
    setTimeout(() => target.classList.remove(cls), 1300);
  }

  // The recent "wave" the cold-start deck reviews: added within RECENCY_DAYS and
  // not affordability-gated (gating is learning-independent, so the wave is
  // stable). Diversified once so consecutive cards contrast (faster learning).
  // The review deck always hides junk (auction / over-55) — the "Show hidden"
  // toggle is a browse-mode affordance, not part of the focused review wave.
  const deckOrder = diversifySelection(
    listings.filter((l) => isRecent(l, now) && !scoreOf(l).gated && !classifyListing(l).hide
      && !listingHiddenByRefinement(l, hiddenRules) && !isDecidedListing(l)),
    listingBucketKey,
  );
  // ── learning state / training feedback (Stage 5 rich, balance-aware) ──────
  const deckDoneCount = () => deckOrder.filter((l) => isReviewed(l.rightmove_id)).length;
  // The top-of-page widget loads collapsed; remember the user's expand choice so
  // an in-place repaint (e.g. after saving a reaction) doesn't snap it shut.
  let learningExpanded = false;
  function updateLearning() {
    if (!learningEl) return;
    // In review mode the deck renders its own training widget (paintDeck), so the
    // top-of-page copy is suppressed to avoid showing two identical widgets.
    if (!listings.length || mode === 'review') { learningEl.hidden = true; return; }
    const p = trainingProgress(Object.values(reactions));
    clear(learningEl);
    learningEl.hidden = false;
    learningEl.classList.add('learning-status--rich');
    learningEl.classList.toggle('learning-status--cold', p.cold);
    learningEl.classList.toggle('training--imbalanced', p.imbalanced);
    learningEl.appendChild(buildTrainingProgress(p, deckDoneCount(), deckOrder.length, {
      collapsible: true,
      expanded: learningExpanded,
      onToggle: (open) => { learningExpanded = open; },
      learned: topLearnedSignals(effective),
    }));
  }
  function updateReviewCount() {
    const n = deckOrder.filter((l) => !isReviewed(l.rightmove_id)).length;
    if (reviewCountEl) { reviewCountEl.hidden = n === 0; reviewCountEl.textContent = n ? ` ${n}` : ''; }
  }

  // ── live summary (review pipeline counts) ─────────────────────────────────
  // The last Browse paint stashes the visible pool so the summary can be
  // recomputed from the current reactions/reviewedSet WITHOUT a full repaint —
  // that's what makes the totals move the instant a row is liked/passed/rejected
  // (the card stays put; only the counts change).
  let lastBrowse = { visible: [], gatedCount: 0, hiddenJunkCount: 0, hiddenRefCount: 0, decidedCount: 0, dupCount: 0, hiddenByFilter: 0 };
  function summaryCounts(visible) {
    const c = { review: 0, like: 0, pass: 0, reject: 0 };
    for (const r of visible) {
      const id = r.listing.rightmove_id;
      if (!isReviewed(id)) { c.review += 1; continue; }
      const verb = reactions[id]?.reaction;
      if (verb === 'like') c.like += 1;
      else if (verb === 'reject') c.reject += 1;
      else c.pass += 1; // pass (or a reviewed row with no stored verb) reads as passed
    }
    return c;
  }
  function renderSummary() {
    if (!summaryEl) return;
    clear(summaryEl);
    if (!listings.length || mode !== 'browse') return;
    const { visible, gatedCount, hiddenJunkCount, hiddenRefCount, hiddenByFilter, decidedCount, dupCount } = lastBrowse;
    const nodes = buildSummary({ ...summaryCounts(visible), gated: gatedCount, hiddenJunk: hiddenJunkCount, hiddenByRefinement: hiddenRefCount, hiddenByFilter, decided: decidedCount, dup: dupCount });
    for (const node of nodes) summaryEl.appendChild(node);
  }

  // ── conflict prompts (L5) — likes that contradict stated criteria ─────────
  // area_id → { name, geofenceRadiusMi } for the L7.5 tighten/stop prompts.
  const areasMeta = {};
  for (const a of (areas || [])) areasMeta[a.id] = { name: a.name, geofenceRadiusMi: a.geofenceRadiusMi };

  function updateConflicts() {
    if (!conflictsEl) return;
    clear(conflictsEl);
    // L7.5: derive area/outcode prune candidates from the live learned weights so
    // the "stop searching" prompt only ever appears for a strong-negative signal.
    const searchSpec = deriveSearchSpec(effective, criteria, { recencyDays: RECENCY_DAYS });
    const conflicts = detectConflicts(reactionLog, criteria, {
      now: new Date(), dismissals, areas: areasMeta,
      pruneCandidates: { areas: searchSpec.dropAreas, outcodes: searchSpec.dropOutcodes },
    });
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
          el('a', { class: 'conflict-prompt__adjust', href: `${url('pages/profile.html')}#search` }, 'Adjust criteria →'),
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
    // Repaint only when the retrain actually moved the model: if the effective
    // weights and refinement rules come back identical, the feed's scores and
    // hides are unchanged and the (post-save) paint already on screen is correct —
    // skipping the repaint also means an un-saved draft on another card is never
    // disturbed for nothing.
    let changed = false;
    try {
      // One paged fetch per retrain: the recompute returns the log it trained on,
      // so the conflict detector reuses those rows instead of re-fetching the
      // whole table a second time (P11b).
      const res = await recomputeLearnedPreferences({ now: new Date() });
      if (res) {
        const before = JSON.stringify([effective, hiddenRules]);
        overrides = res.overrides || {};
        effective = effectiveWeights(res.derived || {}, overrides);
        dismissals = res.dismissals || dismissals;
        hiddenRules = hiddenRulesFromOverrides(overrides);
        reactionLog = res.log || reactionLog;
        changed = JSON.stringify([effective, hiddenRules]) !== before;
        if (changed) {
          scoreCache.clear();
          hiddenRulesRev += 1; // invalidates every cached card's sig
        }
      }
    } catch { /* surfaced via storage toast */ }
    retraining = false;
    updateLearning();
    updateConflicts();
    if (changed && mode === 'browse') repaintPreservingScroll();
  }

  // ── Browse mode ─────────────────────────────────────────────────────────
  // ── keyed card cache (P11c) ────────────────────────────────────────────────
  // paint() used to clear+rebuild every card on each repaint (every search
  // keystroke, filter change, save, retrain). Cards are now keyed by rightmove_id
  // and reused when their render inputs are unchanged — `sig` captures every
  // input that can vary within a session (reaction, status, score/verdict,
  // refinement rules via hiddenRulesRev; the listing rows themselves are
  // immutable once fetched). A card with an in-progress picker draft is ALWAYS
  // reused (never rebuilt mid-edit); its stale sig is kept so the rebuild happens
  // once the draft resolves.
  const cardCache = new Map(); // id → { node, sig }
  let hiddenRulesRev = 0; // bumped whenever hiddenRules / learned weights change

  function paint() {
    const includeOOR = !!(showOOR && showOOR.checked);
    const includeHidden = !!(showHidden && showHidden.checked);
    if (!listings.length) {
      listEl.replaceChildren(el('li', { class: 'listings-empty' }, [
        el('p', {}, 'No listings yet.'),
        el('p', { class: 'listings-empty__hint' }, 'The daily fetch (fetch-listings workflow) hasn’t populated the listings table yet — tap “Fetch new listings” above to run it on GitHub, or check the Apify / Supabase secrets are set.'),
      ]));
      if (summaryEl) clear(summaryEl);
      return;
    }

    // Pure partition pipeline (listings/feed-partition.js — unit-tested): radius →
    // gate → junk/refinement → decided suppression → dedupe → controls → reviewed
    // split + summary counts. Identical maths to the previous inline version.
    const feed = partitionFeed(listings, {
      passesRadius: passesRadiusFilter,
      scoreOf,
      areaOf,
      includeOOR,
      includeHidden,
      isJunk: (l) => classifyListing(l).hide,
      isRefHidden: (l) => listingHiddenByRefinement(l, hiddenRules),
      isDecided: isDecidedListing,
      isReviewed,
      reactionOf: (id) => reactions[id] || null,
      applyControls: (ls) => controls.apply(ls),
    });

    const rowCtx = (r, reviewed) => buildRow(r.listing, 0, r.scored, r.area, {
      reaction: reactions[r.listing.rightmove_id] || null,
      status: statuses[r.listing.rightmove_id] || '',
      reviewed, onSave: browseOnSave, onStatus, hiddenRules,
      ...draftCtx(r.listing.rightmove_id),
    });
    // Reuse the cached card when its inputs are unchanged, or unconditionally
    // while it carries an un-saved picker draft.
    const cardFor = (r, reviewed) => {
      const id = String(r.listing.rightmove_id);
      const rx = reactions[id];
      const sig = `${reviewed ? 1 : 0}|${rx?.reaction ?? ''}|${rx?.created_at ?? ''}|${statuses[id] ?? ''}|${r.scored.score}|${r.scored.verdict}|${hiddenRulesRev}`;
      const hit = cardCache.get(id);
      if (hit && (hit.sig === sig || pickerDrafts.has(id))) return hit.node;
      const node = rowCtx(r, reviewed);
      cardCache.set(id, { node, sig });
      return node;
    };

    // Capture focus + reviewed-group open state before the commit (moving nodes
    // through a fragment drops focus; group shells are rebuilt each paint).
    const active = document.activeElement;
    const refocus = active && listEl.contains(active) ? active : null;
    const openByMod = {};
    for (const d of listEl.querySelectorAll('details.reviewed-collapse')) {
      for (const cfg of REVIEWED_GROUPS) if (d.classList.contains(`reviewed-collapse--${cfg.mod}`)) openByMod[cfg.key] = d.open;
    }

    const frag = document.createDocumentFragment();
    feed.unreviewed.forEach((r) => frag.appendChild(cardFor(r, false)));
    if (feed.reviewed.length) {
      // Split the reviewed pile by the user's verdict (Liked / Passed / Rejected)
      // so a finished session lands on a consolidated, scannable split. Editing a
      // card in place (change verb → Save) re-saves and, on the next paint, moves
      // it to the matching group. Cards inside stay build-on-toggle; a group the
      // user expanded stays expanded across repaints.
      for (const cfg of REVIEWED_GROUPS) {
        if (!feed.byVerb[cfg.key].length) continue;
        frag.appendChild(buildReviewedGroup(
          { ...cfg, open: openByMod[cfg.key] ?? cfg.open },
          feed.byVerb[cfg.key],
          (r) => cardFor(r, true),
        ));
      }
    }
    listEl.replaceChildren(frag);
    // A reused node is detached+reattached by the commit, which drops focus —
    // restore it so keyboard flow (Tab through cards) survives a repaint.
    if (refocus && refocus.isConnected) refocus.focus();

    // Evict cache entries for properties no longer in the feed at all.
    const liveIds = new Set(feed.visible.map((r) => String(r.listing.rightmove_id)));
    for (const id of cardCache.keys()) if (!liveIds.has(id)) cardCache.delete(id);

    lastBrowse = { visible: feed.visible, ...feed.counts };
    renderSummary();
  }

  // ── Review mode (the deck) ──────────────────────────────────────────────
  // Save consolidates the decision (verb + reasons) and advances to the next
  // un-reviewed card, so the deck reviews the recent wave one finished decision
  // at a time.
  const deckOnSave = async (cur, d) => {
    await onSave(cur, d); // throws on failure → picker error state, deck stays put
    paintDeck();
    updateReviewCount();
    updateLearning();
    scheduleRetrain();
  };
  function paintDeck() {
    if (!deckEl) return;
    clear(deckEl);
    const total = deckOrder.length;
    const done = deckOrder.filter((l) => isReviewed(l.rightmove_id)).length;
    deckEl.appendChild(buildDeckProgress(done, total));
    deckEl.appendChild(buildTrainingProgress(trainingProgress(Object.values(reactions)), done, total));
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
      hiddenRules,
      ...draftCtx(next.rightmove_id),
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
    if (filterBar) filterBar.hidden = review;
    if (review) { if (summaryEl) clear(summaryEl); paintDeck(); } else { paint(); }
    updateLearning(); // re-evaluates the mode guard (hides the top widget in review)
  }
  modeBtns.forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));
  if (showOOR) showOOR.addEventListener('change', () => { if (mode === 'browse') paint(); });
  if (showHidden) showHidden.addEventListener('change', () => { if (mode === 'browse') paint(); });

  // A reaction made ANYWHERE (notably the dossier page in the same tab, or a
  // background revalidation) fires `reactions-changed` from saveListingReaction.
  // Fold it into the live suppression sets + current-reaction map, then repaint so a
  // liked/rejected property leaves the feed immediately — no refresh, and no reliance
  // on each write path remembering to update feed state. This page is a per-load MPA
  // coordinator with no SPA teardown, so one listener per load needs no removal.
  window.addEventListener('reactions-changed', (e) => {
    const { listing_id, reaction, reasons, created_at } = e.detail || {};
    if (!listing_id || !reaction) return;
    reactions[String(listing_id)] = {
      reaction,
      reason: reaction === 'reject' ? (reasons?.[0]?.key ?? null) : null,
      reasons: Array.isArray(reasons) ? reasons : [],
      created_at: created_at || new Date().toISOString(),
    };
    foldDecision(decided, listing_id, reaction, null, liveById);
    reviewedSet.add(String(listing_id));
    pickerDrafts.delete(String(listing_id)); // the decision landed elsewhere — drop any stale draft
    if (mode === 'browse') repaintPreservingScroll();
  });

  wireReturnTracking(listEl, 'listings');

  updateLearning();
  updateReviewCount();
  updateConflicts();
  setMode('browse');
  // After the first Browse paint, snap focus back to the card the user came from.
  restoreListFocus(listEl, 'listings');
}

wireListingsFetch();
render();
