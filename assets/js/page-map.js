// page-map.js — Leaflet + Geoman interactive map.
// Renders OSM tiles, drops markers for areas with coords, exposes draw/edit/delete tools, persists
// any drawn shapes as GeoJSON in localStorage via storage.getDrawnZones / saveDrawnZones.
// Leaflet & Geoman are loaded via <script> tags in pages/areas.html, so we use window.L here.
import { getAreas, getShortlist, getDrawnZones, saveDrawnZones, getFinances, getCriteria } from './storage.js';
import { url } from './config.js';
import { assessAffordability } from './affordability.js';
import { gbp } from './format.js';
import { esc, byId as $ } from './dom.js';

const HAMPS_WILTS_CENTRE = [51.05, -1.6];
const DEFAULT_ZOOM = 9;
const MILES_TO_M = 1609.344;        // statute miles → metres (Leaflet circle radius is in metres)
const DEFAULT_GEOFENCE_MI = 3;      // resolve-areas.mjs default; ≈ the 4.8 km attribution radius the fetcher uses

let map = null;
let drawLayer = null;
let geofenceLayer = null;           // the real per-area listings catchment (active areas only)

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
  addFullscreenControl();
  loadSavedZones();
  loadAreaMarkers();
  attachActions();
  wireGeofenceToggle();
}

