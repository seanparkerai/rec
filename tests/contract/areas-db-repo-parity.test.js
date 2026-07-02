// areas-db-repo-parity.test.js — DB ⇄ repo coordinate-parity guard (Phase-2 lock-in).
//
// The Supabase `areas` mirror is the SOURCE OF TRUTH for area records (CLAUDE.md §18.5,
// relaxed for `areas`), and data/areas/<id>.json is a materialised view written by
// tools/sync-areas-from-supabase.mjs. That tool also writes a compact snapshot of what
// it pulled to data/snapshots/areas.json ({id,name,postcode,coords,coordsSource,active}).
//
// This test asserts — OFFLINE, against the committed snapshot — that every per-area file
// still matches the DB it was materialised from on the four coordinate-truth fields the
// run aligned: id, coords, coordsSource, postcode. If anyone hand-edits a per-area file
// (or the index) without going through the DB → sync path, the file diverges from the
// snapshot and THIS test fails in CI — which is exactly the drift the Phase-2 run closed.
//
// The snapshot's own fidelity to the LIVE DB is an ONLINE concern: it is guaranteed at
// sync time and re-checked by the freshness pass (CLAUDE.md §18.2/§18.3, run via the
// Supabase MCP connector at session start/end). Like the supabase-sync suite, the live
// comparison is reported as skipped here rather than run, because no DB connection
// exists in the Node harness. Node-only; wired into tools/run-intelligence-tests.mjs.

const EPS = 1e-9; // coords are the same JSON round-trip on both sides; allow float dust only.

function coordsEqual(a, b) {
  if (a == null || b == null) return a === b;
  return Math.abs(Number(a.lat) - Number(b.lat)) <= EPS
      && Math.abs(Number(a.lng) - Number(b.lng)) <= EPS;
}

export async function register({ test, assert, assertEqual }) {
  const { readFileSync, readdirSync, existsSync } = await import('node:fs');
  const { join, dirname } = await import('node:path');
  const { fileURLToPath } = await import('node:url');

  const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
  const readJson = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));

  const snapPath = 'data/snapshots/areas.json';

  test('areas-parity: DB snapshot (data/snapshots/areas.json) exists and is a non-empty array', () => {
    assert(existsSync(join(root, snapPath)), `${snapPath} missing — run tools/sync-areas-from-supabase.mjs`);
    const snap = readJson(snapPath);
    assert(Array.isArray(snap) && snap.length > 0, 'areas snapshot is empty');
  });

  // Phase 2: household-onboarding stubs (added_via='place-lookup', source
  // 'household-onboarding', active=false) are created at RUNTIME in the live DB and are
  // NOT materialised into the repo — they have no per-area file and are not in the
  // snapshot. Exclude them from the DB⇄repo comparison so a member-added stub can never
  // trip this curated-catalog parity gate (forward guard — a no-op until/unless a stub is
  // ever materialised, since curated areas carry no `source` key). The predicate is the
  // SHARED tools/area-fields.mjs export (Phase 6.3) — the same one the materialiser
  // filters by, so the gate and the skip rule cannot drift apart.
  const { isOnboardingStub } = await import('../../tools/area-fields.mjs');
  const snap = (existsSync(join(root, snapPath)) ? readJson(snapPath) : []).filter((r) => !isOnboardingStub(r));
  const snapById = new Map(snap.map((r) => [r.id, r]));
  const fileIds = readdirSync(join(root, 'data/areas'))
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.replace(/\.json$/, ''))
    .filter((id) => !isOnboardingStub(readJson(`data/areas/${id}.json`)));

  test('areas-parity: every per-area file id is backed by a DB snapshot row', () => {
    const orphanFiles = fileIds.filter((id) => !snapById.has(id));
    assert(orphanFiles.length === 0,
      `per-area files with no DB row (hand-added or stale after a migration?): ${orphanFiles.join(', ')}`);
  });

  test('areas-parity: every DB snapshot row has a per-area file', () => {
    const fileSet = new Set(fileIds);
    const missing = snap.filter((r) => !fileSet.has(r.id)).map((r) => r.id);
    assert(missing.length === 0, `DB rows with no data/areas/<id>.json (run the materialiser): ${missing.join(', ')}`);
  });

  test('areas-parity: id/postcode/coords/coordsSource of each file == its DB snapshot row', () => {
    const drift = [];
    for (const id of fileIds) {
      const row = snapById.get(id);
      if (!row) continue; // reported by the orphan test above
      const f = readJson(`data/areas/${id}.json`);
      const reasons = [];
      if (f.id !== row.id) reasons.push(`id ${f.id}!=${row.id}`);
      if ((f.postcode ?? null) !== (row.postcode ?? null)) reasons.push(`postcode ${f.postcode}!=${row.postcode}`);
      if (!coordsEqual(f.coords ?? null, row.coords ?? null)) {
        reasons.push(`coords ${JSON.stringify(f.coords)}!=${JSON.stringify(row.coords)}`);
      }
      if ((f.coordsSource ?? null) !== (row.coordsSource ?? null)) reasons.push('coordsSource');
      if (reasons.length) drift.push(`${id} [${reasons.join('; ')}]`);
    }
    assert(drift.length === 0, `repo ⇄ DB drift on ${drift.length} area(s): ${drift.slice(0, 8).join(' · ')}`);
  });

  test('areas-parity: active flag of each file == its DB snapshot row (scope-integrity gate)', () => {
    // This catches the failure mode: DB sets active=false but sync-areas-from-supabase
    // hasn't been run, so the per-area file still has active=true and the scraper
    // (fetch-listings.mjs:111, `if (a.active === false) continue`) would include it.
    const drift = [];
    for (const id of fileIds) {
      const row = snapById.get(id);
      if (!row) continue;
      const f = readJson(`data/areas/${id}.json`);
      const fileActive = f.active ?? true;   // default-active matches scraper semantics
      const snapActive = row.active ?? true;
      if (fileActive !== snapActive) drift.push(`${id} [file=${fileActive} snap=${snapActive}]`);
    }
    assert(drift.length === 0,
      `active-flag drift on ${drift.length} area(s) — run tools/sync-areas-from-supabase.mjs: ${drift.join(', ')}`);
  });

  test('areas-parity: every ACTIVE area has map-usable coords (lat+lng present)', () => {
    const bad = [];
    for (const row of snap) {
      if (row.active === false) continue;
      const f = existsSync(join(root, `data/areas/${row.id}.json`)) ? readJson(`data/areas/${row.id}.json`) : null;
      const c = f?.coords;
      if (!c || c.lat == null || c.lng == null) bad.push(row.id);
    }
    assert(bad.length === 0, `active areas missing coords: ${bad.join(', ')}`);
  });

  // ONLINE: snapshot vs live DB — guaranteed at sync time, re-checked via MCP at
  // session start/end (CLAUDE.md §18.2/§18.3). Reported skipped (no DB in the harness).
  test('areas-parity: snapshot == live Supabase areas [skipped — online, via MCP freshness]', () => {
    assert(true);
  });
}
