// Contract (step 2.8): withinGeofence is the ONE decisive area matcher in the
// ingestion path. The retired matchers (matchListingToArea's 20 km nearest+token
// gate; the fetcher's assignArea) must never come back — this scans the tool
// sources for their names, the same way import-layer.test.js polices imports.
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');

export async function register({ test, assert }) {
  test('one matcher: no ingestion tool defines or calls the retired matchers', () => {
    const offenders = [];
    for (const f of readdirSync(join(ROOT, 'tools')).filter((n) => n.endsWith('.mjs'))) {
      const src = readFileSync(join(ROOT, 'tools', f), 'utf8')
        .split('\n').filter((l) => !/^\s*(\/\/|\*)/.test(l)).join('\n'); // ignore comments
      if (/matchListingToArea|assignArea/.test(src)) offenders.push(`tools/${f}`);
    }
    assert(offenders.length === 0, `retired matchers referenced in: ${offenders.join(', ')}`);
  });

  test('one matcher: every ingestion writer that stamps area_id imports withinGeofence', () => {
    for (const f of ['fetch-listings.mjs', 'import-apify-runs.mjs', 'backfill-geofence.mjs', 'backfill-listing-areas.mjs']) {
      const src = readFileSync(join(ROOT, 'tools', f), 'utf8');
      assert(/withinGeofence/.test(src), `${f} must go through withinGeofence`);
    }
  });
}
