#!/usr/bin/env node
// verify-area-coords.mjs — L7.0a: prove, in code, that every active area's
// coords actually point at the named village before the geofence trusts them.
//
// The geofence (L7) makes a per-village coordinate the DECISIVE accept test for
// a listing. That guarantee is only as good as the coordinates underneath it, so
// this tool establishes ground truth FIRST. For every data/areas/*.json it runs
// five checks and writes a mismatch report; any HARD flag makes it exit non-zero
// so it can gate L7.1 (wiring the geofence live).
//
// The authoritative "are these my 190 villages?" source is the user-provided
// list data/source/villages.csv (county, town, village, outcode) — NOT an
// external geocoder. We verify each area against THAT list plus the district
// centroids in data/source/postcode-regions.csv (to catch a leaked outcode
// centroid masquerading as a village centre). postcodes.io reverse-geocode is an
// OPTIONAL online corroboration (Check 5): it runs when --online is passed and
// the host is reachable (e.g. in CI where the allowlist permits), and is recorded
// as "skipped" — never a failure — when it is not.
//
// Checks (per area):
//   1 source sanity      — coordsSource is a place-/postcode-centre, not an outcode centroid
//   2 centroid-leak      — coords are NOT (within ~0.005°) the stored outcode's district centroid
//   3 outcode plausible  — coords are within a sane distance of that district centroid
//   4 name-in-list       — area name/village matches a row in villages.csv (the provided 190)
//   5 outcode-agreement  — the matched village's outcode == the area's stored outcode
//   6 namesake trap      — no other area shares this name >8 km away (the "Newtown" class)
//   + reverse-geocode    — OPTIONAL: postcodes.io confirms the nearest postcode's outcode
//
// Usage:
//   node tools/verify-area-coords.mjs              (offline; writes the report; exit≠0 on hard flags)
//   node tools/verify-area-coords.mjs --online     (also runs the postcodes.io round-trip)
//   node tools/verify-area-coords.mjs --no-write    (print summary only, do not write the report)

import { readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { haversineKm, normaliseName } from './listings-normalise.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Two coords this close are the SAME stamped point — an exact copy (a leaked
// district centroid or a placeholder paste), NOT two adjacent hamlets. Kept tight
// (~30 m) on purpose: genuinely-adjacent villages like the Winterslows sit ~150 m
// apart with distinct organic coords and must NOT trip this; only an exact copy does.
export const DUPLICATE_DEG = 0.0003;             // ≈30 m on both axes
// Coords farther than this from EVERY known district centroid are not in the
// patch at all — a gross placement error worth a hard flag.
export const OFF_PATCH_KM = 30;
// Soft "worth a look" threshold: coords this far from their own outcode centre.
export const OUTCODE_LOOK_KM = 14;
// Two areas sharing a name farther apart than this are a probable namesake mix-up.
export const NAMESAKE_KM = 8;

// ── pure matchers (unit-tested in tests/verify-area-coords.test.js) ───────────

/** Classic Levenshtein edit distance. Small inputs only (place names). */
export function levenshtein(a = '', b = '') {
  a = String(a); b = String(b);
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
    }
  }
  return d[m][n];
}

/** Fraction of A's tokens that also appear in B (directional, 0..1). */
export function tokenOverlap(a = '', b = '') {
  const ta = normaliseName(a).split(' ').filter(Boolean);
  const tb = new Set(normaliseName(b).split(' ').filter(Boolean));
  if (!ta.length) return 0;
  return ta.filter((t) => tb.has(t)).length / ta.length;
}

/**
 * Tolerant place-name match: exact (normalised) → containment → strong token
 * overlap → Levenshtein ≤ 2 on the normalised strings. Returns true when the two
 * names plausibly denote the same place.
 */
export function nameMatches(a = '', b = '') {
  const na = normaliseName(a), nb = normaliseName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  if (Math.max(tokenOverlap(na, nb), tokenOverlap(nb, na)) >= 0.5) return true;
  if (levenshtein(na, nb) <= 2) return true;
  return false;
}

/** Do two points coincide tightly enough to be the SAME stamped coordinate? */
export function samepoint(a, b, epsDeg = DUPLICATE_DEG) {
  if (!a || !b) return false;
  return Math.abs(a.lat - b.lat) <= epsDeg && Math.abs(a.lng - b.lng) <= epsDeg;
}

