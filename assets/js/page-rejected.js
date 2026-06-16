// page-rejected.js — the dedicated "Rejected & passed" surface.
// A simplified, paginated table of every property whose CURRENT reaction is `pass`
// or `reject`, most-recently-actioned first, one small cover photo per row. It reads
// ONLY the append-only reaction log (latest-per-listing) and renders from each
// reaction's durable snapshot — no listings fetch — so the page stays light even
// with a large reject pile and still shows homes whose live row was withdrawn or
// purged. Search narrows by property type / area name; the table paginates 50/page.
import { getReactionLog } from './storage.js';
import { loadJSON } from './data-loader.js';
import { buildRejectedRows, searchRejected, paginate } from './listings/rejected-view.js';
import { url } from './config.js';
import { el, clear } from './dom.js';

const PER_PAGE = 50;
const dossierHref = (id) => `${url('pages/property.html')}?id=${encodeURIComponent(id)}&from=rejected`;
const fmtPrice = (n) => (n == null ? '—' : '£' + Math.round(n).toLocaleString('en-GB'));
const fmtDate = (v) => {
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
};

// Small cover thumbnail with a monogram fallback (lazy, no-referrer — same
// resilience as the feed's media so a broken/blocked image degrades gracefully).
function buildThumb(listing) {
  const monogram = () => el('span', { class: 'rejected-thumb rejected-thumb--none', 'aria-hidden': 'true' },
    (listing.property_type || '•').slice(0, 1).toUpperCase());
  if (!listing.image_url) return monogram();
  const img = el('img', {
    class: 'rejected-thumb', src: listing.image_url, alt: '',
    loading: 'lazy', decoding: 'async', referrerpolicy: 'no-referrer',
  });
  img.addEventListener('error', () => img.replaceWith(monogram()), { once: true });
  return img;
}

function verdictBadge(reaction) {
  const label = reaction === 'reject' ? 'Rejected' : 'Passed';
  return el('span', { class: `rejected-verdict rejected-verdict--${reaction}` }, label);
}

function buildRow(entry) {
  const l = entry.listing;
  const place = [l.address, l.outcode].filter(Boolean).join(' · ');
  const title = l.title || `${l.beds ?? '?'}-bed ${l.property_type || 'property'}`;
  return el('tr', { 'data-id': l.rightmove_id }, [
    el('td', { class: 'rejected-cell-thumb' }, [buildThumb(l)]),
    el('td', { class: 'rejected-cell-property' }, [
      el('a', { class: 'rejected-title', href: dossierHref(l.rightmove_id) }, title),
      place ? el('span', { class: 'rejected-place' }, place) : null,
    ].filter(Boolean)),
    el('td', {}, l.property_type || '—'),
    el('td', {}, entry.areaName || '—'),
    el('td', { class: 'num' }, l.beds != null ? String(l.beds) : '—'),
    el('td', { class: 'num' }, fmtPrice(l.price)),
    el('td', {}, [verdictBadge(entry.reaction)]),
    el('td', { class: 'num' }, fmtDate(entry.created_at)),
  ]);
}

async function render() {
  const main = document.querySelector('#main') || document.body;
  const tbody = main.querySelector('[data-rejected-rows]');
  if (!tbody) return;
  const summaryEl = main.querySelector('[data-rejected-summary]');
  const filterEl = main.querySelector('[data-rejected-filter]');
  const tableWrap = main.querySelector('[data-rejected-tablewrap]');
  const pagerEl = main.querySelector('[data-rejected-pager]');
  const pageInfoEl = main.querySelector('[data-rejected-pageinfo]');
  const prevBtn = main.querySelector('[data-rejected-prev]');
  const nextBtn = main.querySelector('[data-rejected-next]');
  const emptyEl = main.querySelector('[data-rejected-empty]');
  const searchInput = main.querySelector('[data-control="search"]');

  const [log, areas] = await Promise.all([
    getReactionLog(),
    loadJSON('areas').catch(() => []),
  ]);
  // Map area_id → name across ALL areas (not just the household's current selection),
  // so a property rejected in an area you have since deselected still names its area
  // and is findable by area search.
  const areaName = new Map((areas || []).map((a) => [a.id, a.name || a.town || a.id]));
  const areaNameOf = (l) => (l && l.area_id ? (areaName.get(l.area_id) || '') : '');

  const allRows = buildRejectedRows(log, { areaNameOf });
  const state = { query: '', page: 1 };

  const show = (node, on) => { if (node) node.hidden = !on; };

  function paint() {
    const filtered = searchRejected(allRows, state.query);
    const { slice, page, pageCount, total, start } = paginate(filtered, state.page, PER_PAGE);
    state.page = page;

    clear(tbody);
    for (const entry of slice) tbody.appendChild(buildRow(entry));

    const hasAny = allRows.length > 0;
    const hasMatches = total > 0;
    show(filterEl, hasAny);
    show(tableWrap, hasMatches);
    show(pagerEl, pageCount > 1);

    if (emptyEl) {
      if (!hasAny) {
        emptyEl.hidden = false;
        clear(emptyEl);
        emptyEl.append(
          el('p', {}, 'No passed or rejected properties yet.'),
          el('p', { class: 'rejected-empty__hint' }, [
            'Pass or reject properties on the ',
            el('a', { href: url('pages/listings.html') }, 'Listings'),
            ' page and they’ll gather here.',
          ]),
        );
      } else if (!hasMatches) {
        emptyEl.hidden = false;
        clear(emptyEl);
        emptyEl.append(el('p', {}, `No matches for “${state.query.trim()}”.`));
      } else {
        emptyEl.hidden = true;
      }
    }

    if (summaryEl) {
      if (!total) {
        summaryEl.textContent = hasAny ? '0 of ' + allRows.length + ' properties' : '';
      } else {
        const first = start + 1;
        const last = start + slice.length;
        const noun = `propert${allRows.length === 1 ? 'y' : 'ies'}`;
        summaryEl.textContent = total === allRows.length
          ? `${allRows.length} ${noun} · showing ${first}–${last}`
          : `${total} of ${allRows.length} ${noun} · showing ${first}–${last}`;
      }
    }

    if (pageInfoEl) pageInfoEl.textContent = `Page ${page} of ${pageCount}`;
    if (prevBtn) prevBtn.disabled = page <= 1;
    if (nextBtn) nextBtn.disabled = page >= pageCount;
  }

  searchInput?.addEventListener('input', (e) => { state.query = e.target.value; state.page = 1; paint(); });
  prevBtn?.addEventListener('click', () => { state.page -= 1; paint(); scrollToTop(); });
  nextBtn?.addEventListener('click', () => { state.page += 1; paint(); scrollToTop(); });

  paint();
}

function scrollToTop() {
  const main = document.querySelector('#main');
  if (main) main.scrollIntoView({ block: 'start', behavior: 'auto' });
}

render();
