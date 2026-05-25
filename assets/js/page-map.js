// page-map.js — Leaflet + Geoman interactive map.
// Renders OSM tiles, drops markers for areas with coords, exposes draw/edit/delete tools, persists
// any drawn shapes as GeoJSON in localStorage via storage.getDrawnZones / saveDrawnZones.
// Leaflet & Geoman are loaded via <script> tags in pages/map.html, so we use window.L here.
import { getAreas, getShortlist, getDrawnZones, saveDrawnZones, getFinances, getCriteria } from './storage.js';
import { url } from './config.js';
import { assessAffordability } from './affordability.js';
import { gbp } from './format.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

const HAMPS_WILTS_CENTRE = [51.05, -1.6];
const DEFAULT_ZOOM = 9;

let map = null;
let drawLayer = null;

function init() {
  if (!window.L) {
    console.error('Leaflet not loaded');
    $('map-status').textContent = 'Failed to load map library.';
    return;
  }

  map = L.map('map', { preferCanvas: true, zoomControl: true }).setView(HAMPS_WILTS_CENTRE, DEFAULT_ZOOM);

  // Editorial basemap: CartoDB Positron (light) / Dark Matter (dark). Theme-aware.
  const dark = document.documentElement.dataset.theme === 'dark' ||
    (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);
  const tileUrl = dark
    ? 'https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png'
    : 'https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png';
  const labelUrl = dark
    ? 'https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png'
    : 'https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png';
  L.tileLayer(tileUrl, {
    maxZoom: 19,
    subdomains: 'abcd',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
  }).addTo(map);
  L.tileLayer(labelUrl, { maxZoom: 19, subdomains: 'abcd', pane: 'overlayPane' }).addTo(map);

  drawLayer = L.featureGroup().addTo(map);

  setupGeoman();
  loadSavedZones();
  loadAreaMarkers();
  loadShortlistPanel();
  attachActions();
  attachSheet();
}

function setupGeoman() {
  if (!map.pm) {
    console.warn('Geoman not loaded — draw tools unavailable');
    return;
  }
  map.pm.addControls({
    position: 'topleft',
    drawCircle: false,
    drawCircleMarker: false,
    drawText: false,
    drawMarker: false,
    drawPolyline: false,
    rotateMode: false,
    cutPolygon: false,
  });
  map.pm.setGlobalOptions({
    snappable: true,
    snapDistance: 20,
    pathOptions: { color: getCSSVar('--accent') || '#2e7d5b', fillOpacity: 0.15, weight: 2 },
  });

  map.on('pm:create', (e) => { drawLayer.addLayer(e.layer); persistZones(); });
  map.on('pm:remove', () => persistZones());
  drawLayer.on('pm:edit pm:dragend', () => persistZones());
}

function persistZones() {
  const fc = drawLayer.toGeoJSON();
  saveDrawnZones(fc);
  updateZoneCount();
}

function loadSavedZones() {
  const fc = getDrawnZones();
  if (!fc || !fc.features?.length) { updateZoneCount(); return; }
  L.geoJSON(fc, {
    onEachFeature: (_f, layer) => {
      drawLayer.addLayer(layer);
      if (layer.pm) layer.pm.enable({ allowSelfIntersection: false });
      if (layer.pm) layer.pm.disable(); // editable on user request only
    },
    style: { color: getCSSVar('--accent') || '#2e7d5b', fillOpacity: 0.15, weight: 2 },
  });
  updateZoneCount();
}

function updateZoneCount() {
  const fc = drawLayer.toGeoJSON();
  $('zone-count').textContent = fc.features?.length || 0;
}

// Phase 4c marker palette: status-based, shortlisted always wins.
function markerStyle(area, isShortlisted) {
  const accent = getCSSVar('--accent');
  const ink = getCSSVar('--ink');
  const paper = getCSSVar('--paper');
  if (isShortlisted) {
    return { radius: 8, color: accent, fillColor: accent, fillOpacity: 0.9, weight: 2 };
  }
  const status = area.status || 'directory';
  if (status === 'researched') {
    return { radius: 5, color: accent, fillColor: `color-mix(in oklch, ${accent} 60%, ${paper})`, fillOpacity: 0.85, weight: 1.5 };
  }
  if (status === 'partial' || status === 'drafted') {
    return { radius: 4, color: ink, fillColor: paper, fillOpacity: 0.9, weight: 1.5 };
  }
  // stub / directory
  return { radius: 3, color: getCSSVar('--ink-muted') || ink, fillColor: paper, fillOpacity: 0.7, weight: 1 };
}

