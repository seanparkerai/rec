// page-area-detail.js — renders a single area by ?id=, using the 9-category framework.
import { getAreas, getShortlist, saveShortlist } from './storage.js';
import { url } from './config.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

const gbp = (n) => new Intl.NumberFormat('en-GB', {
  style: 'currency', currency: 'GBP', maximumFractionDigits: 0,
}).format(n || 0);

const $ = (id) => document.getElementById(id);

const PLACEHOLDER = '<p class="muted mb-0">Content for this section is being researched and will be added in a future update.</p>';

function listOrPlaceholder(arr, renderItem = (x) => esc(x)) {
  if (!arr?.length) return PLACEHOLDER;
  return `<ul class="mini-list">${arr.map((x) => `<li>${renderItem(x)}</li>`).join('')}</ul>`;
}

function textOrPlaceholder(s) {
  if (!s || !String(s).trim()) return PLACEHOLDER;
  return `<p class="mb-0">${esc(s)}</p>`;
}

function renderOverview(a) {
  const overview = textOrPlaceholder(a.overview);
  const character = a.character ? `<h3>Character</h3><p>${esc(a.character)}</p>` : '';
  return overview + character;
}

function renderAmenities(a) { return listOrPlaceholder(a.amenities); }

function renderSchools(a) {
  if (!a.schools?.length) return PLACEHOLDER;
  return `<ul class="mini-list">${a.schools.map((s) => {
    if (typeof s === 'string') return `<li>${esc(s)}</li>`;
    const name = esc(s.name || '');
    const type = s.type ? ` <span class="muted">· ${esc(s.type)}</span>` : '';
    const ofsted = s.ofsted ? ` <span class="badge">${esc(s.ofsted)}</span>` : '';
    return `<li><strong>${name}</strong>${type}${ofsted}</li>`;
  }).join('')}</ul>`;
}

function renderTransport(a) {
  const commutes = a.transport?.commutes || [];
  if (!commutes.length) return PLACEHOLDER;
  return `<ul class="mini-list">${commutes.map((c) => {
    if (typeof c === 'string') return `<li>${esc(c)}</li>`;
    const dest = esc(c.to || c.destination || '');
    const time = c.time ? ` — ${esc(c.time)}` : '';
    const mode = c.mode ? ` <span class="muted">(${esc(c.mode)})</span>` : '';
    return `<li><strong>${dest}</strong>${time}${mode}</li>`;
  }).join('')}</ul>`;
}

function renderPrices(a) {
  const p = a.prices || {};
  if (!Object.keys(p).length) return PLACEHOLDER;
  const rows = [
    ['Average sold (12 mo)', p.avgSold12Mo, true],
    ['Detached', p.avgDetached, true],
    ['Semi-detached', p.avgSemi, true],
    ['Terraced', p.avgTerraced, true],
    ['Bungalow', p.avgBungalow, true],
    ['Flat', p.avgFlat, true],
    ['Source', p.source, false],
  ].filter(([, v]) => v != null);
  if (!rows.length) return PLACEHOLDER;
  return `<dl class="field-list">${rows.map(([l, v, isCurrency]) =>
    `<div class="field-view"><dt>${esc(l)}</dt><dd>${isCurrency && typeof v === 'number' ? esc(gbp(v)) : esc(v)}</dd></div>`
  ).join('')}</dl>`;
}

function renderProsCons(a) {
  const pros = a.pros || [];
  const cons = a.cons || [];
  if (!pros.length && !cons.length) return PLACEHOLDER;
  return `
    <div class="proscons">
      <div>
        <h3>Pros</h3>
        ${pros.length ? `<ul class="mini-list">${pros.map((x) => `<li>+ ${esc(x)}</li>`).join('')}</ul>` : '<p class="muted">—</p>'}
      </div>
      <div>
        <h3>Cons</h3>
        ${cons.length ? `<ul class="mini-list">${cons.map((x) => `<li>− ${esc(x)}</li>`).join('')}</ul>` : '<p class="muted">—</p>'}
      </div>
    </div>
  `;
}

