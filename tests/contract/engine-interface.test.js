// Contract (step 4.1): the intelligence-engine PUBLIC INTERFACE, pinned before
// any Phase-4 module is reworked. Every named export of the refinement +
// learned-preferences modules is listed here; a rebuild that drops or renames
// one breaks this test before it breaks a consumer (pages, tools, the Stage-3
// job). Additions are fine (extend the list); removals/renames are a
// deliberate act with a consumer sweep.
//
// Static source parse (no imports) so the pin stays runnable even if a module
// gains a browser-only dependency.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');

const SURFACE = {
  'assets/js/refinement/config.js': [
    'PRESETS', 'DEFAULT_PRESET', 'DIMENSIONS', 'SCRAPE_ELIGIBLE_DIMENSIONS',
    'isScrapeEligible', 'FIXED', 'resolveConfig',
  ],
  // twoProportionPValue → fisherExactPValue: the deliberate B3 rename (step
  // 4.2, consumer sweep done — only engine tests referenced it).
  'assets/js/refinement/engine.js': [
    'normaliseValue', 'extractValue', 'decayWeight', 'wilsonLowerBound',
    'fisherExactPValue', 'benjaminiHochberg', 'tierFor', 'buildAggregates',
    'scoreFromAggregates', 'runRefinementEngine',
  ],
  'assets/js/refinement/observations.js': [
    'buildObservations', 'observationDismissKey', 'isDismissed',
  ],
  'assets/js/refinement/persistence.js': [
    'priorRunsFromRows', 'isTracked', 'resolveStatus', 'metricsOf', 'paramsOf',
    'planRun', 'renderPlanSql',
  ],
  'assets/js/refinement/radius.js': ['weightedQuantile', 'learnRadii'],
  'assets/js/refinement/radius-persistence.js': ['planRadii', 'renderRadiusSql'],
  'assets/js/refinement/scope.js': [
    'activeAreaIds', 'probationAreaSet', 'reprobeThisRun', 'probationDropIds', 'scopeInvariant',
  ],
  'assets/js/refinement/trends-glance.js': [
    'reactionMix', 'shortLabel', 'topDrivers', 'reasonCounts', 'coverage', 'renderTrendsGlance',
  ],
  'assets/js/refinement/view.js': [
    'TIER_LABEL', 'DIMENSION_LABEL', 'humaniseValue', 'REFINEMENT_HIDE_KEY',
    'REFINEMENT_SETTINGS_KEY', 'REFINEMENT_RADIUS_OVERRIDE_KEY',
    'radiusOverridesFromOverrides', 'PRESET_OPTIONS', 'presetFromOverrides',
    'hideRuleKey', 'hiddenRulesFromOverrides', 'matchingHideRule',
    'listingHiddenByRefinement', 'probationStatusLabel', 'toCard', 'toRadiusCard',
    'rankForInbox', 'sortByConfidence', 'effectiveStatus', 'snoozeDaysLeft',
    'classifySuggestions', 'buildConfidenceMeter', 'presetNudge',
  ],
  'assets/js/learned-preferences/search.js': [
    'diversifySelection', 'listingBucketKey', 'deriveSearchSpec',
  ],
  'assets/js/learned-preferences/signals.js': [
    'priceBand', 'bedBucket', 'signalsForListing', 'inferOutdoorSpace',
    'inferParking', 'describeSignal', 'REASON_SIGNAL_KINDS',
    'SUBREASON_SIGNAL_KINDS', 'implicatedKinds',
  ],
  'assets/js/learned-preferences/weights.js': [
    'isRecent', 'gradedCount', 'isColdStart', 'trainingProgress',
    'deriveWeights', 'effectiveWeights', 'listingLearnedPrefs',
  ],
};

/** Named exports declared in a module's source (function/const/class + export lists). */
function exportsOf(src) {
  const names = new Set();
  for (const m of src.matchAll(/export\s+(?:async\s+)?(?:function|const|class)\s+([A-Za-z_$][\w$]*)/g)) names.add(m[1]);
  for (const list of src.matchAll(/export\s*{([^}]*)}/g)) {
    for (const part of list[1].split(',')) {
      const name = part.trim().split(/\s+as\s+/).pop()?.trim();
      if (name) names.add(name);
    }
  }
  return names;
}

export async function register({ test, assert }) {
  for (const [file, expected] of Object.entries(SURFACE)) {
    test(`interface: ${file.split('/').pop()} keeps its pinned exports`, () => {
      const have = exportsOf(readFileSync(join(ROOT, file), 'utf8'));
      const missing = expected.filter((n) => !have.has(n));
      assert(missing.length === 0, `${file} lost exports: ${missing.join(', ')}`);
    });
  }
}