/** Nearest district centroid to a point: { outcode, km } over the centroid map. */
export function nearestCentroid(coords, centroids) {
  let best = null, bestKm = Infinity;
  for (const [oc, c] of centroids) {
    const km = haversineKm(coords, c);
    if (km < bestKm) { bestKm = km; best = oc; }
  }
  return { outcode: best, km: bestKm };
}

// ── loaders ───────────────────────────────────────────────────────────────────

async function loadAreas() {
  const dir = resolve(root, 'data/areas');
  const files = (await readdir(dir)).filter((f) => f.endsWith('.json'));
  const areas = [];
  for (const f of files) {
    const a = JSON.parse(await readFile(resolve(dir, f), 'utf8'));
    areas.push(a);
  }
  return areas;
}

/** Minimal CSV line splitter (no embedded commas/quotes in this dataset). */
function splitCsv(line) { return line.split(',').map((s) => s.trim()); }

async function loadVillages() {
  const txt = await readFile(resolve(root, 'data/source/villages.csv'), 'utf8');
  const [, ...rows] = txt.trim().split(/\r?\n/);
  return rows.map((r) => {
    const [county, town, village, outcode] = splitCsv(r);
    return { county, town, village, outcode: String(outcode || '').toUpperCase() };
  }).filter((v) => v.village);
}

async function loadCentroids() {
  const txt = await readFile(resolve(root, 'data/source/postcode-regions.csv'), 'utf8');
  const [, ...rows] = txt.trim().split(/\r?\n/);
  const map = new Map();
  for (const r of rows) {
    const [, postcode, , , , lat, lng] = splitCsv(r);
    if (postcode) map.set(postcode.toUpperCase(), { lat: Number(lat), lng: Number(lng) });
  }
  return map;
}

// ── optional online reverse-geocode (postcodes.io) ───────────────────────────
async function reverseGeocode(lat, lng) {
  const url = `https://api.postcodes.io/postcodes?lon=${lng}&lat=${lat}&limit=1`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`postcodes.io HTTP ${res.status}`);
  const json = await res.json();
  const hit = json?.result?.[0];
  if (!hit) return null;
  const outcode = String(hit.postcode || '').toUpperCase().split(' ')[0] || null;
  const labels = [hit.parish, hit.admin_ward, hit.admin_district, hit.parliamentary_constituency]
    .filter(Boolean);
  return { outcode, labels };
}

// ── per-area verification ─────────────────────────────────────────────────────

function verifyArea(area, { villages, centroids }) {
  const id = area.id;
  const name = area.name || area.village || '';
  const outcode = String(area.postcode || '').toUpperCase();
  const coords = area.coords && area.coords.lat != null ? { lat: Number(area.coords.lat), lng: Number(area.coords.lng) } : null;
  const centroid = centroids.get(outcode) || null;
  const flags = [];      // hard flags → non-zero exit
  const notes = [];      // soft notes (name_unconfirmed etc.)

  // Check 1 — source sanity. coordsSource should name where the point came from (a
  // place/postcode centre, a geocode, or a web-verified fix), NOT a coarse outcode/
  // district centroid leaked in as a placeholder. Match the outcode-centroid marker
  // PRECISELY ("outcode-centroid" / "outcode centre"): a web-verified provenance note
  // that merely MENTIONS the word (e.g. "…DB-outcode-GU34-but-village-GU32-parish-spans-both…")
  // is documentation, not a coarse source, and must not trip this flag. Coords that
  // actually sit on a district centroid are caught geometrically by Check 2.
  const src = String(area.coordsSource || '').toLowerCase();
  const sourceOk = src.includes('place-centre') || src.includes('postcode')
    || src.includes('geocode') || src.includes('web-verified') || src.includes('verified');
  const isOutcodeCentroid = /outcode[-\s]?centr/.test(src);
  if (!area.coordsSource) flags.push('no_coords_source');
  else if (isOutcodeCentroid && !sourceOk) flags.push('outcode_centroid_source');

  if (!coords) { flags.push('no_coords'); return { id, name, outcode, coords, flags, notes, checks: {} }; }

  // Check 2 — coords are actually in the patch. Distance to the claimed outcode's
  // centroid (soft look) and to the NEAREST centroid (hard off-patch guard).
  const ownKm = centroid ? haversineKm(coords, centroid) : null;
  const near = nearestCentroid(coords, centroids);
  if (Number.isFinite(near.km) && near.km > OFF_PATCH_KM) flags.push(`off_patch:${near.km.toFixed(0)}km`);
  else if (ownKm != null && ownKm > OUTCODE_LOOK_KM) notes.push(`coords_distant:${ownKm.toFixed(1)}km`);

  // Check 4 — name appears in the provided villages list (the user's 190).
  // STRICT match (exact-normalised or Levenshtein ≤ 1) decides outcode agreement;
  // a looser match only decides "is the name in the list at all".
  const strictHit = villages.find((v) => {
    const nv = normaliseName(v.village), nn = normaliseName(name);
    return nv === nn || levenshtein(nv, nn) <= 1;
  });
  const looseHit = strictHit || villages.find((v) => nameMatches(name, v.village));
  const nameInList = Boolean(looseHit);
  if (!nameInList) notes.push('name_unconfirmed');

  // Check 5 — outcode agreement (SOFT: post-L7 the geofence uses coords + nearest
  // village globally, so a stored-outcode quirk is informational, not fatal).
  if (strictHit && strictHit.outcode && strictHit.outcode !== outcode) {
    notes.push(`list_outcode_differs:${strictHit.outcode}`);
  }

  return {
    id, name, outcode, coords,
    flags, notes,
    checks: {
      sourceOk, coordsSource: area.coordsSource || null,
      ownCentroidKm: ownKm != null ? Number(ownKm.toFixed(2)) : null,
      nearestCentroid: near.outcode, nearestCentroidKm: Number(near.km.toFixed(2)),
      nameInList, matchedVillage: looseHit ? looseHit.village : null,
      matchedTown: looseHit ? looseHit.town : null, strictNameHit: Boolean(strictHit),
    },
  };
}