function matchedPriceForMap(area, criteria) {
  const ps = area?.priceSummary;
  if (!ps) return null;
  const PROP_TO_KEY = {
    Detached: 'avgDetached', Bungalow: 'avgDetached',
    'Semi-detached': 'avgSemi', Terraced: 'avgTerraced', 'Flat / Apartment': 'avgFlat',
  };
  for (const t of (criteria?.propertyTypePrefs?.preferred || [])) {
    const k = PROP_TO_KEY[t];
    if (k && ps[k] != null) return ps[k];
  }
  for (const k of ['avgSemi', 'avgTerraced', 'avgDetached', 'avgFlat']) if (ps[k] != null) return ps[k];
  return null;
}

async function loadAreaMarkers() {
  try {
    const areas = await getAreas();
    let finances = null, criteria = null;
    try { finances = await getFinances(); } catch (_) {}
    try { criteria = await getCriteria(); } catch (_) {}

    const withCoords = areas.filter((a) => a.coords && typeof a.coords.lat === 'number' && typeof a.coords.lng === 'number');
    $('area-total').textContent = areas.length;
    $('area-mapped').textContent = withCoords.length;

    if (!withCoords.length) {
      $('map-status').innerHTML = `<strong>${areas.length}</strong> areas in directory; <strong>0</strong> with map coordinates yet. Markers will appear once geocoding runs.`;
      return;
    }

    const shortlist = new Set(getShortlist());
    const cluster = L.featureGroup();
    withCoords.forEach((a) => {
      const isShort = shortlist.has(a.id);
      const marker = L.circleMarker([a.coords.lat, a.coords.lng], markerStyle(a, isShort));
      const detailUrl = url('pages/area-detail.html') + `?id=${encodeURIComponent(a.id)}`;
      const approx = a.coordsSource === 'postcode-outward-approx';
      // Fit dot + council tax band in the popup.
      let fitHtml = '';
      const matched = matchedPriceForMap(a, criteria);
      if (finances && criteria && matched) {
        const r = assessAffordability({ price: matched, finances, criteria });
        const dotStyle = {
          comfortable:    'background: color-mix(in oklch, var(--accent) 80%, var(--paper));',
          stretch:        'background: color-mix(in oklch, var(--accent) 40%, var(--paper));',
          tight:          'background: color-mix(in oklch, var(--ink) 30%, var(--paper));',
          'out-of-reach': 'background: var(--paper); border: 1px solid var(--ink-muted);',
        }[r.verdict] || 'background: transparent; border: 1px dashed var(--ink-subtle);';
        fitHtml = `<div style="display:flex;align-items:center;gap:0.4rem;margin-top:0.35rem;font-size:var(--text-xs);">
          <span style="display:inline-block;width:0.6rem;height:0.6rem;border-radius:50%;${dotStyle}"></span>
          <span style="color:var(--ink-muted);">Fit: <strong style="color:var(--ink);">${esc(r.verdict)}</strong> at ${esc(gbp(matched))}</span>
        </div>`;
      }
      const ctHtml = a.councilTaxBand
        ? `<div style="font-size:var(--text-xs);color:var(--ink-muted);margin-top:0.25rem;">Council tax band <strong style="color:var(--ink);">${esc(a.councilTaxBand)}</strong></div>`
        : '';
      marker.bindPopup(`
        <strong>${esc(a.name)}</strong>${approx ? ' <span style="color:var(--ink-subtle);font-size:0.8em;">approx.</span>' : ''}<br />
        <span style="color:var(--ink-muted);font-size:var(--text-xs);">${esc(a.town)} · ${esc(a.postcode)}</span>
        ${fitHtml}
        ${ctHtml}
        <div style="margin-top:0.5rem;"><a href="${detailUrl}">View profile →</a></div>
      `);
      cluster.addLayer(marker);
    });
    cluster.addTo(map);
    if (withCoords.length >= 3) map.fitBounds(cluster.getBounds(), { padding: [40, 40] });
    addLegend();
    const approxCount = withCoords.filter((a) => a.coordsSource === 'postcode-outward-approx').length;
    const approxNote = approxCount ? ` <span class="muted">(${approxCount} at approximate postcode-area centroid; run <code>node tools/geocode-areas.mjs</code> for precise village locations.)</span>` : '';
    $('map-status').innerHTML = `Showing <strong>${withCoords.length}</strong> of <strong>${areas.length}</strong> areas; ${shortlist.size} shortlisted.${approxNote}`;
  } catch (e) {
    console.error('marker load error', e);
  }
}

