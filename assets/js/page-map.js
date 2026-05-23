// page-map.js — Leaflet + Geoman interactive map.
// Renders OSM tiles, drops markers for areas with coords, exposes draw/edit/delete tools, persists
// any drawn shapes as GeoJSON in localStorage via storage.getDrawnZones / saveDrawnZones.
// Leaflet & Geoman are loaded via <script> tags in pages/map.html, so we use window.L here.
import { getAreas, getShortlist, getDrawnZones, saveDrawnZones } from './storage.js';
import { url } from './config.js';

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

  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map);

  drawLayer = L.featureGroup().addTo(map);

  setupGeoman();
  loadSavedZones();
  loadAreaMarkers();
  loadShortlistPanel();
  attachActions();
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

async function loadAreaMarkers() {
  try {
    const areas = await getAreas();
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
      const marker = L.circleMarker([a.coords.lat, a.coords.lng], {
        radius: isShort ? 8 : 5,
        color: isShort ? getCSSVar('--accent') : getCSSVar('--pico-muted-color'),
        fillColor: isShort ? getCSSVar('--accent') : '#ffffff',
        fillOpacity: 0.85,
        weight: 1.5,
      });
      const detailUrl = url('pages/area-detail.html') + `?id=${encodeURIComponent(a.id)}`;
      const approx = a.coordsSource === 'postcode-outward-approx';
      marker.bindPopup(`
        <strong>${esc(a.name)}</strong>${approx ? ' <span style="color:#6b7280;font-size:0.85em;">(approx.)</span>' : ''}<br />
        <span style="color: #6b7280;">${esc(a.town)} · ${esc(a.postcode)}</span><br />
        <a href="${detailUrl}">View profile →</a>
      `);
      cluster.addLayer(marker);
    });
    cluster.addTo(map);
    if (withCoords.length >= 3) map.fitBounds(cluster.getBounds(), { padding: [40, 40] });
    const approxCount = withCoords.filter((a) => a.coordsSource === 'postcode-outward-approx').length;
    const approxNote = approxCount ? ` <span class="muted">(${approxCount} at approximate postcode-area centroid; run <code>node tools/geocode-areas.mjs</code> for precise village locations.)</span>` : '';
    $('map-status').innerHTML = `Showing <strong>${withCoords.length}</strong> of <strong>${areas.length}</strong> areas; ${shortlist.size} shortlisted.${approxNote}`;
  } catch (e) {
    console.error('marker load error', e);
  }
}

async function loadShortlistPanel() {
  try {
    const ids = new Set(getShortlist());
    const areas = await getAreas();
    const list = areas.filter((a) => ids.has(a.id));
    const panel = $('shortlist-panel');
    if (!list.length) {
      panel.innerHTML = `<p class="muted">No shortlisted areas yet. Star areas in the <a href="${url('pages/areas.html')}">directory</a>.</p>`;
      return;
    }
    panel.innerHTML = `<ul class="mini-list">${list.map((a) => `
      <li>
        <strong><a href="${url('pages/area-detail.html')}?id=${encodeURIComponent(a.id)}">${esc(a.name)}</a></strong>
        <span class="muted">· ${esc(a.town)} · ${esc(a.postcode)}</span>
      </li>
    `).join('')}</ul>`;
  } catch (e) { console.error('shortlist panel error', e); }
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