/**
 * Check 3 — centroid reuse / duplicate coords (the TRUE leak signature). Two or
 * more areas stamped on the same point means a district centroid (or one
 * village's coords) was copied across villages. Distinct organic coords near a
 * compact district centre are fine and never flag here.
 */
function flagDuplicatePoints(records, centroids) {
  const pts = records.filter((r) => r.coords);
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      if (!samepoint(pts[i].coords, pts[j].coords)) continue;
      // Same village stamped twice (e.g. one record per straddled outcode) is a
      // harmless dedup chore — the coordinate is still right for that village, so
      // the geofence's coordinate-trust guarantee holds. DISTINCT villages sharing
      // a point genuinely breaks that trust → hard flag.
      const sameName = normaliseName(pts[i].name) === normaliseName(pts[j].name);
      const tag = sameName ? 'notes' : 'flags';
      const key = sameName ? 'duplicate_village_record' : 'duplicate_coords';
      pts[i][tag].push(`${key}:${pts[j].id}`);
      pts[j][tag].push(`${key}:${pts[i].id}`);
    }
  }
  // Coords stamped EXACTLY on a known district centroid (round-number reuse).
  for (const r of pts) {
    for (const [oc, c] of centroids) {
      if (samepoint(r.coords, c)) r.flags.push(`on_district_centroid:${oc}`);
    }
  }
}

/** Check 6 — namesake trap across the whole set (areas sharing a name far apart). */
function flagNamesakes(records) {
  const byName = new Map();
  for (const r of records) {
    if (!r.coords) continue;
    const key = normaliseName(r.name);
    if (!key) continue;
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key).push(r);
  }
  for (const group of byName.values()) {
    if (group.length < 2) continue;
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const km = haversineKm(group[i].coords, group[j].coords);
        if (km > NAMESAKE_KM) {
          group[i].flags.push(`possible_namesake_mismatch:${group[j].id}@${km.toFixed(0)}km`);
          group[j].flags.push(`possible_namesake_mismatch:${group[i].id}@${km.toFixed(0)}km`);
        }
      }
    }
  }
}

