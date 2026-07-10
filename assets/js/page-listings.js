// page-listings.js — v3 Live Listings page coordinator (L1 + L2).
// Loads fetcher-written listings, scores each with the listing-fit engine
// (5-band verdict + affordability hard gate + explainable contributions),
// and renders a fit-ranked feed with the "why" for every verdict. L3 adds
// per-row reaction capture (like/pass/reject + reject reason chips, append-only)
// and a personal-status select on the shortlist record. Learned preferences
// (using these reactions) arrive in L4.
import {
  getListings, getCriteria, getHouseholdAreas,
  saveListingReaction,
  getShortlistStatuses, setShortlistStatus,
  getLearnedPreferences, recomputeLearnedPreferences,
  getReactionLog,
  getReviewedListings, addReviewedListing,
  getListingRatings, getScrapeProbation,
  saveListingsReviewCount,
} from './storage.js';
import { getDerivedFinances } from './finance-load.js';
import { createListingsControls, LISTING_SORTS } from './listings/controls.js';
import { wireFilterSheet } from './filter-sheet.js';
import { wireReturnTracking, restoreListFocus } from './listings/nav.js';
import { scoreListingFit } from './listings/fit.js';
import { classifyListing } from './listings/flags.js';
import { latestPerListing } from './listings/reactions.js';
import { decidedSets, isDecided, foldDecision } from './listings/suppress.js';
import { partitionFeed, makeRadiusFilter } from './listings/feed-partition.js';
import {
  effectiveWeights, listingLearnedPrefs, isRecent,
  diversifySelection, listingBucketKey,
  inferOutdoorSpace, inferParking,
} from './learned-preferences.js';
import { hiddenRulesFromOverrides, listingHiddenByRefinement } from './refinement/view.js';
import { RECENCY_DAYS } from './intelligence-constants.js';
import { url } from './config.js';
import { el, clear } from './dom.js';
import { wireListingsFetch } from './listings/fetch.js';
// View-builders extracted from this coordinator (REFACTOR: page-listings split).
import { buildRow, buildDeckCard, REVIEWED_MOD } from './page-listings/row.js';
import { buildSummary, buildDeckProgress } from './page-listings/progress.js';

