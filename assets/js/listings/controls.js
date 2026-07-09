// listings-controls.js — shared search / sort / filter for the Live Listings feed
// and the Saved Listings view. Ported from the Areas directory pattern
// (page-areas.js: state + URL sync + applyFilters + sortFns) and generalised over
// the listings field shape, so both pages get identical behaviour from one module.
//
// Two layers:
//   • Pure core — `filterListings` / `sortListings`, no DOM, unit-tested.
//   • Thin DOM layer — `createListingsControls(...)` wires an inline controls bar
//     (search box + sort select + type/beds/status selects + clear) to a list,
//     keeps shareable URL state, and calls back when anything changes.
//
// Item shape: a raw listings row (address, postcode, outcode, title,
// property_type, status, price, beds, first_seen/added_date, ...). Score, rating
// and the matched area NAME are supplied via accessors so the module never reaches
// into storage itself.

const norm = (s) => String(s ?? '').toLowerCase();

/** Sort options exposed in the UI (key + human label), best-effort order. */
export const LISTING_SORTS = [
  { key: 'fit',        label: 'Best fit' },
  { key: 'recent',     label: 'Most recent' },
  { key: 'price-asc',  label: 'Price: low to high' },
  { key: 'price-desc', label: 'Price: high to low' },
  { key: 'beds',       label: 'Most bedrooms' },
  { key: 'type',       label: 'House type' },
  { key: 'rating',     label: 'Your rating' },
];

const STATUS_FILTER_LABELS = {
  live: 'For sale',
  under_offer: 'Under offer',
  sstc: 'Sold STC',
  withdrawn: 'Withdrawn',
};

export const DEFAULT_CONTROLS_STATE = {
  search: '', sort: 'fit', type: 'all', beds: 'all', status: 'all',
};

// ── Pure core ────────────────────────────────────────────────────────────────

/**
 * Filter listings by the search text and the type/beds/status facets.
 * Search is multi-token AND across address, postcode, outcode, title,
 * property_type and the matched area/town name. `beds` is a MINIMUM (e.g. '3'
 * keeps 3+ bed homes).
 */
export function filterListings(listings, state = {}, { areaNameOf } = {}) {
  const q = norm(state.search).trim();
  const tokens = q ? q.split(/\s+/) : [];
  const minBeds = state.beds && state.beds !== 'all' ? parseInt(state.beds, 10) : 0;
  return (listings || []).filter((l) => {
    if (state.type && state.type !== 'all' && norm(l.property_type) !== norm(state.type)) return false;
    if (minBeds && !(Number(l.beds) >= minBeds)) return false;
    if (state.status && state.status !== 'all' && norm(l.status) !== norm(state.status)) return false;
    if (!tokens.length) return true;
    const hay = [
      l.address, l.postcode, l.outcode, l.title, l.property_type,
      areaNameOf ? areaNameOf(l) : '',
    ].map(norm).join(' ');
    return tokens.every((t) => hay.includes(t));
  });
}

/**
 * Return a new array sorted per `state.sort`. `scoreOf` (fit score, 0–1) and
 * `ratingOf` (1–10) are optional accessors; recency is the universal tiebreaker.
 */
export function sortListings(listings, state = {}, { scoreOf, ratingOf } = {}) {
  const arr = (listings || []).slice();
  const score = scoreOf || (() => 0);
  const rating = ratingOf || (() => 0);
  const recency = (l) => {
    const d = new Date(l.first_seen || l.added_date || 0).getTime();
    return Number.isNaN(d) ? 0 : d;
  };
  const beds = (l) => Number(l.beds) || 0;
  const priceOr = (l, fallback) => (l.price == null ? fallback : Number(l.price));
  const cmp = {
    fit:          (a, b) => (score(b) - score(a)) || (recency(b) - recency(a)),
    recent:       (a, b) => recency(b) - recency(a),
    'price-asc':  (a, b) => (priceOr(a, Infinity) - priceOr(b, Infinity)) || (recency(b) - recency(a)),
    'price-desc': (a, b) => (priceOr(b, -Infinity) - priceOr(a, -Infinity)) || (recency(b) - recency(a)),
    beds:         (a, b) => (beds(b) - beds(a)) || (recency(b) - recency(a)),
    type:         (a, b) => norm(a.property_type).localeCompare(norm(b.property_type)) || (recency(b) - recency(a)),
    rating:       (a, b) => (rating(b) - rating(a)) || (score(b) - score(a)) || (recency(b) - recency(a)),
  };
  arr.sort(cmp[state.sort] || cmp.fit);
  return arr;
}

