// tests/unit/area-completeness.test.js — ONE completeness rule, browser-reachable (Phase 6.4).
// Pins the completeness()/deriveStatus() behaviour grid at its new home
// (assets/js/areas/completeness.js), the tools re-export identity (area-fields.mjs
// serves the SAME functions, so the research tooling and the page can never disagree),
// and the researchStatusLine() cue contract the area-detail page renders.
import { readFileSync } from 'node:fs';
import {
  CONTENT_FIELDS, completeness, deriveStatus, researchStatusLine,
} from '../../assets/js/areas/completeness.js';
import * as toolFields from '../../tools/area-fields.mjs';

const FULL = {
  overview: 'A village.', character: 'Quiet.',
  amenities: ['shop'], schools: [{ name: 'X Primary' }],
  transport: { commutes: [{ to: 'Winchester' }] },
  prices: { avgSemi: 300000 },
  thingsToDo: ['walks'], placesToEat: ['pub'],
  pros: ['quiet'], cons: ['remote'], whoItSuits: 'Families',
  sources: ['https://example.org'],
};

export async function register({ test, assert, assertEqual }) {
  test('completeness: a fully populated record scores total/total, researched', () => {
    const c = completeness(FULL);
    assertEqual(c.filled, c.total);
    assertEqual(c.missing.length, 0);
    assertEqual(c.percent, 100);
    assertEqual(deriveStatus(c), 'researched');
  });

  test('completeness: missing/empty fields are counted and named (empty array counts as missing)', () => {
    const c = completeness({ ...FULL, schools: [], placesToEat: undefined });
    assertEqual(c.filled, c.total - 2);
    assertEqual(JSON.stringify(c.missing), JSON.stringify(['schools', 'placesToEat']));
    assertEqual(deriveStatus(c), 'partial');
  });

  test('completeness: an empty record scores 0, stub', () => {
    const c = completeness({});
    assertEqual(c.filled, 0);
    assertEqual(c.missing.length, CONTENT_FIELDS.length);
    assertEqual(deriveStatus(c), 'stub');
  });

  test('completeness: tools/area-fields.mjs re-exports the SAME functions (one home, two doors)', () => {
    assert(toolFields.completeness === completeness, 'completeness identity differs across the re-export');
    assert(toolFields.deriveStatus === deriveStatus, 'deriveStatus identity differs across the re-export');
    assert(toolFields.CONTENT_FIELDS === CONTENT_FIELDS, 'CONTENT_FIELDS identity differs across the re-export');
  });

  // ── the area-detail cue ──────────────────────────────────────────────────────
  test('research-status line: null for a complete dossier (no cue rendered)', () => {
    assertEqual(researchStatusLine(FULL), null);
  });

  test('research-status line: honest N-of-total for a partial dossier', () => {
    const line = researchStatusLine({ ...FULL, schools: [], placesToEat: undefined });
    assertEqual(line, `Research in progress — ${CONTENT_FIELDS.length - 2} of ${CONTENT_FIELDS.length} sections researched.`);
  });

  test('research-status line: a bare directory record says research has not started', () => {
    assertEqual(researchStatusLine({}), 'Not yet researched — every section below is a placeholder.');
    assertEqual(researchStatusLine(null), 'Not yet researched — every section below is a placeholder.');
  });

  // ── source rails ─────────────────────────────────────────────────────────────
  test('research-status: the page renders the shared line; no inline completeness copy returns', () => {
    const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
    const page = read('assets/js/page-area-detail.js');
    assert(/researchStatusLine/.test(page), 'page-area-detail does not use the shared researchStatusLine');
    assert(/areas\/completeness\.js/.test(page), 'page-area-detail does not import the shared module');
    const tool = read('tools/area-fields.mjs');
    assert(/assets\/js\/areas\/completeness\.js/.test(tool), 'area-fields.mjs no longer re-exports the shared module');
    assert(!/export function completeness/.test(tool), 'area-fields.mjs regrew an inline completeness()');
  });
}