// ---- Fullscreen control: expand the map card to fill the screen ----
// A custom Leaflet bar button (top-right) toggling the native Fullscreen API on
// the .map-card. invalidateSize() on fullscreenchange so Leaflet re-lays-out at
// the new size and no grey tiles linger.
function addFullscreenControl() {
  if (!map) return;
  const card = document.querySelector('.map-card');
  if (!card) return;

  const ctl = L.control({ position: 'topright' });
  let btn = null;
  ctl.onAdd = () => {
    const bar = L.DomUtil.create('div', 'leaflet-bar map-fullscreen');
    btn = L.DomUtil.create('a', 'map-fullscreen-btn', bar);
    btn.href = '#';
    btn.setAttribute('role', 'button');
    btn.setAttribute('aria-pressed', 'false');
    setBtnState(false);
    L.DomEvent.on(btn, 'click', (e) => {
      L.DomEvent.preventDefault(e);
      L.DomEvent.stopPropagation(e);
      toggleFullscreen();
    });
    L.DomEvent.disableClickPropagation(bar);
    return bar;
  };
  ctl.addTo(map);

  function setBtnState(active) {
    if (!btn) return;
    btn.textContent = active ? '⤧' : '⤢';
    btn.title = active ? 'Exit fullscreen' : 'Fullscreen map';
    btn.setAttribute('aria-label', active ? 'Exit fullscreen map' : 'Fullscreen map');
    btn.setAttribute('aria-pressed', String(active));
  }

  function toggleFullscreen() {
    if (document.fullscreenElement) {
      document.exitFullscreen?.();
    } else {
      card.requestFullscreen?.();
    }
  }

  document.addEventListener('fullscreenchange', () => {
    const active = document.fullscreenElement === card;
    setBtnState(active);
    // Let the layout settle, then ask Leaflet to recompute the canvas size.
    setTimeout(() => { if (map) map.invalidateSize(); }, 80);
  });
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

// Build the real listings catchment: a circle of each area's geofenceRadiusMi (default
// 3 mi) around its centre. This mirrors what the fetcher actually does — listings are
// attributed to the nearest ACTIVE area whose geofence they fall inside
// (tools/listings-normalise.mjs `withinGeofence`). Areas with `active:false` are pruned
// from the fetch (tools/fetch-listings.mjs), so they are NOT part of the catchment and
// are deliberately omitted here. Circles are non-interactive so clicks reach the markers
// on top, and overlaps compound into a denser fill — a readable picture of coverage.
function buildGeofenceLayer(areasWithCoords, shortlist) {
  const accent = getCSSVar('--accent') || '#2e7d5b';
  const layer = L.featureGroup();
  areasWithCoords.forEach((a) => {
    if (a.active === false) return; // pruned from the fetch → not in the catchment
    const miles = Number(a.geofenceRadiusMi) > 0 ? Number(a.geofenceRadiusMi) : DEFAULT_GEOFENCE_MI;
    const isShort = shortlist.has(a.id);
    L.circle([a.coords.lat, a.coords.lng], {
      radius: miles * MILES_TO_M,
      interactive: false,
      color: accent,
      weight: isShort ? 1.5 : 1,
      opacity: isShort ? 0.7 : 0.4,
      fillColor: accent,
      fillOpacity: isShort ? 0.12 : 0.06,
    }).addTo(layer);
  });
  return layer;
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

    const shortlist = new Set(await getShortlist());

    // Geofence catchment underlay — drawn before the markers so the dots sit on top.
    geofenceLayer = buildGeofenceLayer(withCoords, shortlist);
    const activeGeofences = withCoords.filter((a) => a.active !== false).length;
    if ($('toggle-geofences')?.checked ?? true) geofenceLayer.addTo(map);

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
        const dotClass = {
          comfortable:    'map-popup__fit-dot--comfortable',
          stretch:        'map-popup__fit-dot--stretch',
          tight:          'map-popup__fit-dot--tight',
          'out-of-reach': 'map-popup__fit-dot--out-of-reach',
        }[r.verdict] || '';
        fitHtml = `<div class="map-popup__fit">
          <span class="map-popup__fit-dot ${dotClass}"></span>
          <span class="map-popup__fit-label">Fit: <strong>${esc(r.verdict)}</strong> at ${esc(gbp(matched))}</span>
        </div>`;
      }
      const ctHtml = a.councilTaxBand
        ? `<div class="map-popup__ct">Council tax band <strong>${esc(a.councilTaxBand)}</strong></div>`
        : '';
      marker.bindPopup(`
        <strong>${esc(a.name)}</strong>${approx ? ' <span class="map-popup__approx">approx.</span>' : ''}<br />
        <span class="map-popup__place">${esc(a.town)} · ${esc(a.postcode)}</span>
        ${fitHtml}
        ${ctHtml}
        <div class="map-popup__link"><a href="${detailUrl}">View profile →</a></div>
      `);
      cluster.addLayer(marker);
    });
    cluster.addTo(map);
    // Fit to the catchment (circles extend ~3 mi beyond the edge markers) so the whole
    // working area is visible, falling back to the markers when geofences are empty.
    const fitTarget = geofenceLayer.getLayers().length
      ? geofenceLayer.getBounds().extend(cluster.getBounds())
      : cluster.getBounds();
    if (withCoords.length >= 3) map.fitBounds(fitTarget, { padding: [40, 40] });
    const approxCount = withCoords.filter((a) => a.coordsSource === 'postcode-outward-approx').length;
    const approxNote = approxCount ? ` <span class="muted">(${approxCount} at approximate postcode-area centroid; run <code>node tools/geocode-areas.mjs</code> for precise village locations.)</span>` : '';
    $('map-status').innerHTML = `Showing <strong>${withCoords.length}</strong> of <strong>${areas.length}</strong> areas; <strong>${activeGeofences}</strong> active geofences (listings catchment, ≈3 mi radius); ${shortlist.size} shortlisted.${approxNote}`;
  } catch (e) {
    console.error('marker load error', e);
  }
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

// Show/hide the geofence catchment underlay. Default on — the layer is what makes the
// map an accurate picture of where the fetcher is actually looking.
function wireGeofenceToggle() {
  const cb = $('toggle-geofences');
  if (!cb) return;
  cb.addEventListener('change', () => {
    if (!geofenceLayer || !map) return;
    if (cb.checked) geofenceLayer.addTo(map);
    else map.removeLayer(geofenceLayer);
  });
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
