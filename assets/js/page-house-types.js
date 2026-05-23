// page-house-types.js — gallery of characteristic house types found in Hampshire & Wiltshire.
// Cross-references to data/areas.json (via houseTypeIds on each area) once areas are tagged.
import { getHouseTypes, getAreas } from './storage.js';
import { url } from './config.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

const $ = (id) => document.getElementById(id);

function renderCard(type, areasForType) {
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

  return `
    <article class="card ht-card">
      ${imgHtml}
      <div class="ht-body">
        <header>
          <h3 class="ht-title">${esc(type.name)}</h3>
          <p class="ht-era muted">${esc(type.era || '')}</p>
        </header>
        <p>${esc(type.description) || '<span class="muted">Description being researched.</span>'}</p>
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
    $('ht-count').textContent = types.length;

    // Build map: houseTypeId -> [area, area, ...] (areas that reference this type)
    const areasByType = {};
    areas.forEach((a) => {
      (a.houseTypeIds || []).forEach((tid) => {
        areasByType[tid] = areasByType[tid] || [];
        areasByType[tid].push(a);
      });
    });

    const grid = $('ht-grid');
    grid.innerHTML = types.map((t) => renderCard(t, areasByType[t.id] || [])).join('');
  } catch (e) {
    console.error('house-types init error', e);
    $('ht-grid').innerHTML = '<p class="muted">Failed to load house types.</p>';
  }
}

init();
