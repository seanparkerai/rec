// page-house-types.js — gallery of characteristic house types found in Hampshire & Wiltshire.
// Cross-references to data/areas.json (via houseTypeIds on each area) once areas are tagged.
import { getHouseTypes, getAreas, getShortlist } from './storage.js';
import { url } from './config.js';
import { gbp } from './format.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

const $ = (id) => document.getElementById(id);

// Pick the price key most aligned with each house type's name.
function priceKeyFor(typeName) {
  const n = String(typeName || '').toLowerCase();
  if (/semi/.test(n)) return 'avgSemi';
  if (/terrace/.test(n)) return 'avgTerraced';
  if (/cottage|bungalow|barn|farm|chalk|cob|brick|georgian|edwardian|victorian|detached|manor|new build/.test(n)) return 'avgDetached';
  if (/flat|apartment|maisonette/.test(n)) return 'avgFlat';
  return 'avgDetached';
}

function priceBandFor(areasForType, key) {
  const values = areasForType.map((a) => a?.priceSummary?.[key]).filter((v) => typeof v === 'number');
  if (!values.length) return null;
  values.sort((a, b) => a - b);
  return { min: values[0], max: values[values.length - 1], median: values[Math.floor(values.length / 2)], n: values.length };
}

function renderCard(type, areasForType, shortlistIds) {
  const img = type.images?.[0];
  const imgHtml = img
    ? `<figure class="ht-image"><img src="${esc(img.src)}" alt="${esc(img.alt || type.name)}" loading="lazy" /><figcaption>${esc(img.credit || '')} <span class="muted">${esc(img.licence || '')}</span></figcaption></figure>`
    : `<div class="ht-image ht-image-placeholder" aria-hidden="true">${esc(type.name.charAt(0))}</div>`;

  const features = (type.features || []).map((f) => `<li>${esc(f)}</li>`).join('');
  const regions = (type.regionsCommon || []).map((r) => `<li class="chip">${esc(r)}</li>`).join('');

  const linkedAreas = areasForType.slice(0, 6);
  const moreCount = areasForType.length - linkedAreas.length;
  const linksHtml = linkedAreas.length
    ? `<p class="ht-areas"><span class="muted">Found in:</span> ${linkedAreas.map((a) => `<a href="${url('pages/area-detail.html')}?id=${encodeURIComponent(a.id)}">${esc(a.name)}</a>`).join(', ')}${moreCount > 0 ? ` + ${moreCount} more` : ''}</p>`
    : '';

  // Phase 4c: typical price band across areas associated with this type.
  const key = priceKeyFor(type.name);
  const band = priceBandFor(areasForType, key);
  const shortlistCount = areasForType.filter((a) => shortlistIds.has(a.id)).length;
  const bandHtml = band
    ? `<p class="ht-band"><span class="muted">Typical ${esc(key.replace('avg', '').toLowerCase())} price across these areas:</span> <strong class="num">${esc(gbp(band.min))} – ${esc(gbp(band.max))}</strong> <span class="muted">(median ${esc(gbp(band.median))}, n=${band.n})</span></p>`
    : (areasForType.length > 0 ? `<p class="ht-band muted">No price data yet across these areas.</p>` : '');
  const shortlistHtml = shortlistCount > 0
    ? `<p class="ht-shortlist"><strong class="num">${shortlistCount}</strong> of your shortlisted areas feature this type.</p>`
    : '';

  return `
    <article class="card ht-card">
      ${imgHtml}
      <div class="ht-body">
        <header>
          <h3 class="ht-title">${esc(type.name)}${type.status === 'draft-no-sources' ? ' <span class="chip is-draft">Draft</span>' : ''}</h3>
          <p class="ht-era muted">${esc(type.era || '')}</p>
        </header>
        <p>${type.status === 'draft-no-sources'
          ? '<span class="muted">Awaiting type-specific research and licensed imagery per CLAUDE.md §7.</span>'
          : (esc(type.description) || '<span class="muted">Description being researched.</span>')}</p>
        ${bandHtml}
        ${shortlistHtml}
        ${features ? `<h4>Features</h4><ul class="mini-list">${features}</ul>` : ''}
        ${regions ? `<h4>Common in</h4><ul class="ht-regions">${regions}</ul>` : ''}
        ${linksHtml}
      </div>
    </article>
  `;
}

async function init() {
  try {
    const types = await getHouseTypes();
    const areas = await getAreas();
    const shortlistIds = new Set(getShortlist());
    $('ht-count').textContent = types.length;

    const areasByType = {};
    areas.forEach((a) => {
      (a.houseTypeIds || []).forEach((tid) => {
        areasByType[tid] = areasByType[tid] || [];
        areasByType[tid].push(a);
      });
    });

    const grid = $('ht-grid');
    grid.innerHTML = types.map((t) => renderCard(t, areasByType[t.id] || [], shortlistIds)).join('');
  } catch (e) {
    console.error('house-types init error', e);
    $('ht-grid').innerHTML = '<p class="muted">Failed to load house types.</p>';
  }
}

init();
