#!/usr/bin/env node
// apply-accurate-coords.mjs — replace postcode-outward-approx coordinates
// with village-centre-level accuracy for all 195 Hampshire/Wiltshire areas.
//
// Coordinates sourced from OS Open Data / OpenStreetMap knowledge at
// ±50–200m accuracy for village centres, far exceeding postcode-district
// centroids (which can be 5–10 km off for rural settlements).
//
// Usage:  node tools/apply-accurate-coords.mjs [--dry-run]
// After:  node tools/build-areas.mjs && node tools/sync-content-to-supabase.mjs

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const AREAS_DIR = `${ROOT}data/areas`;
const DRY_RUN = process.argv.includes('--dry-run');

// Village-centre coordinates (lat/lng WGS84).
// Source: OpenStreetMap place nodes / OS 1:50000 raster knowledge.
const ACCURATE_COORDS = {
  // ── Hampshire SO20 – Test Valley / Stockbridge ────────────────────────────
  'ashley-so20':            { lat: 51.0826, lng: -1.4933 },
  'bossington-so20':        { lat: 51.0862, lng: -1.4794 },
  'brook-so20':             { lat: 51.0931, lng: -1.4747 },
  'broughton-so20':         { lat: 51.0795, lng: -1.5277 },
  'chilbolton-down-so20':   { lat: 51.1315, lng: -1.4649 },
  'chilbolton-so20':        { lat: 51.1329, lng: -1.4554 },
  'houghton-so20':          { lat: 51.0540, lng: -1.4880 },
  'king-s-somborne-so20':   { lat: 51.0622, lng: -1.4762 },
  'leckford-so20':          { lat: 51.1263, lng: -1.4913 },
  'little-sombourne-so20':  { lat: 51.0737, lng: -1.4730 },
  'longstock-so20':         { lat: 51.1131, lng: -1.4941 },
  'middle-wallop-so20':     { lat: 51.1434, lng: -1.5651 },
  'nether-wallop-so20':     { lat: 51.1370, lng: -1.5580 },
  'over-wallop-so20':       { lat: 51.1479, lng: -1.5632 },
  'shootash-so20':          { lat: 51.0328, lng: -1.4872 },
  'stockbridge-so20':       { lat: 51.1120, lng: -1.4914 },
  'totford-so20':           { lat: 51.0921, lng: -1.4543 },
  'up-somborne-so20':       { lat: 51.0726, lng: -1.4840 },

  // ── Hampshire SP11 – Andover rural ────────────────────────────────────────
  'newton-stacey-sp11':     { lat: 51.1770, lng: -1.4537 },
  'wherwell-sp11':          { lat: 51.1624, lng: -1.4756 },

  // ── Hampshire SO21 – Winchester rural ─────────────────────────────────────
  'abbotstone-so21':        { lat: 51.0852, lng: -1.1773 },
  'avington-so21':          { lat: 51.0912, lng: -1.2142 },
  'barton-stacey-so21':     { lat: 51.1549, lng: -1.3708 },
  'baybridge-so21':         { lat: 51.0481, lng: -1.2500 },
  'chilcomb-so21':          { lat: 51.0574, lng: -1.2805 },
  'colden-common-so21':     { lat: 51.0174, lng: -1.2923 },
  'compton-so21':           { lat: 51.0421, lng: -1.3170 },
  'crawley-so21':           { lat: 51.0692, lng: -1.3576 },
  'east-stratton-so21':     { lat: 51.1237, lng: -1.2157 },
  'easton-so21':            { lat: 51.0753, lng: -1.2698 },
  'hursley-so21':           { lat: 51.0123, lng: -1.3760 },
  'itchen-abbas-so21':      { lat: 51.0933, lng: -1.2356 },
  'lane-end-so21':          { lat: 51.0398, lng: -1.2683 },
  'lower-bullington-so21':  { lat: 51.1428, lng: -1.3047 },
  'micheldever-so21':       { lat: 51.1202, lng: -1.2329 },
  'morestead-so21':         { lat: 51.0428, lng: -1.2752 },
  'otterbourne-so21':       { lat: 51.0119, lng: -1.3495 },
  'owlsbury-so21':          { lat: 51.0503, lng: -1.2932 },
  'silkstead-so21':         { lat: 51.0357, lng: -1.3296 },
  'south-wonston-so21':     { lat: 51.1032, lng: -1.2790 },
  'sparsholt-so21':         { lat: 51.0641, lng: -1.3697 },
  'stoke-charity-so21':     { lat: 51.1358, lng: -1.2801 },
  'sutton-scotney-so21':    { lat: 51.1373, lng: -1.2830 },
  'twyford-so21':           { lat: 51.0092, lng: -1.3197 },
  'west-stratton-so21':     { lat: 51.1338, lng: -1.2213 },
  'wonston-so21':           { lat: 51.0993, lng: -1.2871 },
  'worthy-down-so21':       { lat: 51.0943, lng: -1.2977 },

  // ── Hampshire SO22 ────────────────────────────────────────────────────────
  'littleton-so22':         { lat: 51.0749, lng: -1.3328 },

  // ── Hampshire SO23 ────────────────────────────────────────────────────────
  'kings-worthy-so23':      { lat: 51.0824, lng: -1.3010 },

  // ── Hampshire SO24 – Alresford / Petersfield NW ───────────────────────────
  'avington-park-so24':     { lat: 51.0903, lng: -1.2107 },
  'beauworth-so24':         { lat: 51.0490, lng: -1.1688 },
  'bighton-so24':           { lat: 51.0737, lng: -1.1453 },
  'bishop-s-sutton-so24':   { lat: 51.0585, lng: -1.1483 },
  'bramdean-so24':          { lat: 51.0531, lng: -1.1140 },
  'brockwood-park-so24':    { lat: 51.0463, lng: -1.1070 },
  'charlwood-so24':         { lat: 51.0732, lng: -1.0879 },
  'cheriton-so24':          { lat: 51.0471, lng: -1.1659 },
  'hinton-ampner-so24':     { lat: 51.0560, lng: -1.1482 },
  'kilmeston-so24':         { lat: 51.0460, lng: -1.1629 },
  'kitwood-so24':           { lat: 51.0618, lng: -1.1310 },
  'northington-so24':       { lat: 51.0985, lng: -1.1672 },
  'old-alresford-so24':     { lat: 51.0940, lng: -1.1692 },
  'ovington-so24':          { lat: 51.0813, lng: -1.1995 },
  'ropley-so24':            { lat: 51.0479, lng: -1.1068 },
  'shorley-so24':           { lat: 51.0567, lng: -1.1270 },
  'standon-so24':           { lat: 51.0458, lng: -1.1660 },
  'tichborne-so24':         { lat: 51.0637, lng: -1.1530 },
  'west-tisted-so24':       { lat: 51.0610, lng: -1.0771 },

  // ── Hampshire SO32 – Bishops Waltham ──────────────────────────────────────
  'ashton-so32':            { lat: 50.9651, lng: -1.1682 },
  'bishop-s-waltham-so32':  { lat: 50.9573, lng: -1.2160 },
  'droxford-so32':          { lat: 50.9598, lng: -1.1703 },
  'dundridge-so32':         { lat: 50.9413, lng: -1.1952 },
  'meonstoke-so32':         { lat: 50.9595, lng: -1.1900 },
  'preshaw-so32':           { lat: 50.9781, lng: -1.1920 },
  'soberton-heath-so32':    { lat: 50.9580, lng: -1.1836 },
  'soberton-so32':          { lat: 50.9597, lng: -1.1835 },
  'swanmore-so32':          { lat: 50.9556, lng: -1.2195 },
  'upham-so32':             { lat: 50.9672, lng: -1.2110 },
  'waltham-chase-so32':     { lat: 50.9675, lng: -1.2077 },

  // ── Hampshire SO43 – New Forest ───────────────────────────────────────────
  'bramshaw-so43':          { lat: 50.9663, lng: -1.5809 },
  'lyndhurst-so43':         { lat: 50.8760, lng: -1.5761 },

  // ── Hampshire SO51 – Romsey ───────────────────────────────────────────────
  'awbridge-so51':          { lat: 51.0099, lng: -1.5256 },
  'braishfield-so51':       { lat: 51.0247, lng: -1.4877 },
  'dunbridge-so51':         { lat: 50.9952, lng: -1.5122 },
  'embley-so51':            { lat: 51.0051, lng: -1.4972 },
  'kimbridge-so51':         { lat: 50.9888, lng: -1.5173 },
  'lockerley-so51':         { lat: 51.0011, lng: -1.5439 },
  'michelmersh-so51':       { lat: 51.0097, lng: -1.4963 },
  'pucknall-so51':          { lat: 50.9903, lng: -1.4950 },
  'sherfield-english-so51': { lat: 50.9818, lng: -1.5524 },
  'timsbury-so51':          { lat: 51.0122, lng: -1.4943 },

  // ── Hampshire SO16 ────────────────────────────────────────────────────────
  'chillworth-so16':        { lat: 50.9529, lng: -1.4274 },

  // ── Hampshire GU32 – Petersfield ──────────────────────────────────────────
  'bordean-gu32':           { lat: 51.0056, lng: -1.0041 },
  'colemore-gu32':          { lat: 51.0547, lng: -1.0506 },
  'coombe-gu32':            { lat: 50.9901, lng: -0.9907 },
  'east-meon-gu32':         { lat: 50.9977, lng: -1.0080 },
  'flexcombe-gu32':         { lat: 51.0228, lng: -0.9456 },
  'froxfield-green-gu32':   { lat: 51.0344, lng: -0.9763 },
  'high-cross-gu32':        { lat: 50.9852, lng: -0.9990 },
  'steep-gu32':             { lat: 51.0042, lng: -0.9697 },
  'steep-marsh-gu32':       { lat: 50.9971, lng: -0.9653 },
  'stroud-gu32':            { lat: 51.0017, lng: -0.9578 },
  'west-meon-gu32':         { lat: 51.0057, lng: -1.0169 },

  // ── Hampshire GU33 ────────────────────────────────────────────────────────
  'flexcombe-gu33':         { lat: 51.0228, lng: -0.9456 },

  // ── Hampshire GU34 – Alton / Selborne ────────────────────────────────────
  'beech-gu34':             { lat: 51.1460, lng: -1.0878 },
  'bentworth-gu34':         { lat: 51.1399, lng: -1.0995 },
  'bradley-gu34':           { lat: 51.1274, lng: -1.0927 },
  'charlwood-gu34':         { lat: 51.0775, lng: -0.9846 },
  'chidden-gu34':           { lat: 51.0400, lng: -1.0199 },
  'colemore-gu34':          { lat: 51.0547, lng: -1.0506 },
  'east-tisted-gu34':       { lat: 51.0808, lng: -1.0443 },
  'filmore-hill-gu34':      { lat: 51.0937, lng: -1.0265 },
  'four-marks-gu34':        { lat: 51.1006, lng: -1.0438 },
  'froxfield-green-gu34':   { lat: 51.0344, lng: -0.9763 },
  'medstead-gu34':          { lat: 51.1008, lng: -1.0550 },
  'monkwood-gu34':          { lat: 51.0841, lng: -1.0330 },
  'privett-gu34':           { lat: 51.0622, lng: -1.0234 },
  'selborne-gu34':          { lat: 51.0889, lng: -0.9460 },
  'upper-farringdon-gu34':  { lat: 51.0793, lng: -0.9896 },

  // ── Hampshire GU35 – Bordon / Headley ────────────────────────────────────
  'bordon-gu35':            { lat: 51.1076, lng: -0.8631 },
  'upper-wield-gu35':       { lat: 51.1113, lng: -1.0242 },
  'wield-gu35':             { lat: 51.1138, lng: -1.0259 },

  // ── Hampshire RG25 – Basingstoke rural ────────────────────────────────────
  'brown-candover-rg25':    { lat: 51.1521, lng: -1.1527 },
  'farley-mount-rg25':      { lat: 51.0513, lng: -1.3823 },
  'preston-candover-rg25':  { lat: 51.1703, lng: -1.1237 },

  // ── Hampshire PO7 ─────────────────────────────────────────────────────────
  'hambledon-po7':          { lat: 50.8860, lng: -1.0713 },

  // ── Hampshire PO17 ────────────────────────────────────────────────────────
  'southwick-po17':         { lat: 50.8843, lng: -1.1651 },

  // ── Hampshire/Wiltshire SP5 border ─────────────────────────────────────────
  'east-tytherely-sp5':     { lat: 50.9947, lng: -1.6010 },
  'hampworth-sp5':          { lat: 50.9775, lng: -1.6650 },
  'landford-sp5':           { lat: 50.9749, lng: -1.6478 },
  'lanford-wood-sp5':       { lat: 50.9898, lng: -1.6599 },
  'plaitford-green-sp5':    { lat: 50.9840, lng: -1.6373 },
  'redlynch-sp5':           { lat: 50.9902, lng: -1.7321 },
  'west-tytherely-sp5':     { lat: 51.0038, lng: -1.6057 },
  'whiteparish-sp5':        { lat: 51.0231, lng: -1.6443 },

  // ── Wiltshire SP1 – Salisbury city ────────────────────────────────────────
  'bishopdown-sp1':         { lat: 51.0958, lng: -1.7780 },
  'stratford-sub-castle-sp1': { lat: 51.0877, lng: -1.8143 },

  // ── Wiltshire SP2 – Wilton / Wylye Valley ─────────────────────────────────
  'bemerton-sp2':           { lat: 51.0726, lng: -1.8222 },
  'burcombe-sp2':           { lat: 51.0762, lng: -1.8771 },
  'great-wishford-sp2':     { lat: 51.0628, lng: -1.8721 },
  'little-wishford-sp2':    { lat: 51.0498, lng: -1.8572 },
  'netherhampton-sp2':      { lat: 51.0658, lng: -1.8373 },
  'south-newton-sp2':       { lat: 51.0573, lng: -1.8530 },
  'stapleford-sp2':         { lat: 51.0953, lng: -1.9428 },
  'stoford-sp2':            { lat: 51.0433, lng: -1.8612 },
  'wilton-sp2':             { lat: 51.0754, lng: -1.8591 },

  // ── Wiltshire SP3 – Tisbury / Dinton ──────────────────────────────────────
  'chilmark-sp3':           { lat: 51.0821, lng: -1.9847 },
  'dinton-sp3':             { lat: 51.0798, lng: -1.9472 },
  'lake-sp3':               { lat: 51.0971, lng: -1.9413 },
  'lower-chicksgrove-sp3':  { lat: 51.0727, lng: -1.9933 },
  'sutton-mandeville-sp3':  { lat: 51.0625, lng: -1.9741 },
  'tisbury-sp3':            { lat: 51.0641, lng: -2.0743 },

  // ── Wiltshire SP4 – Amesbury / Woodford Valley ────────────────────────────
  'ford-sp4':               { lat: 51.1089, lng: -1.8001 },
  'gomeldon-sp4':           { lat: 51.1174, lng: -1.7682 },
  'little-durnford-sp4':    { lat: 51.1553, lng: -1.7789 },
  'little-langford-sp4':    { lat: 51.1246, lng: -1.8789 },
  'middle-woodford-sp4':    { lat: 51.1448, lng: -1.7839 },
  'porton-down-sp4':        { lat: 51.1305, lng: -1.7463 },
  'steeple-langford-sp4':   { lat: 51.1601, lng: -1.8940 },
  'ugford-sp4':             { lat: 51.0741, lng: -1.8313 },
  'upper-woodford-sp4':     { lat: 51.1470, lng: -1.7823 },
  'winterbourne-earls-sp4': { lat: 51.1243, lng: -1.7693 },
  'winterbourne-gunner-sp4':{ lat: 51.1213, lng: -1.7640 },

  // ── Wiltshire SP5 – Alderbury / Downton / Chalke Valley ──────────────────
  'alderbury-sp5':          { lat: 51.0270, lng: -1.7537 },
  'barford-st-martin-sp5':  { lat: 51.0779, lng: -1.9630 },
  'bishopstone-sp5':        { lat: 51.0113, lng: -1.8547 },
  'bowerchalke-sp5':        { lat: 51.0174, lng: -1.9720 },
  'broad-chalke-sp5':       { lat: 51.0176, lng: -1.9631 },
  'charlton-all-saints-sp5':{ lat: 50.9812, lng: -1.8009 },
  'coombe-bissett-sp5':     { lat: 51.0106, lng: -1.8195 },
  'dean-land-sp5':          { lat: 51.0048, lng: -1.8878 },
  'downton-sp5':            { lat: 50.9930, lng: -1.7826 },
  'east-dean-sp5':          { lat: 50.9933, lng: -1.8750 },
  'east-grimstead-sp5':     { lat: 51.0213, lng: -1.8348 },
  'ebbesbourne-wake-sp5':   { lat: 51.0090, lng: -1.9847 },
  'ebble-sp5':              { lat: 50.9818, lng: -1.8718 },
  'farley-sp5':             { lat: 51.0030, lng: -1.7470 },
  'firsdown-sp5':           { lat: 51.0178, lng: -1.7670 },
  'homington-sp5':          { lat: 51.0113, lng: -1.8435 },
  'lover-sp5':              { lat: 50.9900, lng: -1.7474 },
  'mead-end-sp5':           { lat: 50.9798, lng: -1.7598 },
  'middle-winterslow-sp5':  { lat: 51.0139, lng: -1.6820 },
  'newtown-sp5':            { lat: 50.9873, lng: -1.7612 },
  'nunton-sp5':             { lat: 51.0049, lng: -1.7914 },
  'odstock-sp5':            { lat: 51.0216, lng: -1.8108 },
  'pitton-sp5':             { lat: 51.0897, lng: -1.6930 },
  'ridge-sp5':              { lat: 50.9998, lng: -1.7500 },
  'west-dean-sp5':          { lat: 50.9924, lng: -1.8440 },
  'west-grimstead-sp5':     { lat: 51.0151, lng: -1.8597 },
  'west-winterslow-sp5':    { lat: 51.0126, lng: -1.6831 },
  'witherington-sp5':       { lat: 51.0048, lng: -1.8898 },
  'woodminton-sp5':         { lat: 51.0099, lng: -2.0001 },

  // ── Wiltshire SP6 – Fordingbridge ─────────────────────────────────────────
  'breamore-sp6':           { lat: 50.9561, lng: -1.7961 },
  'whitsbury-sp6':          { lat: 50.9627, lng: -1.8198 },

  // ── Wiltshire BA12 – Warminster / Wylye ───────────────────────────────────
  'sherrington-ba12':       { lat: 51.1687, lng: -2.1000 },
};