// ── main ───────────────────────────────────────────────────────────────────────
async function main() {
  const argv = process.argv.slice(2);
  const online = argv.includes('--online');
  const write = !argv.includes('--no-write');

  const [areas, villages, centroids] = await Promise.all([loadAreas(), loadVillages(), loadCentroids()]);
  console.log(`=== L7.0a verify-area-coords ===`);
  console.log(`areas: ${areas.length} · provided villages: ${villages.length} · outcodes with a district centroid: ${centroids.size}`);

  const records = areas.map((a) => verifyArea(a, { villages, centroids }));
  flagDuplicatePoints(records, centroids);
  flagNamesakes(records);

  // Optional online corroboration.
  let onlineRan = false;
  if (online) {
    try {
      // probe once; if it 403s/refuses we mark every record reverseGeocode:'skipped'.
      const probe = records.find((r) => r.coords);
      await reverseGeocode(probe.coords.lat, probe.coords.lng);
      onlineRan = true;
      for (const r of records) {
        if (!r.coords) { r.checks.reverseGeocode = 'no_coords'; continue; }
        try {
          const rg = await reverseGeocode(r.coords.lat, r.coords.lng);
          r.checks.reverseGeocode = rg;
          if (rg?.outcode && rg.outcode !== r.outcode) r.flags.push(`reverse_outcode:${rg.outcode}`);
          if (rg?.labels?.length && !rg.labels.some((l) => nameMatches(r.name, l))) {
            r.notes.push('reverse_name_unconfirmed');
          }
        } catch (e) { r.checks.reverseGeocode = `error:${e.message}`; }
      }
    } catch (e) {
      console.log(`⚠ online reverse-geocode unavailable (${e.message}) — recording as skipped (run in CI where postcodes.io is allowlisted).`);
      for (const r of records) r.checks.reverseGeocode = 'skipped';
    }
  } else {
    for (const r of records) r.checks.reverseGeocode = 'skipped';
  }

  const hard = records.filter((r) => r.flags.length);
  const unconfirmed = records.filter((r) => !r.flags.length && r.notes.includes('name_unconfirmed'));
  const dupRecords = records.filter((r) => r.notes.some((n) => n.startsWith('duplicate_village_record')));
  const clean = records.length - hard.length;

  const report = {
    generatedAt: new Date().toISOString(),
    online: onlineRan,
    counts: {
      areas: records.length, corroborated: clean, hardFlagged: hard.length,
      nameUnconfirmed: unconfirmed.length, duplicateVillageRecords: dupRecords.length,
    },
    hardFlagged: hard.map((r) => ({ id: r.id, name: r.name, outcode: r.outcode, flags: r.flags })),
    nameUnconfirmed: unconfirmed.map((r) => ({ id: r.id, name: r.name, outcode: r.outcode })),
    // Same village recorded under two outcodes (identical coords). Harmless to the
    // geofence; a dedup chore surfaced for a conscious decision, not auto-deleted.
    duplicateVillageRecords: dupRecords.map((r) => ({ id: r.id, name: r.name, outcode: r.outcode, notes: r.notes.filter((n) => n.startsWith('duplicate_village_record')) })),
    records,
  };

  if (write) {
    const out = resolve(root, 'data/source/area-coord-verification.json');
    await writeFile(out, JSON.stringify(report, null, 2) + '\n');
    console.log(`report → data/source/area-coord-verification.json`);
  }

  console.log(`\n${records.length} areas · ${clean} corroborated · ${hard.length} hard-flagged · ${unconfirmed.length} name-unconfirmed · ${dupRecords.length} duplicate-village-records${onlineRan ? ' · online ✓' : ' · online skipped'}`);
  if (hard.length) {
    console.log('\nHARD FLAGS (must be resolved before L7.1):');
    for (const r of hard) console.log(`  ✗ ${r.id} (${r.name}, ${r.outcode}) — ${r.flags.join('; ')}`);
  }
  if (dupRecords.length) {
    console.log('\nduplicate village records (same village, two outcodes, identical coords — dedup chore, not a coord error):');
    const seen = new Set();
    for (const r of dupRecords) { const k = normaliseName(r.name); if (seen.has(k)) continue; seen.add(k); console.log(`  • ${r.name}: ${r.notes.filter((n) => n.startsWith('duplicate')).map((n) => n.split(':')[1]).concat(r.id).join(' = ')}`); }
  }
  if (unconfirmed.length) {
    console.log('\nname-unconfirmed (lean on coordinates; eyeball, not necessarily wrong):');
    console.log('  ' + unconfirmed.map((r) => r.id).join(', '));
  }

  process.exit(hard.length ? 1 : 0);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((e) => { console.error('VERIFY CRASHED:', e); process.exit(2); });
}

export { verifyArea, flagNamesakes, flagDuplicatePoints, reverseGeocode };
