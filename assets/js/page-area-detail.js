// page-area-detail.js — renders a single area by ?id=, using the 9-category framework.
import { getAreas, getAreaDetail, getShortlist, saveShortlist, getFinances, getCriteria } from './storage.js';
import { url } from './config.js';
import { gbp } from './format.js';
import { assessAffordability } from './affordability.js';
import { esc, byId as $ } from './dom.js';

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

function ofstedClass(rating) {
  const r = String(rating || '').toLowerCase();
  if (/outstanding/.test(r)) return 'ofsted-dot--outstanding';
  if (/^good\b/.test(r)) return 'ofsted-dot--good';
  if (/requires improvement|requires/.test(r)) return 'ofsted-dot--requires';
  if (/inadequate|special measures/.test(r)) return 'ofsted-dot--inadequate';
  return 'ofsted-dot--unknown';
}

function renderSchools(a) {
  if (!a.schools?.length) return PLACEHOLDER;
  return `<ul class="mini-list">${a.schools.map((s) => {
    if (typeof s === 'string') return `<li><span class="ofsted-dot ofsted-dot--unknown" aria-hidden="true"></span>${esc(s)}</li>`;
    const name = esc(s.name || '');
    const type = s.type ? ` <span class="muted">· ${esc(s.type)}</span>` : '';
    const dotCls = ofstedClass(s.ofsted);
    const dotTitle = s.ofsted ? `Ofsted: ${esc(s.ofsted)}` : 'Ofsted: not recorded';
    const ofsted = s.ofsted ? ` <span class="badge">${esc(s.ofsted)}</span>` : '';
    return `<li><span class="ofsted-dot ${dotCls}" title="${dotTitle}" aria-label="${dotTitle}"></span><strong>${name}</strong>${type}${ofsted}</li>`;
  }).join('')}</ul>`;
}

function commuteBandClass(time) {
  // Parse "25 min", "1 h 10 min", etc. → minutes.
  if (!time) return 'commute-band--long';
  const t = String(time).toLowerCase();
  const hMatch = t.match(/(\d+)\s*h/);
  const mMatch = t.match(/(\d+)\s*(?:m|min)/);
  const mins = (hMatch ? Number(hMatch[1]) * 60 : 0) + (mMatch ? Number(mMatch[1]) : 0);
  if (mins === 0) return 'commute-band--long';
  if (mins <= 30) return 'commute-band--quick';
  if (mins <= 60) return 'commute-band--medium';
  return 'commute-band--long';
}

function renderTransport(a) {
  const commutes = a.transport?.commutes || [];
  if (!commutes.length) return PLACEHOLDER;
  return `<ul class="mini-list">${commutes.map((c) => {
    if (typeof c === 'string') return `<li>${esc(c)}</li>`;
    const dest = esc(c.to || c.destination || '');
    const time = c.time || c.typical;
    const bandCls = commuteBandClass(time);
    const timeStr = time ? ` <span class="commute-band ${bandCls}">${esc(time)}</span>` : '';
    const mode = c.mode ? ` <span class="muted">(${esc(c.mode)})</span>` : '';
    return `<li><strong>${dest}</strong>${timeStr}${mode}</li>`;
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
  const summary = p.summary
    ? `<p class="mb-0">${esc(p.summary)}</p>`
    : '';
  const sourceLink = !p.source && p.sourceUrl
    ? `<p class="muted mb-0"><a href="${esc(p.sourceUrl)}" rel="noopener" target="_blank">Price source</a>${p.asOf ? ` · ${esc(p.asOf)}` : ''}</p>`
    : (p.asOf && !rows.length ? `<p class="muted mb-0">As of ${esc(p.asOf)}</p>` : '');
  if (!rows.length) return summary + sourceLink || PLACEHOLDER;
  return summary + `<dl class="field-list">${rows.map(([l, v, isCurrency]) =>
    `<div class="field-view"><dt>${esc(l)}</dt><dd>${isCurrency && typeof v === 'number' ? esc(gbp(v)) : esc(v)}</dd></div>`
  ).join('')}</dl>` + sourceLink;
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
          return `<li><a href="${esc(s.url)}" rel="noopener" target="_blank">${esc(s.title || s.label || s.url)}</a></li>`;
        }).join('')}
      </ul>
    </section>
  `;
}

