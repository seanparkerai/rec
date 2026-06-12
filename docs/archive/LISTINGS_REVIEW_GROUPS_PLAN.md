# Plan — Split reviewed listings into Liked / Rejected + positive-feedback overhaul

> **STATUS: implemented** on `claude/listings-review-groups-feedback-wcbkW`.
> Decisions taken: **A1** (both — in-page split + dedicated page) · **B1** ("Saved
> listings", area "Shortlist" unchanged) · **C1** (three groups: Liked open, Passed +
> Rejected collapsed) · **D2** (chips only — expanded feature-level like vocabulary,
> no free-text box) · **E1** (wired into learning). The sections below are the design
> record.

---

## 0. What you asked for (my read-back)

1. **Split the "Reviewed" group** at the bottom of the listings page into **two groups**:
   *Reviewed — Liked* and *Reviewed — Rejected*, so that after a review session you land
   on a tidy, consolidated place showing everything you currently like.
2. **Possibly a separate page** instead — i.e. *Prospective listings* (the feed you triage)
   vs a *Shortlist* page that shows the ones you're liking most, in a similar but focused view.
   You left the call to me on whether a second page is more optimal.
3. **Overhaul the positive-feedback loop** — for properties you like, let you **call out the
   specific parts/elements** of the property that make it a positive, not just a generic "like".

If I've mis-read any of that, correct me in the Decisions block.

---

## 1. How it works today (so the plan is grounded)

- **Page:** `pages/listings.html`. One feed (`<ol data-listings>`) plus a hidden Review deck
  (`<section data-review-deck>`). Browse vs Review is a toggle.
- **Coordinator:** `assets/js/page-listings.js`. In `paint()` (~L490–535) the visible listings are
  partitioned into `unreviewed` (top, fit-ranked) and `reviewed` (bottom). The reviewed ones are
  wrapped in a **single** `<details class="reviewed-collapse">` with a count badge (~L520–532).
  Cards are tinted by reaction via `REVIEWED_MOD` (~L214): `like→--liked`, `reject→--rejected`,
  `pass→--passed`.
- **Reaction capture:** `assets/js/listing-reactions-ui.js` (`buildReasonPicker`) — three verbs
  (like / pass / reject), multi-select reason chips, optional sub-reasons, one Save. Verb taps write
  immediately; Save writes one consolidated row.
- **Vocabulary:** `assets/js/listing-reactions.js`.
  - `LIKE_REASONS` (8): great_area, good_value, right_size, good_layout, move_in_ready,
    outdoor_space, character, other.
  - `LIKE_SUBREASONS` — currently **sparse** (only a few primaries have sub-detail).
  - Reaction row shape: `reasons: [{ key, detail, note }]` — **a free-text `note` field already
    exists per reason**, which is the hook for "tell me specifically why".
- **Storage:** `assets/js/storage.js` — `saveListingReaction()`, `getListingReactions()` (latest per
  listing), `getReactionLog()` (full append-only log). Backed by the `listing_reactions` table
  (append-only user-state, `reasons jsonb`).
- **Learning:** `assets/js/learned-preferences.js` maps reason keys → which listing signals they
  implicate (causal attribution). Like-reasons already feed this.
- **Existing "shortlist":** the `shortlist` table + dashboard tile are about **AREAS, not listings**.
  This is a naming hazard — see Decision B.

**Key consequence:** richer positive feedback needs **no DB migration** — `reasons[].note` and a
bigger `LIKE_REASONS`/`LIKE_SUBREASONS` vocabulary all fit the existing `jsonb` shape.

---

## 2. Decisions I need from you

> Edit these inline (e.g. change **[RECOMMENDED]** / cross one out). Defaults in **bold**.

**Decision A — Where does the consolidated "liked" view live?**
- **A1 [RECOMMENDED]: Both.** Split the bottom section in-page into Liked / Rejected groups *and*
  add a dedicated **Shortlist** page that is the focused home for liked listings. The in-page split
  is the cheap immediate win during a session; the page is the "concise consolidated location" you
  described, and it's where the richer positive-feedback view gets room to breathe.
- A2: In-page only. Just split the bottom group into Liked / Rejected; no new page.
- A3: Page only. Replace the bottom reviewed group with a link to a new Shortlist page.

**Decision B — Naming, to avoid the existing "shortlist = areas" collision.**
- **B1 [RECOMMENDED]:** Call the new listings page **"Saved listings"** (nav + title), keep
  "Shortlist" meaning areas. Clear, no collision.
- B2: Call it **"Shortlist"** and rename the existing area shortlist to "Saved areas". (More churn,
  touches the dashboard tile + nav.)

**Decision C — What does "passed" do in the new layout?**
- **C1 [RECOMMENDED]:** Three groups — Liked, Passed (collapsed, muted), Rejected. Keeps the data
  honest without cluttering.
- C2: Two groups only — Liked and Rejected; fold "passed" silently into Rejected's collapse or hide.

**Decision D — How granular should the positive feedback be?**
- **D1 [RECOMMENDED]:** Expand like-reason chips to feature level (kitchen, bathroom, garden/outdoor,
  natural light, period features, parking, layout/flow, location specifics, condition/move-in-ready,
  price/value) **+** a free-text "What specifically do you love?" note per liked listing. Both feed
  learning. No migration.
- D2: Chips only (expand vocabulary, no free text).
- D3: Free text only (one note box, drop the chip expansion).

**Decision E — Should positives influence ranking/learning more strongly?**
- **E1 [RECOMMENDED]:** Yes — wire the new like sub-reasons into `learned-preferences.js` so a "love
  the garden" like nudges outdoor-space-bearing listings up, etc. (extends the existing attribution
  map). Adds/extends intelligence tests.