function renderImages(a) {
  const imgs = a.images || [];
  if (!imgs.length) return '';
  return `
    <section class="card">
      <h2>Images</h2>
      <div class="image-gallery">
        ${imgs.map((im) => `
          <figure>
            <img src="${esc(im.src)}" alt="${esc(im.alt || '')}" loading="lazy" />
            <figcaption>${esc(im.credit || '')} <span class="muted">${esc(im.licence || '')}</span></figcaption>
          </figure>
        `).join('')}
      </div>
    </section>
  `;
}

function renderSources(a) {
  const src = a.sources || [];
  if (!src.length) return '';
  return `
    <section class="card">
      <h2>Sources</h2>
      <ul class="mini-list">
        ${src.map((s) => {
          if (typeof s === 'string') {
            const isUrl = /^https?:\/\//.test(s);
            return `<li>${isUrl ? `<a href="${esc(s)}" rel="noopener" target="_blank">${esc(s)}</a>` : esc(s)}</li>`;
          }
          return `<li><a href="${esc(s.url)}" rel="noopener" target="_blank">${esc(s.title || s.url)}</a></li>`;
        }).join('')}
      </ul>
    </section>
  `;
}

function renderArea(a) {
  document.title = `${a.name} · rec`;

  // Header
  $('area-title').textContent = a.name;
  // Pair with the named transition set in page-areas.js so the title morphs in.
  $('area-title').style.viewTransitionName = 'area-title';
  $('area-village').textContent = a.village && a.village !== a.name ? a.village : '';
  $('area-meta').innerHTML = `
    <span>${esc(a.town)}</span><span aria-hidden="true">·</span>
    <span>${esc(a.county)}</span><span aria-hidden="true">·</span>
    <span>${esc(a.postcode)}</span>
    ${a.subRegion ? `<span aria-hidden="true">·</span><span>${esc(a.subRegion)}</span>` : ''}
  `;

  // Tiles
  $('tile-status').textContent = a.status || 'directory';
  $('tile-subregion').textContent = a.subRegion || '—';
  $('tile-postcode').textContent = a.postcode || '—';
  $('tile-county').textContent = a.county || '—';

  // Sections
  $('sec-overview').innerHTML = renderOverview(a);
  $('sec-amenities').innerHTML = renderAmenities(a);
  $('sec-schools').innerHTML = renderSchools(a);
  $('sec-transport').innerHTML = renderTransport(a);
  $('sec-prices').innerHTML = renderPrices(a);
  $('sec-things').innerHTML = listOrPlaceholder(a.thingsToDo);
  $('sec-eat').innerHTML = listOrPlaceholder(a.placesToEat);
  $('sec-proscons').innerHTML = renderProsCons(a);
  $('sec-suits').innerHTML = listOrPlaceholder(a.whoItSuits);

  // Images + sources appended (if any)
  $('extras').innerHTML = renderImages(a) + renderSources(a);

  // Shortlist button
  const shortlist = new Set(getShortlist());
  const starred = shortlist.has(a.id);
  const btn = $('btn-star');
  btn.textContent = starred ? '★ Shortlisted' : '☆ Add to shortlist';
  btn.setAttribute('aria-pressed', starred);
  btn.classList.toggle('is-starred', starred);
  btn.addEventListener('click', () => {
    const s = new Set(getShortlist());
    if (s.has(a.id)) s.delete(a.id); else s.add(a.id);
    saveShortlist([...s]);
    const now = s.has(a.id);
    btn.textContent = now ? '★ Shortlisted' : '☆ Add to shortlist';
    btn.setAttribute('aria-pressed', now);
    btn.classList.toggle('is-starred', now);
  });
}

function renderNotFound(id) {
  document.title = 'Area not found · rec';
  $('area-title').textContent = 'Area not found';
  $('area-meta').textContent = '';
  const main = document.querySelector('main');
  main.innerHTML = `
    <div class="page-head">
      <h1>Area not found</h1>
      <p class="muted">No area in the directory matches <code>${esc(id)}</code>.</p>
    </div>
    <p><a href="${url('pages/areas.html')}">← Back to areas directory</a></p>
  `;
}

async function init() {
  const params = new URLSearchParams(location.search);
  const id = params.get('id');
  if (!id) { renderNotFound('(no id)'); return; }

  try {
    const areas = await getAreas();
    const a = areas.find((x) => x.id === id);
    if (!a) { renderNotFound(id); return; }
    renderArea(a);
  } catch (e) {
    console.error('area detail error', e);
    renderNotFound(id);
  }
}

init();
