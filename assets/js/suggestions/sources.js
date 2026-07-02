// suggestions/sources.js — the single data-gathering entry point both pages call to get
// the SAME combined inbox: live conflicts (meta-observations) ⊕ engine actionable
// suggestions (refinement_suggestions), normalized + merged. Keeps the Listings page and
// the Trends page genuinely in sync — one query path, one ranking, one shape.
import {
  getReactionLog, getCriteria, getHouseholdAreas, getLearnedPreferences, getRefinementSuggestions,
} from '../storage.js';
import { detectConflicts } from '../meta-observations.js';
import { effectiveWeights, deriveSearchSpec } from '../learned-preferences.js';
import { classifySuggestions } from '../refinement/view.js';
import { RECENCY_DAYS } from '../intelligence-constants.js';
import { combineSuggestions } from './model.js';

/**
 * Load + combine both suggestion sources.
 * @returns {Promise<{ combined, groups, conflicts, areasMeta }>}
 *   combined  — NormalizedSuggestion[] for the shared inbox (engine first, then live)
 *   groups    — classifySuggestions() buckets (the Trends page reuses active/probation/…)
 */
export async function loadCombinedSuggestions({ now = new Date() } = {}) {
  const [reactionLog, criteria, areas, learned, engineRows] = await Promise.all([
    getReactionLog(), getCriteria(), getHouseholdAreas(), getLearnedPreferences(), getRefinementSuggestions(),
  ]);
  const areasMeta = {};
  for (const a of (areas || [])) areasMeta[a.id] = { name: a.name, geofenceRadiusMi: a.geofenceRadiusMi };

  const effective = effectiveWeights(learned?.derived || {}, learned?.overrides || {});
  const dismissals = learned?.dismissals || {};
  const searchSpec = deriveSearchSpec(effective, criteria, { recencyDays: RECENCY_DAYS });
  const conflicts = detectConflicts(reactionLog, criteria, {
    now, dismissals, areas: areasMeta,
    pruneCandidates: { areas: searchSpec.dropAreas, outcodes: searchSpec.dropOutcodes },
  });

  // P10a (step 4.5): thread the learned weights so every engine card carries
  // whySignals + the learned-weight "Why?" line.
  const groups = classifySuggestions(engineRows || [], undefined, now, { effective });
  const combined = combineSuggestions({ conflicts, engineInbox: groups.inbox, areasMeta });
  return { combined, groups, conflicts, areasMeta };
}
