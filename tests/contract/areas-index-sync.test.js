// areas-index-sync.test.js — areas source-of-truth guard (REFACTOR P6).
//
// data/areas.json is the lightweight DIRECTORY INDEX; data/areas/<id>.json are the
// full per-area records (the source of truth, CLAUDE.md §2). tools/build-areas.mjs
// builds the index from data/source/villages.csv, projecting INDEX_FIELDS. This test
// guards that the committed index stays a faithful projection and that the known,
// intentional 195-files / 191-index gap doesn't silently change.
//
// Node-only (reads repo files); wired into tools/run-intelligence-tests.mjs.

// Duplicate-Rightmove-ID / merged village variants that were removed from
// villages.csv (build's source) but whose researched per-area files remain on disk
// AND in the Supabase areas mirror (195 rows). They are intentionally EXCLUDED from
// the 191-entry directory index. flexcombe-gu33's research was merged into the
// canonical flexcombe-gu32; the others are duplicate-postcode variants of villages
// kept under a different postcode (e.g. colemore-gu34 stays, colemore-gu32 dropped).
const KNOWN_DEACTIVATED = ['charlwood-so24', 'colemore-gu32', 'flexcombe-gu33', 'froxfield-green-gu32'];

export async function register({ test, assert, assertEqual }) {
  const { readFileSync, readdirSync } = await import('node:fs');
  const { join, dirname } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const { INDEX_FIELDS } = await import('../../tools/area-fields.mjs');

  const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
  const readJson = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));

  const index = readJson('data/areas.json');
  const indexIds = index.map((a) => a.id);
  const fileIds = readdirSync(join(root, 'data/areas'))
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.replace(/\.json$/, ''));

  // Order-insensitive deep equality (the only build/disk difference is key order).
  const canon = (v) => {
    if (Array.isArray(v)) return v.map(canon);
    if (v && typeof v === 'object') {
      const o = {};
      for (const k of Object.keys(v).sort()) o[k] = canon(v[k]);
      return o;
    }
    return v;
  };
  const canonEq = (a, b) => JSON.stringify(canon(a)) === JSON.stringify(canon(b));
  const pick = (obj, keys) => { const o = {}; for (const k of keys) if (k in obj) o[k] = obj[k]; return o; };

  // villages.csv is build's source-of-truth list (mirrors build-areas.mjs parsing).
  const csvRows = readFileSync(join(root, 'data/source/villages.csv'), 'utf8')
    .trim().split(/\r?\n/).slice(1).map((l) => l.split(','));
  const csvVillages = csvRows.filter((r) => r.length >= 4 && r[2]); // [county, town, village, postcode]

  test('areas-index: every index entry has a backing per-area detail file', () => {
    const dangling = indexIds.filter((id) => !fileIds.includes(id));
    assert(dangling.length === 0, `index entries with no data/areas/<id>.json: ${dangling.join(', ')}`);
  });

  test('areas-index: index is a faithful INDEX_FIELDS projection of each detail file', () => {
    const mismatched = [];
    for (const entry of index) {
      const detail = readJson(`data/areas/${entry.id}.json`);
      if (!canonEq(entry, pick(detail, INDEX_FIELDS))) mismatched.push(entry.id);
    }
    assert(mismatched.length === 0,
      `index entry != INDEX_FIELDS projection of detail file: ${mismatched.slice(0, 10).join(', ')}`);
  });

  test('areas-index: index entries carry only INDEX_FIELDS keys (no detail-field leakage)', () => {
    const allowed = new Set(INDEX_FIELDS);
    const leaks = [];
    for (const entry of index) {
      const extra = Object.keys(entry).filter((k) => !allowed.has(k));
      if (extra.length) leaks.push(`${entry.id}: ${extra.join('/')}`);
    }
    assert(leaks.length === 0, `non-INDEX_FIELDS keys leaked into the index: ${leaks.slice(0, 5).join(' ; ')}`);
  });

  test('areas-index: index ids are unique', () => {
    assertEqual(new Set(indexIds).size, indexIds.length, 'duplicate ids in data/areas.json');
  });

  test('areas-index: index count == villages.csv village count (rebuild parity)', () => {
    assertEqual(index.length, csvVillages.length,
      `index has ${index.length} entries but villages.csv lists ${csvVillages.length} villages — run build-areas.mjs`);
  });

  test('areas-index: the files-vs-index gap is exactly the documented deactivated set', () => {
    const gap = fileIds.filter((id) => !indexIds.includes(id)).sort();
    assertEqual(gap.join(','), [...KNOWN_DEACTIVATED].sort().join(','),
      `unexpected non-indexed per-area files — a new orphan or a re-add? gap=[${gap.join(', ')}]`);
  });

  test('areas-index: each deactivated area is absent from villages.csv (will not be rebuilt)', () => {
    const stillInCsv = [];
    for (const id of KNOWN_DEACTIVATED) {
      const d = readJson(`data/areas/${id}.json`);
      const present = csvVillages.some((r) => (r[2] || '').trim() === (d.village || d.name) && (r[3] || '').trim() === d.postcode);
      if (present) stillInCsv.push(id);
    }
    assert(stillInCsv.length === 0,
      `deactivated areas still present in villages.csv (would be re-added on build): ${stillInCsv.join(', ')}`);
  });
}
