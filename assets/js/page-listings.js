// page-listings.js — v3 Live Listings page coordinator (L1 + L2).
// Loads fetcher-written listings, scores each with the listing-fit engine
// (5-band verdict + affordability hard gate + explainable contributions),
// and renders a fit-ranked feed. Reaction capture + learned preferences arrive
// in L3/L4; this page already surfaces the "why" for every verdict.
import { getListings, getCriteria, getFinances, getAreas } from './storage.js';
import { deriveFinances } from './finance-derive.js';
import { scoreListingFit } from './listing-fit.js';
import { el, clear } from './dom.js';

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
      return el('li', { class: `listing-why__item listing-why__item--${c.delta > 0 ? 'pos' : 'neg'}` }, [
        el('span', { class: 'listing-why__sign', 'aria-hidden': 'true' }, sign),
        el('span', { class: 'listing-why__label' }, c.label),
      ]);
    });
  if (!items.length) items.push(el('li', { class: 'listing-why__item' }, 'No distinguishing signals — neutral fit.'));
  return el('details', { class: 'listing-why' }, [
    el('summary', {}, 'Why this verdict'),
    el('ul', { class: 'listing-why__list' }, items),
  ]);
}

function buildRow(listing, idx, scored, area) {
  const verdict = scored?.verdict || 'unknown';
  const dot = el('span', { class: `fit-dot fit-dot--${verdict}`, 'aria-hidden': 'true' });

  const title = el('p', { class: 'area-name' }, listing.title || `${listing.beds ?? '?'}-bed ${listing.property_type || 'property'}`);

  const placeBits = [];
  if (listing.address) placeBits.push(listing.address);
  else if (area?.name) placeBits.push(area.name);
  if (listing.outcode) placeBits.push(listing.outcode);
  const place = el('p', { class: 'area-place' }, placeBits.join(' · '));

  const tags = [];
  if (listing.status && listing.status !== 'live') {
    tags.push(el('span', { class: `listing-tag listing-tag--${listing.status}` }, STATUS_LABELS[listing.status] || listing.status));
  }
  const drop = lastPriceDrop(listing);
  if (drop) tags.push(el('span', { class: 'listing-tag listing-tag--drop' }, `↓ ${fmtPrice(drop)}`));
  if (listing.update_reason === 'new') tags.push(el('span', { class: 'listing-tag listing-tag--new' }, 'New'));
  const tagRow = tags.length ? el('div', { class: 'listing-tags' }, tags) : null;

  const main = el('div', { class: 'area-row__main' }, [title, place, tagRow, buildWhy(scored)].filter(Boolean));

  const price = el('span', { class: 'bed-fit' }, [
    el('span', { class: `bed-fit-type verdict verdict--${verdict}` }, VERDICT_LABELS[verdict]),
    el('span', { class: 'num' }, fmtPrice(listing.price)),
  ]);

  const meta = el('span', { class: 'listing-meta' }, [
    el('span', { class: 'listing-meta__beds num' }, listing.beds != null ? `${listing.beds} bed` : '—'),
    el('span', { class: 'listing-meta__age' }, fmtAgo(listing.added_date || listing.first_seen)),
  ]);

  const open = listing.url
    ? el('a', { class: 'listing-open', href: listing.url, target: '_blank', rel: 'noopener', 'aria-label': 'Open on Rightmove' }, '↗')
    : el('span', { class: 'listing-open listing-open--none' }, '');

  return el('li', { class: 'area-row listing-row', 'data-id': listing.rightmove_id }, [
    el('span', { class: 'area-index num' }, String(idx + 1).padStart(3, '0')),
    dot, main, price, meta, open,
  ]);
}

function buildSummary(shown, total, gatedCount) {
  const bits = [`${shown} listing${shown === 1 ? '' : 's'} shown`];
  if (gatedCount) bits.push(`${gatedCount} out of reach (hidden)`);
  if (total !== shown + gatedCount) bits.push(`${total} fetched`);
  return el('p', { class: 'listings-summary' }, bits.join(' · '));
}

async function render() {
  const main = document.querySelector('#main') || document.body;
  const listEl = main.querySelector('[data-listings]') || main.querySelector('.area-list');
  const summaryEl = main.querySelector('[data-listings-summary]');
  const showOOR = main.querySelector('[data-show-oor]');
  if (!listEl) return;

  const [listings, criteria, rawFinances, areas] = await Promise.all([
    getListings({ limit: 200 }), getCriteria(), getFinances(), getAreas(),
  ]);
  const finances = rawFinances ? deriveFinances(rawFinances) : null;
  const areasById = new Map((areas || []).map((a) => [a.id, a]));

  function paint() {
    clear(listEl);
    const includeOOR = !!(showOOR && showOOR.checked);

    if (!listings.length) {
      listEl.appendChild(el('li', { class: 'listings-empty' }, [
        el('p', {}, 'No listings yet.'),
        el('p', { class: 'listings-empty__hint' }, 'The daily fetch (fetch-listings workflow) hasn’t populated the listings table yet — run it from the Actions tab, or check the Apify / Supabase secrets are set.'),
      ]));
      if (summaryEl) { clear(summaryEl); }
      return;
    }

    const scoredRows = listings.map((listing) => {
      const area = listing.area_id ? areasById.get(listing.area_id) : null;
      const scored = finances
        ? scoreListingFit({ listing, finances, criteria, area })
        : { verdict: 'unknown', score: 0, gated: false, contributions: [] };
      return { listing, scored, area };
    });

    const gated = scoredRows.filter((r) => r.scored.gated);
    let visible = includeOOR ? scoredRows : scoredRows.filter((r) => !r.scored.gated);
    visible.sort((a, b) =>
      (b.scored.score - a.scored.score) ||
      (new Date(b.listing.first_seen) - new Date(a.listing.first_seen)));

    visible.forEach((r, i) => listEl.appendChild(buildRow(r.listing, i, r.scored, r.area)));

    if (summaryEl) { clear(summaryEl); summaryEl.appendChild(buildSummary(visible.length, listings.length, includeOOR ? 0 : gated.length)); }
  }

  if (showOOR) showOOR.addEventListener('change', paint);
  paint();
}

render();
