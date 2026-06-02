// migrate-areas.mjs — one-shot migration to split data/areas.json into:
//   - data/areas.json           lightweight directory index (one entry per area)
//   - data/areas/<id>.json      full per-area detail record
//
// Also imports any ```json blocks in docs/Areadetails.md and merges their
// content into the matching per-area files (markdown content wins for the
// fields it provides; directory metadata like coords is preserved).
//
// Idempotent: safe to rerun. Writes only when content actually changes.
//
// Usage:  node tools/migrate-areas.mjs [--dry] [--source docs/Areadetails.md]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { INDEX_FIELDS, DETAIL_FIELDS, completeness, deriveStatus } from './area-fields.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const AREAS_JSON = path.join(ROOT, 'data', 'areas.json');
const AREAS_DIR  = path.join(ROOT, 'data', 'areas');
const DEFAULT_MD = path.join(ROOT, 'docs', 'Areadetails.md');

const args = process.argv.slice(2);
const DRY = args.includes('--dry');
const sourceIdx = args.indexOf('--source');
const SOURCE_MD = sourceIdx >= 0 ? path.resolve(args[sourceIdx + 1]) : DEFAULT_MD;

function readJSON(p)  { return JSON.parse(fs.readFileSync(p, 'utf8')); }
function writeJSON(p, v) {
  const next = JSON.stringify(v, null, 2) + '\n';
  if (fs.existsSync(p) && fs.readFileSync(p, 'utf8') === next) return false;
  if (!DRY) fs.writeFileSync(p, next);
  return true;
}

function pick(obj, keys) {
  const out = {};
  for (const k of keys) if (k in obj) out[k] = obj[k];
  return out;
}

// Merge `incoming` on top of `base`. Rule:
//   - null / undefined incoming values: keep base.
//   - non-empty incoming values: take incoming (deep-merge plain objects).
//   - empty incoming values (empty string / array / object): take incoming only
//     if base[k] is also empty/missing — i.e. don't let an empty value clobber
//     real content. Empty defaults are still useful when base has nothing.
const isEmpty = (v) => v == null
  || (typeof v === 'string' && v.trim() === '')
  || (Array.isArray(v) && v.length === 0)
  || (typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0);

function mergeArea(base, incoming) {
  const merged = { ...base };
  for (const [k, v] of Object.entries(incoming)) {
    if (v === null || v === undefined) continue;
    if (typeof v === 'object' && !Array.isArray(v)) {
      merged[k] = { ...(base[k] || {}), ...v };
      continue;
    }
    if (isEmpty(v) && !isEmpty(base[k])) continue;
    merged[k] = v;
  }
  return merged;
}

function parseMarkdownBlocks(text) {
  const out = [];
  const re = /```json\s*([\s\S]*?)```/g;
  let m;
  while ((m = re.exec(text))) {
    try {
      const obj = JSON.parse(m[1]);
      if (obj && typeof obj === 'object' && typeof obj.id === 'string') out.push(obj);
    } catch (e) {
      console.warn(`! Failed to parse JSON block near offset ${m.index}: ${e.message}`);
    }
  }
  return out;
}

// ---- main ----

const directory = readJSON(AREAS_JSON);
if (!Array.isArray(directory)) throw new Error('data/areas.json must be an array');

const byId = new Map(directory.map((a) => [a.id, a]));
const incomingById = new Map();

if (fs.existsSync(SOURCE_MD)) {
  const blocks = parseMarkdownBlocks(fs.readFileSync(SOURCE_MD, 'utf8'));
  for (const b of blocks) incomingById.set(b.id, b);
  console.log(`Parsed ${blocks.length} JSON blocks from ${path.relative(ROOT, SOURCE_MD)}`);
} else {
  console.log(`No markdown source at ${path.relative(ROOT, SOURCE_MD)} — splitting directory only.`);
}

// For markdown blocks without a matching directory id: synthesise a minimal
// directory stub from whatever fields the block provides, so the researched
// content is not lost. Flag clearly so the user can backfill coords/hubCity.
const adopted = [];
for (const [id, block] of incomingById) {
  if (byId.has(id)) continue;
  const stub = {
    id,
    name: block.name || id.replace(/-[a-z]{2}\d+.*$/, '').replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    village: block.village || '',
    town: block.town || '',
    county: block.county || '',
    postcode: (id.match(/-([a-z]{2}\d+)/) || [, ''])[1].toUpperCase(),
    hubCity: '', regionDir: '', settlementType: '', subRegion: '',
    coords: null, coordsSource: 'unset',
    houseTypeIds: [], status: 'drafted',
  };
  directory.push(stub);
  byId.set(id, stub);
  adopted.push(id);
}
if (adopted.length) {
  console.warn(`! Adopted ${adopted.length} markdown-only ids into directory (review metadata): ${adopted.join(', ')}`);
}

if (!DRY) fs.mkdirSync(AREAS_DIR, { recursive: true });

let detailWrites = 0;
const newIndex = [];

for (const stub of directory) {
  // Idempotent merge order (lowest → highest precedence):
  //   1. existing per-area detail file (preserves prior runs / hand-edits)
  //   2. directory stub (carries authoritative metadata: coords, hubCity…)
  //   3. markdown block (latest researched content wins)
  const detailPath = path.join(AREAS_DIR, `${stub.id}.json`);
  const existing = fs.existsSync(detailPath) ? readJSON(detailPath) : {};
  const incoming = incomingById.get(stub.id);
  let full = mergeArea(existing, stub);
  if (incoming) full = mergeArea(full, incoming);

  // Compute/refresh status from completeness, but never downgrade an
  // explicit "researched" coming from the markdown.
  const c = completeness(full);
  if (!incoming || full.status !== 'researched') {
    if (stub.status === 'directory' && c.filled === 0) {
      full.status = 'directory';
    } else {
      full.status = deriveStatus(c);
    }
  }

  // Restrict the saved detail file to known fields (drops accidental extras).
  const detail = pick(full, DETAIL_FIELDS);
  if (writeJSON(detailPath, detail)) detailWrites += 1;

  newIndex.push(pick(full, INDEX_FIELDS));
}

const indexChanged = writeJSON(AREAS_JSON, newIndex);

console.log(`Wrote ${detailWrites} per-area files to data/areas/ (of ${directory.length})`);
console.log(`Index ${indexChanged ? 'updated' : 'unchanged'}: data/areas.json (${newIndex.length} entries)`);
if (DRY) console.log('(dry run — no files written)');