function renderEssentials(a) {
  const rows = [
    ['Council tax band', a.councilTaxBand],
    ['Broadband (median)', a.broadbandMedianMbps ? `${a.broadbandMedianMbps} Mbps` : null],
    ['Nearest station', a.nearestStation],
    ['Primary supermarket', a.primarySupermarket],
  ].filter(([, v]) => v != null && v !== '');
  const card = $('sec-essentials');
  const list = $('essentials-list');
  if (!rows.length) { if (card) card.hidden = true; return; }
  if (card) card.hidden = false;
  if (list) list.innerHTML = rows.map(([l, v]) =>
    `<div class="field-view"><dt>${esc(l)}</dt><dd>${esc(String(v))}</dd></div>`
  ).join('');
}

function matchedPrice(area, criteria) {
  const ps = area?.priceSummary || area?.prices || null;
  if (!ps) return { price: null, label: null };
  const PROP_TO_KEY = {
    Detached: 'avgDetached', Bungalow: 'avgDetached',
    'Semi-detached': 'avgSemi', Terraced: 'avgTerraced', 'Flat / Apartment': 'avgFlat',
  };
  const preferred = criteria?.propertyTypePrefs?.preferred || [];
  for (const t of preferred) {
    const k = PROP_TO_KEY[t];
    if (k && ps[k] != null) return { price: ps[k], label: t };
  }
  for (const [k, label] of [['avgSemi', 'Semi'], ['avgTerraced', 'Terraced'], ['avgDetached', 'Detached'], ['avgFlat', 'Flat']]) {
    if (ps[k] != null) return { price: ps[k], label };
  }
  return { price: null, label: null };
}

function renderVerdictStrip(a, finances, criteria) {
  const strip = document.getElementById('area-verdict');
  if (!strip) return;
  const dot = document.getElementById('area-verdict-dot');
  const txt = document.getElementById('area-verdict-text');
  const num = document.getElementById('area-verdict-num');
  if (!finances || !criteria) {
    txt.textContent = 'Finances or criteria unavailable — verdict not computed.';
    strip.className = 'area-verdict-strip area-verdict-strip--unknown';
    return;
  }
  const { price, label } = matchedPrice(a, criteria);
  if (!price) {
    txt.textContent = 'No price data for this area yet — verdict not available.';
    if (dot) dot.className = 'fit-dot fit-dot--unknown';
    strip.className = 'area-verdict-strip area-verdict-strip--unknown';
    return;
  }
  const r = assessAffordability({ price, finances, criteria });
  if (dot) dot.className = `fit-dot fit-dot--${r.verdict}`;
  strip.className = `area-verdict-strip area-verdict-strip--${r.verdict}`;
  txt.textContent = r.headline;
  num.innerHTML = `<span>Avg <strong>${esc(label || '—')}</strong></span><span><strong>${esc(gbp(price))}</strong></span><span><strong>${esc(gbp(r.monthlyPI))}/mo</strong></span>`;
  const outreachLink = document.getElementById('area-outreach-link');
  if (outreachLink) outreachLink.hidden = false;
}