let legendControl = null;
function addLegend() {
  if (legendControl || !map) return;
  legendControl = L.control({ position: 'bottomright' });
  legendControl.onAdd = () => {
    const div = L.DomUtil.create('div', 'map-legend');
    div.innerHTML = `
      <strong style="display:block;font-size:var(--text-xs);letter-spacing:0.06em;text-transform:uppercase;color:var(--ink-muted);margin-bottom:0.4rem;">Status</strong>
      <ul style="list-style:none;margin:0;padding:0;display:grid;gap:0.3rem;font-size:var(--text-xs);color:var(--ink);">
        <li><span class="legend-dot legend-dot--shortlisted"></span>Shortlisted</li>
        <li><span class="legend-dot legend-dot--researched"></span>Researched</li>
        <li><span class="legend-dot legend-dot--partial"></span>Partial</li>
        <li><span class="legend-dot legend-dot--stub"></span>Stub / directory</li>
      </ul>
    `;
    return div;
  };
  legendControl.addTo(map);
}

async function loadShortlistPanel() {
  try {
    const ids = new Set(getShortlist());
    const areas = await getAreas();
    const list = areas.filter((a) => ids.has(a.id));
    const panel = $('shortlist-panel');
    const countEl = $('sheet-count');
    if (countEl) countEl.textContent = `${list.length} ${list.length === 1 ? 'area' : 'areas'}`;
    if (!list.length) {
      panel.innerHTML = `<p style="color:var(--ink-muted);font-size:var(--text-sm);">No shortlisted areas yet. Star areas in the <a href="${url('pages/areas.html')}" style="color:var(--accent-ink);">directory</a>.</p>`;
      return;
    }
    panel.innerHTML = `<ol class="area-list" style="border-top:0;">${list.map((a, i) => `
      <li class="area-row" style="padding:var(--space-3) 0;grid-template-columns:2rem 1fr auto;">
        <span class="area-index">${String(i + 1).padStart(2, '0')}</span>
        <div>
          <p class="area-name" style="font-size:var(--text-base);">
            <a href="${url('pages/area-detail.html')}?id=${encodeURIComponent(a.id)}">${esc(a.name)}</a>
          </p>
          <p class="area-place">
            <span>${esc(a.town)}</span><span class="sep">·</span><span class="num">${esc(a.postcode)}</span>
          </p>
        </div>
      </li>
    `).join('')}</ol>`;
  } catch (e) { console.error('shortlist panel error', e); }
}

// ---- Bottom-sheet handle: cycle peek → mid → full on tap ----------
function attachSheet() {
  const sheet = $('map-side');
  const handle = $('sheet-handle');
  if (!sheet || !handle) return;
  const order = ['peek', 'mid', 'full'];
  const cycle = () => {
    const cur = sheet.dataset.detent || 'peek';
    const next = order[(order.indexOf(cur) + 1) % order.length];
    sheet.dataset.detent = next;
    handle.setAttribute('aria-expanded', String(next !== 'peek'));
    // Let Leaflet redraw after the CSS transition settles.
    setTimeout(() => { if (map) map.invalidateSize(); }, 360);
  };
  handle.addEventListener('click', cycle);
  // Tap on header (h2) also cycles for a generous touch target.
  sheet.querySelector('.sheet-head')?.addEventListener('click', (e) => {
    if (e.target.closest('a, button')) return;
    cycle();
  });
}

function attachActions() {
  $('btn-clear-zones').addEventListener('click', () => {
    if (!drawLayer.getLayers().length) return;
    if (!confirm('Delete all drawn zones?')) return;
    drawLayer.clearLayers();
    saveDrawnZones({ type: 'FeatureCollection', features: [] });
    updateZoneCount();
  });
  $('btn-recentre').addEventListener('click', () => map.setView(HAMPS_WILTS_CENTRE, DEFAULT_ZOOM));
}

function getCSSVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

// Wait for Leaflet to be ready (it's loaded as <script defer>) before initialising.
function whenReady(fn) {
  if (document.readyState === 'complete') fn();
  else window.addEventListener('load', fn, { once: true });
}
whenReady(init);