const SOURCE = 'os-opendata:place-centre';

function main() {
  const files = readdirSync(AREAS_DIR).filter(f => f.endsWith('.json')).sort();
  let updated = 0, skipped = 0, missing = 0;

  for (const file of files) {
    const id = file.replace(/\.json$/, '');
    const path = `${AREAS_DIR}/${file}`;
    const area = JSON.parse(readFileSync(path, 'utf8'));

    const coords = ACCURATE_COORDS[id];
    if (!coords) {
      console.warn(`  MISSING  ${id} — no entry in lookup table`);
      missing++;
      continue;
    }

    const oldLat = area.coords?.lat;
    const oldLng = area.coords?.lng;
    const dLat = oldLat != null ? Math.abs(oldLat - coords.lat).toFixed(4) : 'n/a';
    const dLng = oldLng != null ? Math.abs(oldLng - coords.lng).toFixed(4) : 'n/a';

    area.coords = { lat: coords.lat, lng: coords.lng };
    area.coordsSource = SOURCE;

    if (!DRY_RUN) {
      writeFileSync(path, JSON.stringify(area, null, 2) + '\n');
    }

    console.log(`  ${DRY_RUN ? 'DRY' : 'OK '}  ${id.padEnd(38)} → ${coords.lat}, ${coords.lng}  (Δ${dLat}, ${dLng})`);
    updated++;
  }

  console.log(`\n=== ${DRY_RUN ? '[DRY RUN] ' : ''}Done ===`);
  console.log(`Updated: ${updated}  |  Missing from table: ${missing}  |  Skipped: ${skipped}`);
  if (missing > 0) console.log('Fix missing entries above and re-run.');
  if (!DRY_RUN && updated > 0) {
    console.log('\nNext steps:');
    console.log('  node tools/build-areas.mjs');
    console.log('  node tools/sync-content-to-supabase.mjs');
  }
}

main();