function attachFootAfford(a, finances, criteria) {
  const wrap = document.getElementById('area-foot-afford');
  if (!wrap || !finances || !criteria) return;
  wrap.hidden = false;
  const slider = document.getElementById('area-afford-slider');
  const number = document.getElementById('area-afford-number');
  const display = document.getElementById('area-afford-display');
  const pill = document.getElementById('area-afford-pill');
  const initial = matchedPrice(a, criteria).price ?? Number(criteria?.budget?.max || 0);
  slider.value = String(initial);
  number.value = String(initial);
  if (display) display.textContent = gbp(initial);

  const update = (raw) => {
    const price = Math.max(100000, Math.min(2000000, Number(raw) || 0));
    if (display) display.textContent = gbp(price);
    if (slider.value !== String(price)) slider.value = String(price);
    if (number.value !== String(price)) number.value = String(price);
    const r = assessAffordability({ price, finances, criteria });
    if (pill) {
      pill.className = `afford-verdict-pill afford-verdict-pill--${r.verdict}`;
      pill.textContent = r.verdict;
    }
    document.getElementById('area-afford-loan').textContent = gbp(r.loanRequired);
    document.getElementById('area-afford-ltv').innerHTML = `${r.ltvPct.toFixed(1)}%`;
    document.getElementById('area-afford-monthly').textContent = gbp(r.monthlyPI);
    document.getElementById('area-afford-spare').textContent = gbp(r.monthlySpareAfter);
    document.getElementById('area-afford-why').innerHTML = r.whyVerdict.map((s) => `<li>${esc(s)}</li>`).join('');
  };
  slider.addEventListener('input', (e) => update(e.target.value));
  number.addEventListener('input', (e) => update(e.target.value));
  update(initial);
}

async function renderArea(a) {
  document.title = `${a.name} · GR`;

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
  renderEssentials(a);
  $('sec-overview').innerHTML = renderOverview(a);
  $('sec-amenities').innerHTML = renderAmenities(a);
  $('sec-schools').innerHTML = renderSchools(a);
  $('sec-transport').innerHTML = renderTransport(a);
  $('sec-prices').innerHTML = renderPrices(a);
  $('sec-things').innerHTML = listOrPlaceholder(a.thingsToDo);
  $('sec-eat').innerHTML = listOrPlaceholder(
    a.placesToEat,
    (x) => typeof x === 'string' ? esc(x) : [
      x.url ? `<a href="${esc(x.url)}" rel="noopener" target="_blank">${esc(x.name || x.url)}</a>` : `<strong>${esc(x.name || '')}</strong>`,
      x.type ? ` <span class="muted">· ${esc(x.type)}</span>` : '',
      x.notes ? ` — ${esc(x.notes)}` : '',
    ].join(''),
  );
  $('sec-proscons').innerHTML = renderProsCons(a);
  const suits = Array.isArray(a.whoItSuits) ? a.whoItSuits : (a.whoItSuits ? [a.whoItSuits] : null);
  $('sec-suits').innerHTML = listOrPlaceholder(suits);

  // Images + sources appended (if any)
  $('extras').innerHTML = renderImages(a) + renderSources(a);

  // Shortlist button
  const shortlist = new Set(await getShortlist());
  const starred = shortlist.has(a.id);
  const btn = $('btn-star');
  btn.textContent = starred ? '★ Shortlisted' : '☆ Add to shortlist';
  btn.setAttribute('aria-pressed', starred);
  btn.classList.toggle('is-starred', starred);
  btn.addEventListener('click', async () => {
    const s = new Set(await getShortlist());
    if (s.has(a.id)) s.delete(a.id); else s.add(a.id);
    saveShortlist([...s]);
    const now = s.has(a.id);
    btn.textContent = now ? '★ Shortlisted' : '☆ Add to shortlist';
    btn.setAttribute('aria-pressed', now);
    btn.classList.toggle('is-starred', now);
  });
}

function renderNotFound(id) {
  document.title = 'Area not found · GR';
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
    let a = null;
    try { a = await getAreaDetail(id); } catch (_) { /* fall through */ }
    if (!a) {
      const areas = await getAreas();
      a = areas.find((x) => x.id === id) || null;
    }
    if (!a) { renderNotFound(id); return; }
    await renderArea(a);

    // Phase 4b: verdict strip + foot mini-afford widget — best-effort if
    // finances/criteria load successfully.
    let finances = null, criteria = null;
    try { finances = await getFinances(); } catch (e) { console.error('finances load', e); }
    try { criteria = await getCriteria(); } catch (e) { console.error('criteria load', e); }
    renderVerdictStrip(a, finances, criteria);
    attachFootAfford(a, finances, criteria);
  } catch (e) {
    console.error('area detail error', e);
    renderNotFound(id);
  }
}

init();
