#!/usr/bin/env node
// run-intelligence-tests.mjs — runs the Phase 2 pure-JS tests in Node so the
// browser harness (tests/tests.html) isn't required in CI / remote envs.
// Mirrors the harness register(...) shape exactly.
// Also runs the Supabase sync test (tests/supabase-sync.test.js).
//
// Usage:  node tools/run-intelligence-tests.mjs

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { spawn } from 'node:child_process';

const __root = join(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (p) => JSON.parse(readFileSync(join(__root, p), 'utf8'));

const results = [];
async function test(name, fn) {
  try { await fn(); results.push({ name, pass: true }); }
  catch (e) { results.push({ name, pass: false, error: e?.message || String(e) }); }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }
function assertEqual(actual, expected, msg) {
  if (actual !== expected) {
    throw new Error(msg || `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

// Fixtures come from the single source (tests/fixtures.mjs, step 1.3).
const { getFixtures } = await import('../tests/fixtures.mjs');
const fixtures = await getFixtures();

const { register: registerFinanceDerive } = await import('../tests/unit/finance-derive.test.js');
const { register: registerAffordability } = await import('../tests/unit/affordability.test.js');
const { register: registerMoneyFlow }     = await import('../tests/unit/money-flow.test.js');
const { register: registerSavingsVelocity } = await import('../tests/unit/savings-velocity.test.js');
const { register: registerDepositRisk } = await import('../tests/unit/deposit-risk.test.js');
const { register: registerAffordabilityScenarios } = await import('../tests/unit/affordability-scenarios.test.js');
const { register: registerInvestmentPerformance } = await import('../tests/unit/investment-performance.test.js');
const { register: registerSavingsSeries } = await import('../tests/unit/savings-series.test.js');
const { register: registerOutreachTemplates } = await import('../tests/outreach-templates.test.js');
const { register: registerListingsNormalise } = await import('../tests/unit/listings-normalise.test.js');
const { register: registerListingsClassify } = await import('../tests/unit/listings-classify.test.js');
const { register: registerListingsSuppress } = await import('../tests/unit/listings-suppress.test.js');
const { register: registerListingsFeedSuppression } = await import('../tests/unit/listings-feed-suppression.test.js');
const { register: registerListingsFeedPartition } = await import('../tests/unit/listings-feed-partition.test.js');
const { register: registerRejectedView } = await import('../tests/unit/rejected-view.test.js');
const { register: registerListingsPickerState } = await import('../tests/unit/listings-picker-state.test.js');
const { register: registerPurgeListings } = await import('../tests/unit/purge-listings.test.js');
const { register: registerVerifyAreaCoords } = await import('../tests/verify-area-coords.test.js');
const { register: registerBackfillGeofence } = await import('../tests/unit/backfill-geofence.test.js');
const { register: registerListingAreas } = await import('../tests/unit/listing-areas.test.js');
const { register: registerResolveAreas } = await import('../tests/resolve-areas.test.js');
const { register: registerAreaMatch } = await import('../tests/area-match.test.js');
const { register: registerSetupWizard } = await import('../tests/setup-wizard.test.js');
const { register: registerListingFit } = await import('../tests/unit/listing-fit.test.js');
const { register: registerListingReactions } = await import('../tests/unit/listing-reactions.test.js');
const { register: registerListingFlags } = await import('../tests/unit/listing-flags.test.js');
const { register: registerLearnedPreferences } = await import('../tests/unit/learned-preferences.test.js');
const { register: registerFetchListings } = await import('../tests/unit/fetch-listings.test.js');
const { register: registerListingsFetchCtl } = await import('../tests/unit/listings-fetch.test.js');
const { register: registerMetaObservations } = await import('../tests/unit/meta-observations.test.js');
const { register: registerListingDetail } = await import('../tests/unit/listing-detail.test.js');
const { register: registerListingsControls } = await import('../tests/unit/listings-controls.test.js');
const { register: registerDomUtils }                 = await import('../tests/dom-utils.test.js');
const { register: registerCharacterizationHome }     = await import('../tests/characterization-home.test.js');
const { register: registerCharacterizationFinances } = await import('../tests/characterization/characterization-finances.test.js');
const { register: registerCharacterizationOutreach } = await import('../tests/characterization-outreach.test.js');
const { register: registerCharacterizationStorage }  = await import('../tests/characterization-storage.test.js');
const { register: registerCharacterizationFinancesCalc } = await import('../tests/characterization/characterization-finances-calc.test.js');
const { register: registerImportLayer } = await import('../tests/import-layer.test.js');
const { register: registerAreasIndexSync } = await import('../tests/areas-index-sync.test.js');
const { register: registerAreasDbRepoParity } = await import('../tests/areas-db-repo-parity.test.js');
const { register: registerListingsFormat } = await import('../tests/unit/listings-format.test.js');
const { register: registerListingsLabels } = await import('../tests/unit/listings-labels.test.js');
const { register: registerCriteriaForm } = await import('../tests/criteria-form.test.js');
const { register: registerAssetLinks } = await import('../tests/asset-links.test.js');
const { register: registerJourneyData } = await import('../tests/journey-data.test.js');
const { register: registerJourneyProgress } = await import('../tests/journey-progress.test.js');
const { register: registerRefinementEngine } = await import('../tests/unit/refinement-engine.test.js');
const { register: registerRefinementPersistence } = await import('../tests/unit/refinement-persistence.test.js');
const { register: registerRefinementView } = await import('../tests/unit/refinement-view.test.js');
const { register: registerRefinementObservations } = await import('../tests/unit/refinement-observations.test.js');
const { register: registerRefinementScope } = await import('../tests/unit/refinement-scope.test.js');
const { register: registerRefinementRadius } = await import('../tests/unit/refinement-radius.test.js');
const { register: registerReactionProvenance } = await import('../tests/unit/reaction-provenance.test.js');
const { register: registerTrendsGlance } = await import('../tests/unit/trends-glance.test.js');
const { register: registerSuggestionsModel } = await import('../tests/unit/suggestions-model.test.js');
const { register: registerSuggestionsApply } = await import('../tests/unit/suggestions-apply.test.js');
const { register: registerAreaRef } = await import('../tests/area-ref.test.js');
const { register: registerAreaEnrich } = await import('../tests/area-enrich.test.js');
const { register: registerDocsConsistency } = await import('../tests/docs-consistency.test.js');
const { register: registerAskTools } = await import('../tests/ask-tools.test.js');
const { register: registerAskStorage } = await import('../tests/ask-storage.test.js');
const { register: registerProfileSchema } = await import('../tests/profile-schema.test.js');
const { register: registerSavingsEdit } = await import('../tests/unit/savings-edit.test.js');
const { register: registerLiveFeedRuns } = await import('../tests/live-feed-runs.test.js');
const { register: registerLiveFeedStats } = await import('../tests/live-feed-stats.test.js');
const { runResponsiveLint } = await import('./lint-responsive.mjs');

await registerFinanceDerive({ test, assert, assertEqual, fixtures });
await registerAffordability({ test, assert, assertEqual, fixtures });
await registerMoneyFlow({ test, assert, assertEqual, fixtures });
await registerSavingsVelocity({ test, assert, assertEqual, fixtures });
await registerDepositRisk({ test, assert, assertEqual, fixtures });
await registerAffordabilityScenarios({ test, assert, assertEqual, fixtures });
await registerInvestmentPerformance({ test, assert, assertEqual, fixtures });
await registerSavingsSeries({ test, assert, assertEqual, fixtures });
await registerOutreachTemplates({ test, assert, assertEqual, fixtures });
await registerListingsNormalise({ test, assert, assertEqual, fixtures });
await registerListingsClassify({ test, assert, assertEqual });
await registerListingsSuppress({ test, assert, assertEqual });
await registerListingsFeedSuppression({ test, assert, assertEqual });
await registerListingsFeedPartition({ test, assert, assertEqual });
await registerRejectedView({ test, assert, assertEqual });
await registerListingsPickerState({ test, assert, assertEqual });
await registerPurgeListings({ test, assert, assertEqual });
await registerVerifyAreaCoords({ test, assert, assertEqual, fixtures });
await registerBackfillGeofence({ test, assert, assertEqual, fixtures });
await registerListingAreas({ test, assert, assertEqual, fixtures });
await registerResolveAreas({ test, assert, assertEqual, fixtures });
await registerListingFit({ test, assert, assertEqual, fixtures });
await registerListingReactions({ test, assert, assertEqual, fixtures });
await registerListingFlags({ test, assert, assertEqual });
await registerLearnedPreferences({ test, assert, assertEqual, fixtures });
await registerFetchListings({ test, assert, assertEqual, fixtures });
await registerListingsFetchCtl({ test, assert, assertEqual });
await registerMetaObservations({ test, assert, assertEqual, fixtures });
await registerListingDetail({ test, assert, assertEqual, fixtures });
await registerListingsControls({ test, assert, assertEqual });
await registerDomUtils({ test, assert, assertEqual });
await registerCharacterizationHome({ test, assert, assertEqual, fixtures });
await registerCharacterizationFinances({ test, assert, assertEqual, fixtures });
await registerCharacterizationOutreach({ test, assert, assertEqual });
await registerCharacterizationStorage({ test, assert, assertEqual });
await registerCharacterizationFinancesCalc({ test, assert, assertEqual });
await registerImportLayer({ test, assert, assertEqual });
await registerAreasIndexSync({ test, assert, assertEqual });
await registerAreasDbRepoParity({ test, assert, assertEqual });
await registerListingsFormat({ test, assert, assertEqual });
await registerListingsLabels({ test, assert, assertEqual });
await registerCriteriaForm({ test, assert, assertEqual });
await registerAssetLinks({ test, assert, assertEqual });
await registerJourneyData({ test, assert, assertEqual });
await registerJourneyProgress({ test, assert, assertEqual });
await registerRefinementEngine({ test, assert, assertEqual });
await registerRefinementPersistence({ test, assert, assertEqual });
await registerRefinementView({ test, assert, assertEqual });
await registerRefinementObservations({ test, assert, assertEqual });
await registerRefinementScope({ test, assert, assertEqual });
await registerRefinementRadius({ test, assert, assertEqual });
await registerReactionProvenance({ test, assert, assertEqual });
await registerTrendsGlance({ test, assert, assertEqual });
await registerSuggestionsModel({ test, assert, assertEqual });
await registerSuggestionsApply({ test, assert, assertEqual });
await registerAreaMatch({ test, assert, assertEqual });
await registerAreaRef({ test, assert, assertEqual });
await registerAreaEnrich({ test, assert, assertEqual });
await registerSetupWizard({ test, assert, assertEqual });
await registerDocsConsistency({ test, assert, assertEqual });
await registerAskTools({ test, assert, assertEqual, fixtures });
await registerAskStorage({ test, assert, assertEqual });
await registerProfileSchema({ test, assert, assertEqual });
await registerSavingsEdit({ test, assert, assertEqual });
await registerLiveFeedRuns({ test, assert, assertEqual });
await registerLiveFeedStats({ test, assert, assertEqual });

await test('responsive lint (no new violations vs baseline)', () => {
  const { regressions } = runResponsiveLint();
  assert(
    regressions.length === 0,
    `responsive lint regressions:\n${regressions.map((r) => `  ${r.fingerprint} (live ${r.live} > baseline ${r.baseline})`).join('\n')}`,
  );
});

// Run Supabase sync tests
async function runSyncTests() {
  return new Promise((resolve) => {
    const syncTestPath = join(__root, 'tests/supabase-sync.test.js');
    if (!existsSync(syncTestPath)) {
      console.log('ℹ️  sync tests not found, skipping');
      resolve(0); // don't block if sync tests don't exist
      return;
    }

    const proc = spawn('node', [syncTestPath], { stdio: 'pipe' });
    let output = '';
    proc.stdout.on('data', (data) => { output += data.toString(); });
    proc.stderr.on('data', (data) => { output += data.toString(); });
    proc.on('close', (code) => {
      console.log(output); // print sync test output verbatim
      // Record ONE honest result based on the child's exit code. Surface the real
      // passed/failed/skipped numbers in the name; never fabricate per-test lines.
      const match = output.match(/(\d+) passed, (\d+) failed(?:, (\d+) skipped)?/);
      const summary = match
        ? `${match[1]} passed, ${match[2]} failed${match[3] ? `, ${match[3]} skipped` : ''}`
        : 'no summary parsed';
      results.push({
        name: `supabase-sync suite (${summary})`,
        pass: code === 0,
        error: code === 0 ? undefined : 'sync suite exited non-zero — see output above',
      });
      resolve(code);
    });
  });
}

await runSyncTests();

const passed = results.filter((r) => r.pass).length;
const failed = results.length - passed;
console.log(`\n${failed === 0 ? '✓' : '✗'} ${passed}/${results.length} passed\n`);
for (const r of results) {
  if (r.pass) {
    console.log(`  PASS  ${r.name}`);
  } else {
    console.log(`  FAIL  ${r.name}`);
    console.log(`        ${r.error}`);
  }
}
process.exit(failed === 0 ? 0 : 1);