async function render() {
  const main = document.querySelector('#main') || document.body;
  const listEl = main.querySelector('[data-listings]') || main.querySelector('.area-list');
  const deckEl = main.querySelector('[data-review-deck]');
  const summaryEl = main.querySelector('[data-listings-summary]');
  const showOOR = main.querySelector('[data-show-oor]');
  const showHidden = main.querySelector('[data-show-hidden]');
  const filterTrigger = main.querySelector('[data-filter-trigger]');
  const filterBar = main.querySelector('[data-listings-filter]');
  const emptyNone = main.querySelector('[data-empty-none]');
  const emptyDone = main.querySelector('[data-empty-done]');
  const reviewCountEl = main.querySelector('[data-review-count]');
  const modeBtns = [...main.querySelectorAll('[data-mode]')];
  if (!listEl) return;

  const [listings, criteria, finances, areas, statuses, learned, reactionLogInit, ratings, probationRows] = await Promise.all([
    getListings({ limit: null }), getCriteria(), getDerivedFinances(), getHouseholdAreas(),
    getShortlistStatuses(), getLearnedPreferences(), getReactionLog(),
    getListingRatings(), getScrapeProbation(),
  ]);
  const areasById = new Map((areas || []).map((a) => [a.id, a]));
  const now = new Date();

  // Household radius preference: hide listings beyond the chosen distance.
  // Applied as a pre-filter inside paint() so it composes with the other hides
  // (affordability gate, junk, refinements, decided) and is counted separately.
  // MEMBERSHIP-AWARE (2026-07-10 audit): a listing passes if it sits inside ANY
  // member area's ring, not just its primary's — see makeRadiusFilter.
  const normArea = (s) => String(s ?? '').trim().toLowerCase();
  // Areas the household has stopped searching (scrape probation) are suppressed from the
  // feed immediately so Apply has instant effect, not just on the next scrape.
  let probationSet = new Set((probationRows || []).map((p) => normArea(p.value)));
  const passesRadiusFilter = makeRadiusFilter(criteria);

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

  // Perf + declutter (the core of this feature): a property whose latest reaction is
  // like/pass/reject is "decided" — drop the entire decided pile from the working set
  // up front so the fit engine never scores it and it never renders in the feed.
  // Likes live on the Saved page; passes/rejects on the Rejected page. Reactions made
  // DURING this visit are still suppressed live by partitionFeed's isDecided (the
  // `decided` set grows via foldDecision), so a row reacted on this visit also leaves
  // the feed immediately without a reload.
  const feedListings = listings.filter((l) => !isDecidedListing(l));

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
    onChange: () => { if (mode === 'browse') paint(); sheet?.refresh(); },
  });
  controls.wire(filterBar, listings);

  // Filter sheet (3.4c): the controls live in a native <dialog> — a modal
  // bottom-sheet on phones behind the "Filters" trigger, an inline card at
  // ≥768px. The trigger row mirrors what's active as pills so a narrowed feed
  // is never a mystery. (Controls wiring above is unchanged — the sheet only
  // relocates the markup.)
  const describeActiveFilters = () => {
    const s = controls.state || {};
    const pills = [];
    if (s.search && s.search.trim()) pills.push(`“${s.search.trim()}”`);
    if (s.sort && s.sort !== 'fit') pills.push(LISTING_SORTS.find((o) => o.key === s.sort)?.label || s.sort);
    if (s.type && s.type !== 'all') pills.push(s.type);
    if (s.beds && s.beds !== 'all') pills.push(`${s.beds}+ beds`);
    if (s.status && s.status !== 'all') pills.push(s.status.replace(/_/g, ' '));
    if (showOOR?.checked) pills.push('incl. out-of-reach');
    if (showHidden?.checked) pills.push('incl. hidden');
    return pills;
  };
  const sheet = wireFilterSheet({
    dlg: main.querySelector('#listings-filter-sheet'),
    openBtn: main.querySelector('[data-open-filters]'),
    closeBtn: main.querySelector('[data-close-filters]'),
    activeEl: main.querySelector('[data-active-filters]'),
    describe: describeActiveFilters,
  });

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
    // Route to where passed/rejected properties now live (off the feed).
    summaryEl.appendChild(el('span', { class: 'listings-summary__sep', 'aria-hidden': 'true' }, '·'));
    summaryEl.appendChild(el('a', { class: 'listings-summary__link', href: url('pages/rejected.html') }, 'Passed & rejected →'));
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

  // Persist the canonical "to review" count for the /live-feed kiosk. Only the
  // DEFAULT (unfiltered) view is the household's true pending pool — a transient
  // search/type/beds/status filter narrows the list, so we skip persisting then
  // (sort doesn't change membership, so it's ignored). Debounced + write-on-change.
  let lastPersistedReview = null;
  let reviewPersistTimer = null;
  function controlsFilterActive() {
    const s = controls.state || {};
    return !!(s.search && s.search.trim())
      || (s.type && s.type !== 'all')
      || (s.beds && s.beds !== 'all')
      || (s.status && s.status !== 'all');
  }
  function persistReviewCount(n) {
    if (controlsFilterActive()) return;
    if (n === lastPersistedReview) return;
    lastPersistedReview = n;
    clearTimeout(reviewPersistTimer);
    reviewPersistTimer = setTimeout(() => { saveListingsReviewCount(n); }, 1200);
  }

  // The two empty states are static page markup (siblings of the register, so
  // the role="list" container only ever holds listitem cards); paint() toggles
  // whichever applies — 'none' (no listings at all) or 'done' (feed cleared).
  function setEmpty(which) {
    if (emptyNone) emptyNone.hidden = which !== 'none';
    if (emptyDone) emptyDone.hidden = which !== 'done';
  }

  function paint() {
    const includeOOR = !!(showOOR && showOOR.checked);
    const includeHidden = !!(showHidden && showHidden.checked);
    if (!listings.length) {
      listEl.replaceChildren();
      setEmpty('none');
      if (summaryEl) clear(summaryEl);
      persistReviewCount(0);
      return;
    }

    // Pure partition pipeline (listings/feed-partition.js — unit-tested): radius →
    // gate → junk/refinement → decided suppression → dedupe → controls → reviewed
    // split + summary counts. Identical maths to the previous inline version.
    const feed = partitionFeed(feedListings, {
      passesRadius: passesRadiusFilter,
      scoreOf,
      areaOf,
      includeOOR,
      includeHidden,
      isJunk: (l) => classifyListing(l).hide,
      isRefHidden: (l) => listingHiddenByRefinement(l, hiddenRules) || probationSet.has(normArea(l.area_id)),
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

    // Capture focus before the commit (moving nodes through a fragment drops focus).
    const active = document.activeElement;
    const refocus = active && listEl.contains(active) ? active : null;

    // The feed renders only still-to-review listings. Decided properties (like/pass/
    // reject) are filtered out of the working set above and live on the Saved /
    // Rejected pages, so there is no reviewed split to render here any more.
    const frag = document.createDocumentFragment();
    feed.unreviewed.forEach((r) => frag.appendChild(cardFor(r, false)));
    setEmpty(feed.unreviewed.length ? null : 'done');
    listEl.replaceChildren(frag);
    // A reused node is detached+reattached by the commit, which drops focus —
    // restore it so keyboard flow (Tab through cards) survives a repaint.
    if (refocus && refocus.isConnected) refocus.focus();

    // Evict cache entries for properties no longer in the feed at all.
    const liveIds = new Set(feed.visible.map((r) => String(r.listing.rightmove_id)));
    for (const id of cardCache.keys()) if (!liveIds.has(id)) cardCache.delete(id);

    lastBrowse = { visible: feed.visible, ...feed.counts };
    renderSummary();
    // Surface the real pending pool to the /live-feed kiosk (default view only).
    persistReviewCount(feed.unreviewed.length);
  }

  // ── Review mode (the deck) ──────────────────────────────────────────────
  // Save consolidates the decision (verb + reasons) and advances to the next
  // un-reviewed card, so the deck reviews the recent wave one finished decision
  // at a time.
  const deckOnSave = async (cur, d) => {
    await onSave(cur, d); // throws on failure → picker error state, deck stays put
    paintDeck();
    updateReviewCount();
    scheduleRetrain();
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
    if (filterTrigger) filterTrigger.hidden = review;
    if (review) { sheet?.hide(); setEmpty(null); } else { sheet?.sync(); }
    if (review) { if (summaryEl) clear(summaryEl); paintDeck(); } else { paint(); }
  }
  modeBtns.forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));
  if (showOOR) showOOR.addEventListener('change', () => { if (mode === 'browse') paint(); sheet?.refresh(); });
  if (showHidden) showHidden.addEventListener('change', () => { if (mode === 'browse') paint(); sheet?.refresh(); });

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

  updateReviewCount();
  setMode('browse');
  // After the first Browse paint, snap focus back to the card the user came from.
  restoreListFocus(listEl, 'listings');
}

wireListingsFetch();
render();
