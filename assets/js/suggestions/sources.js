// suggestions/sources.js — the single data-gathering entry point both pages call to get
// the SAME combined inbox: live conflicts (meta-observations) ⊕ engine actionable
// suggestions (refinement_suggestions), normalized + merged. Keeps the Listings page and
// the Trends page genuinely in sync — one query path, one ranking, one shape.
import {
  getReactionLog, getCriteria, getHouseholdAreas, getLearnedPreferences, getRefinementSuggestions,
} from '../storage.js';
import { detectConflicts } from '../meta-observations.js';
import { effectiveWeights, deriveSearchSpec } from '../learned-preferences.js';
import { classifySuggestions, presetFromOverrides } from '../refinement/view.js';
import { resolveConfig } from '../refinement/config.js';
import { computeLiveRows, mergeSuggestionRows } from '../refinement/live.js';
import { RECENCY_DAYS } from '../intelligence-constants.js';
import { combineSuggestions } from './model.js';

/**
 * Load + combine both suggestion sources.
 *
 * Since the 2026-07-05 overhaul the engine also runs LIVE in the browser
 * (refinement/live.js): its rows merge with the server's refinement_suggestions at the
 * ROW level (user decisions win; live wins metrics; stale server rows drop) before
 * classification, so a dead server cron can never blank or stale the inbox. Pass
 * `live: false` to classify the server rows alone (tests / diagnostics).
 *
 * @returns {Promise<{ combined, groups, conflicts, areasMeta }>}
 *   combined  — NormalizedSuggestion[] for the shared inbox (engine first, then live)
 *   groups    — classifySuggestions() buckets (the Trends page reuses active/probation/…)
 */
export async function loadCombinedSuggestions({ now = new Date(), live = true } = {}) {
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

  // Live evaluation at the user's chosen sensitivity, merged under the server rows.
  const config = resolveConfig({ preset: presetFromOverrides(learned?.overrides || {}) });
  const liveRows = live ? computeLiveRows(reactionLog, { now, config, dismissals }) : null;
  const rows = mergeSuggestionRows(engineRows || [], liveRows);

  // P10a (step 4.5): thread the learned weights so every engine card carries
  // whySignals + the learned-weight "Why?" line.
  const groups = classifySuggestions(rows, config, now, { effective });
  const combined = combineSuggestions({ conflicts, engineInbox: groups.inbox, areasMeta });
  return { combined, groups, conflicts, areasMeta };
}
