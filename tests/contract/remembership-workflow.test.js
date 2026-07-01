// Contract (step 2.15): the re-membership sweep — the answer to the 2026-07-01
// log's weakness #5 (area add/disable/radius-tune silently staleified stored
// membership; there was NO trigger). Pins the workflow's load-bearing shape and
// the tool-side guarantee it leans on, so a future edit can't quietly break the
// sweep's correctness:
//   * fields refresh runs BEFORE the membership recompute (one coherent
//     universe snapshot feeds both writes);
//   * membership is written ONLY via the deriving RPC tool (no raw SQL path);
//   * the run fails red on the two data invariants (primary parity, no
//     feed-invisible listings);
//   * backfill-geofence's REST mode reads the canonical DB universe (stubs +
//     tuning) — a repo-edge sweep would flip stub-area listings to
//     geofence_pass=false and ignore learned radii.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const wf = () => readFileSync(join(ROOT, '.github/workflows/remembership.yml'), 'utf8');

export async function register({ test, assert }) {
  test('remembership: fields-first ordering + RPC-only membership writer', () => {
    const src = wf();
    const fields = src.indexOf('tools/backfill-geofence.mjs');
    const membership = src.indexOf('tools/backfill-listing-areas.mjs');
    assert(fields !== -1 && membership !== -1, 'sweep must run both canonical backfill tools');
    assert(fields < membership, 'geofence FIELDS must refresh before membership (fields first)');
    assert(!/TRUNCATE|INSERT INTO listing_areas/i.test(src),
      'the workflow must never write membership with raw SQL — the RPC tool is the only writer');
  });

  test('remembership: triggers, secret guard, and red-failing invariants', () => {
    const src = wf();
    for (const needle of [
      'workflow_dispatch', 'workflow_run', 'schedule',            // dispatch + after radius-tune + weekly
      'radius-tune',
      'ready=false',                                              // missing-secret no-op guard
      'la.area_id IS DISTINCT FROM l.area_id',                    // §18.3 primary parity
      'geofence_pass IS TRUE',                                    // feed-invisible check
      'RAISE EXCEPTION',                                          // invariants fail red
      'ON_ERROR_STOP=1',
    ]) assert(src.includes(needle), `remembership.yml must contain: ${needle}`);
  });

  test('remembership: backfill-geofence REST mode reads the canonical DB universe', () => {
    const src = readFileSync(join(ROOT, 'tools/backfill-geofence.mjs'), 'utf8');
    assert(/loadUniverseFromDb/.test(src),
      'backfill-geofence must use the DB universe edge (stubs + tuning) when the service key is present');
  });
}
