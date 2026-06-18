# assets/js/learned-preferences/

**Domain:** v3 L4 learning core — signal extraction, weights derivation (recency, cold-start, training progress, Layer 2 derive + effective), and cold-start search diversification.

**Naming:** `signals.js` extracts features (price band, bed bucket, bath bucket, type/postcode) from a listing or snapshot; `weights.js` computes trained weights (recency, graded-reaction count, Layer 2/2⊕3 effective), filtering untraining reactions; `search.js` builds cold-start diversified search specs and selects next-fetch criteria.

**Entry point:** `signals.js` exports `signalsForListing()` (listing → signal array), `priceBand()`, bucketers; `weights.js` exports `isRecent()`, `gradedCount()`, weight derivers; `search.js` exports `diversifySelection()` (round-robin reorder across buckets), cold-start search builder. All three are pure, self-contained, no DOM/IO.

**Key constraint:** Pure logic (no storage, no clock except injectable `now`). Signals are symmetric between live listings and snapshots (same fields we learn from = same fields we score on). Unattributed rejects + administrative reactions do not train (no causal info); training reactions must carry a snapshot. Weights are capped at milestones to bound cold-start variance.

Run `find assets/js/learned-preferences -name '*.js'` for the live file list. See docs/REPO_MAP.md for the whole-repo map.