const uniq = (arr) => [...new Set(arr.filter((x) => x != null && x !== ''))];

// ── DOM layer ────────────────────────────────────────────────────────────────

const URL_KEYS = { search: 'q', sort: 'sort', type: 'type', beds: 'beds', status: 'status' };

/**
 * Wire an inline controls bar to a listings list.
 * @param {object} opts
 * @param {(l)=>number} [opts.scoreOf]    fit score accessor (0–1)
 * @param {(l)=>number} [opts.ratingOf]   manual rating accessor (1–10)
 * @param {(l)=>string} [opts.areaNameOf] matched area/town name (for search)
 * @param {Function}    opts.onChange     called (with current state) on any change
 * @param {boolean}     [opts.urlSync=true] keep shareable ?q/&sort/... in the URL
 * @returns {{ state, apply, wire, populate, syncControls }}
 */
export function createListingsControls({ scoreOf, ratingOf, areaNameOf, onChange, urlSync = true, defaults } = {}) {
  const base = { ...DEFAULT_CONTROLS_STATE, ...(defaults || {}) };
  const state = { ...base };

  function readStateFromURL() {
    if (!urlSync) return;
    const p = new URLSearchParams(location.search);
    for (const [k, urlKey] of Object.entries(URL_KEYS)) {
      if (p.has(urlKey)) state[k] = p.get(urlKey) || base[k];
    }
  }

  function writeStateToURL() {
    if (!urlSync) return;
    const p = new URLSearchParams(location.search);
    for (const [k, urlKey] of Object.entries(URL_KEYS)) {
      if (state[k] && state[k] !== base[k]) p.set(urlKey, state[k]);
      else p.delete(urlKey);
    }
    const qs = p.toString();
    history.replaceState(null, '', location.pathname + (qs ? `?${qs}` : '') + location.hash);
  }

  function apply(listings) {
    return sortListings(filterListings(listings, state, { areaNameOf }), state, { scoreOf, ratingOf });
  }

  // Populate the dynamic type/status option lists from the data actually present.
  function populate(root, listings) {
    if (!root) return;
    const typeSel = root.querySelector('[data-control="type"]');
    if (typeSel) {
      const types = uniq((listings || []).map((l) => l.property_type)).sort((a, b) => a.localeCompare(b));
      typeSel.innerHTML = `<option value="all">Any type</option>` +
        types.map((t) => `<option value="${esc(t)}">${esc(t)}</option>`).join('');
    }
    const statusSel = root.querySelector('[data-control="status"]');
    if (statusSel) {
      const statuses = uniq((listings || []).map((l) => l.status));
      statusSel.innerHTML = `<option value="all">Any status</option>` +
        statuses.map((s) => `<option value="${esc(s)}">${esc(STATUS_FILTER_LABELS[s] || s)}</option>`).join('');
    }
    const sortSel = root.querySelector('[data-control="sort"]');
    if (sortSel && !sortSel.options.length) {
      sortSel.innerHTML = LISTING_SORTS.map((s) => `<option value="${s.key}">${esc(s.label)}</option>`).join('');
    }
  }

  function syncControls(root) {
    if (!root) return;
    for (const k of ['search', 'sort', 'type', 'beds', 'status']) {
      const elx = root.querySelector(`[data-control="${k}"]`);
      if (elx && elx.value !== state[k]) elx.value = state[k];
    }
  }

  function wire(root, listings) {
    if (!root) return;
    populate(root, listings);
    readStateFromURL();
    syncControls(root);
    const fire = () => { writeStateToURL(); onChange?.(state); };
    const bind = (k, evt) => {
      const elx = root.querySelector(`[data-control="${k}"]`);
      elx?.addEventListener(evt, (e) => { state[k] = e.target.value; fire(); });
    };
    bind('search', 'input');
    bind('sort', 'change');
    bind('type', 'change');
    bind('beds', 'change');
    bind('status', 'change');
    root.querySelector('[data-control="clear"]')?.addEventListener('click', () => {
      Object.assign(state, base);
      syncControls(root);
      fire();
    });
    if (urlSync) {
      window.addEventListener('popstate', () => { readStateFromURL(); syncControls(root); onChange?.(state); });
    }
  }

  return { state, apply, wire, populate, syncControls };
}

// Minimal escaper — one name/one behaviour, mirroring dom.js `esc` (escapes the
// full &<>"' set so it is safe in both element text and quoted attributes). Kept
// local so this module stays import-free and Node-unit-testable. Used only for
// option markup built from listing-derived strings.
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