- E2: No — capture positives for display only; leave the learning model untouched this round.

---

## 3. Proposed implementation (assuming A1 / B1 / C1 / D1 / E1)

Phased so you can stop after any phase. Each phase ends green + committed + Supabase-synced per §18.

### Phase 1 — Split the in-page reviewed group (the core ask)
**Files & sections**
- `assets/js/page-listings.js`
  - `paint()` (~L515–532): replace the single reviewed partition with three buckets keyed off the
    latest reaction (`like` / `pass` / `reject`). Render up to three `<details>` blocks — Liked
    (open by default), Passed (collapsed, only if C1), Rejected (collapsed) — each with its own count
    badge. Reuse existing `buildRow()` + `REVIEWED_MOD` tinting.
  - Small helper `groupReviewed(listings, reactions)` near `REVIEWED_MOD` (~L214) to keep `paint()`
    readable.
- `assets/css/pages/listings.css`
  - Extend the `.reviewed-collapse*` rules (~L437–453) into a `.reviewed-group` family with a
    per-group accent (liked = `var(--positive)`, rejected = `var(--danger)`, passed = neutral),
    using existing tokens only (no hard-coded hex — §16). Add a section heading row.
- `pages/listings.html`: no structural change needed (groups are built in JS), but I'll add an
  anchor/`aria-label` wrapper if needed for the skip-to-liked affordance.

**Out of scope here:** new page, vocabulary, learning.

### Phase 2 — Dedicated "Saved listings" page (Decision A1/A3, B1)
**Files & sections**
- New `pages/saved-listings.html` — clones the listings shell (header, learning banner partial,
  `<main id="main">`), one list region `data-saved-listings`. Mobile-first, Pico semantic markup.
- New `assets/js/page-saved-listings.js` — thin coordinator: `getListings()` + `getListingReactions()`,
  filter to `reaction === 'like'`, render with a **richer liked card** (Phase 3's positive summary
  surfaced prominently), sort by recency / fit. Re-uses `buildRow`-style rendering extracted into a
  shared helper if clean, else a local renderer.
- New `assets/css/pages/saved-listings.css` — imported by appending to the `dashboard.css` import
  shell (append-only, per §16). Reuses the Phase-1 group styling tokens.
- Nav partial in `components/` — add a "Saved listings" link (and confirm the listings page links
  across to it).
**Out of scope:** changing the area "shortlist" tile/table.

### Phase 3 — Positive-feedback overhaul (Decision D1/E1)
**Files & sections**
- `assets/js/listing-reactions.js`
  - Expand `LIKE_REASONS` to feature level and flesh out `LIKE_SUBREASONS` for each primary.
  - Keep the `{ key, detail, note }` row shape; add a convention for a top-level free-text note
    (stored as a reason entry `{ key: 'note', note: '…' }` or `detail` on `other`) — **no migration**.
  - Update `normaliseReaction()` validation to accept the new keys + note.
- `assets/js/listing-reactions-ui.js` (`buildReasonPicker`)
  - When verb = like, render the expanded chips + a "What specifically do you love?" textarea.
    Pre-fill from `current.reasons`. Keep the immediate-verb / consolidated-Save discipline intact.
- `assets/js/page-listings.js` + `page-saved-listings.js`
  - Render the captured positives on liked cards (chips + note as a short "Why you liked it" block).
- `assets/js/learned-preferences.js` (E1)
  - Extend the reason→signal implication map so the new like sub-reasons attribute to the right
    signals (outdoor, layout, condition, price-band, location).
- `assets/css/pages/listings.css` / `saved-listings.css`
  - Styles for the positives block + the like-note textarea (tokens only).
**Out of scope:** reject vocabulary changes (leave reject flow as-is this round), schema/migration.

---

## 4. Test impact (§6)

- `node tools/run-intelligence-tests.mjs` must stay green before every commit.
- **Affected:** learned-preferences intelligence tests (E1 changes attribution) — I'll extend the
  fixtures/assertions to cover the new like sub-reasons.
- **New:** a small unit check that `groupReviewed()` buckets like/pass/reject correctly, and that
  `normaliseReaction()` accepts the expanded vocabulary + note.
- `tests/supabase-sync.test.js`: no schema change ⇒ no new tracked table; sync test stays as-is.
- Browser-run `tests/tests.html` (no-horizontal-scroll, no-inline-style, reachability) — I'll add the
  new page to whatever page list it checks; the visual pass is handed to you (no browser here, §13).

## 5. Supabase / data contract (§18)

- `listing_reactions` stays the single source of truth for likes/reasons (append-only). The new
  "Saved listings" view is **derived** from it — no new table, no migration.
- New reasons/notes still flow through `saveListingReaction()` → MCP `INSERT` at session end; I'll
  re-SELECT to verify and bump `data/snapshots/sync-state.json`.
- No content-mirror tables touched.

## 6. Guard-rails I will NOT touch (§16)

`tokens.css`, `storage.js` (I'll **extend** with a derived getter only if needed, not rewrite),
`config.js`, `data-loader.js`, `finances.js`, `dashboard.css` (append imports only),
`area.schema.json`, `.github/workflows/*`. No DB migration. Reject-reason vocabulary unchanged.

## 7. Order of operations

1. Confirm Decisions A–E.
2. Phase 1 → test → commit/push (+ sync footer).
3. Phase 3 vocabulary/UI/learning → test → commit/push.
4. Phase 2 page + nav → test → commit/push.

(Phase 3 before Phase 2 so the new page can show the richer positives from day one.)

---

### Your move
Tick Decisions A–E (or amend), flag anything out of scope, and I'll build to the agreed plan.
