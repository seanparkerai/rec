// refinement/view.js — PURE view-model builders for the Refinement control panel
// (Stage 4, read-only; docs/REFINEMENT_PLAN.md §4). No DOM, no I/O — takes the rows
// from storage.getRefinementSuggestions() + the run meta and returns plain objects the
// page renderer turns into markup. Kept pure so the formatting (plain-English copy,
// the volume-artefact note, the confidence meter, the inbox cap/ranking) is unit-tested.
import { resolveConfig } from './config.js';

export const TIER_LABEL = {
  strong: 'Strong', confident: 'Confident', probable: 'Probable', forming: 'Forming', none: '—',
};
export const DIMENSION_LABEL = { area: 'Area', property_type: 'Property type' };

const titleCase = (s) => String(s).replace(/\b[a-z]/g, (c) => c.toUpperCase());

/** Humanise a normalised value for display. 'chillworth-so16' → 'Chillworth (SO16)'. */
export function humaniseValue(dimension, value) {
  const v = String(value || '');
  if (dimension === 'area') {
    const m = v.match(/^(.*)-([a-z]{1,2}\d[a-z\d]*)$/i);
    if (m) return `${titleCase(m[1].replace(/-/g, ' '))} (${m[2].toUpperCase()})`;
    return titleCase(v.replace(/-/g, ' '));
  }
  return titleCase(v); // property_type: 'semi-detached' → 'Semi-Detached', 'end of terrace' → 'End Of Terrace'
}

// ── Stage 5: display-hide rules (Approach B — client-side overrides filter) ──
// The Hide lever does NOT flip listings.status: the publishable/browser key can only
// SELECT the shared, household-less `listings` table (RLS "listings public read"), so
// an UPDATE is impossible without widening RLS. Instead each hide rule is stored under
// a RESERVED key inside learned_preferences.overrides. That key is safe because
// effectiveWeights() (learned-preferences/weights.js) only consumes entries with a
// numeric `.weight`, so it skips the reserved object, and recomputeLearnedPreferences()
// preserves `overrides` wholesale — a rule survives a retrain. Each rule is keyed
// `${dimension}:${value}` with the value stored NORMALISED (lower(trim())) to match
// the engine; the durable, reversible record is the rule + the suggestion status flip.
export const REFINEMENT_HIDE_KEY = '__refinement_hidden';
// Stage 7: the chosen sensitivity preset persists under another reserved overrides key
// (same safety: no numeric `.weight`, so effectiveWeights skips it; recompute preserves it).
export const REFINEMENT_SETTINGS_KEY = '__refinement_settings';

/** The three sensitivity presets, with plain-English copy for the §4.6 control. */
export const PRESET_OPTIONS = [
  { id: 'cautious', label: 'Cautious', blurb: 'Only strong, persistent evidence. Fewest suggestions.' },
  { id: 'balanced', label: 'Balanced', blurb: 'A middle ground between caution and reach.' },
  { id: 'aggressive', label: 'Aggressive', blurb: 'Surfaces suggestions sooner, on lighter evidence.' },
];

/** Read the persisted preset from an overrides blob (defaults to 'cautious'). */
export function presetFromOverrides(overrides = {}) {
  const s = overrides && typeof overrides === 'object' ? overrides[REFINEMENT_SETTINGS_KEY] : null;
  const p = s && typeof s === 'object' ? s.preset : null;
  return PRESET_OPTIONS.some((o) => o.id === p) ? p : 'cautious';
}

const normKey = (s) => String(s ?? '').trim().toLowerCase();

/** The rule key the engine and portal agree on for a (dimension, value) pair. */
export function hideRuleKey(dimension, value) {
  return `${dimension}:${normKey(value)}`;
}

/**
 * Extract the active display-hide rules from a learned_preferences.overrides blob.
 * Returns [{ key, dimension, value (normalised), count, at, label }]. Tolerant of a
 * missing or non-object reserved key (returns []).
 */
export function hiddenRulesFromOverrides(overrides = {}) {
  const blob = overrides && typeof overrides === 'object' ? overrides[REFINEMENT_HIDE_KEY] : null;
  if (!blob || typeof blob !== 'object') return [];
  return Object.entries(blob).map(([key, meta]) => {
    const m = meta && typeof meta === 'object' ? meta : {};
    const ci = key.indexOf(':');
    const dimension = m.dimension || (ci >= 0 ? key.slice(0, ci) : '');
    const value = normKey(m.value != null ? m.value : (ci >= 0 ? key.slice(ci + 1) : key));
    return { key, dimension, value, count: Number(m.count) || 0, at: m.at || null, label: humaniseValue(dimension, value) };
  });
}

/**
 * The first display-hide rule a listing matches, or null. A listing matches when the
 * rule's dimension column (area → area_id, property_type → property_type) equals the
 * rule value after lower(trim()) on BOTH sides (listings store Title-Case types, e.g.
 * 'Terraced', while the engine value is 'terraced').
 */
export function matchingHideRule(listing = {}, rules = []) {
  for (const r of rules || []) {
    const field = r.dimension === 'area' ? listing.area_id
      : r.dimension === 'property_type' ? listing.property_type : null;
    if (field != null && normKey(field) === r.value) return r;
  }
  return null;
}

/** Whether a listing is hidden by any active display-hide rule. */
export function listingHiddenByRefinement(listing = {}, rules = []) {
  return matchingHideRule(listing, rules) != null;
}

/**
 * Plain-English re-probe status for an on-probation area (§4.3). Forward-looking: the
 * scraper-side enforcement (re-probe cadence, "reconsider" detection) lands separately,
 * so until a re-probe has run we describe the cadence; `last_reprobe_run` and a
 * 'reconsider' status are surfaced once the scraper writes them.
 */
export function probationStatusLabel(row = {}, config = resolveConfig()) {
  const every = Number(row.reprobe_every_runs) || config.PROBATION_REPROBE_RUNS;
  const cadence = `We'll quietly re-check it every ${every} scraper run${every === 1 ? '' : 's'} in case it's worth bringing back.`;
  if (row.status === 'reconsider') {
    return `Worth reconsidering — recent re-checks suggest this area may be picking up. ${cadence}`;
  }
  if (row.last_reprobe_run != null) {
    return `Last re-checked at scraper run ${row.last_reprobe_run}. ${cadence}`;
  }
  return cadence;
}

const pct = (x) => `${Math.round((Number(x) || 0) * 100)}%`;
const round1 = (x) => (Number(x) || 0).toFixed(1);

/**
 * Turn one suggestion row into a display card view-model: humanised label, tier,
 * the plain-English reason, the "Why?" detail lines, and — when the engine flagged it
 * — the volume-artefact note (§2.8: "high volume, not disproportionately disliked").
 */
export function toCard(row) {
  const m = row.metrics || {};
  const nRaw = m.n_raw ?? 0;
  const kRaw = m.k_raw ?? 0;
  const rejectRate = nRaw > 0 ? kRaw / nRaw : 0;
  const lift = Number(m.lift) || 0;
  const artefact = !!m.volume_artefact;
  const whyLines = [
    `Rejected ${pct(rejectRate)} — ${kRaw} of ${nRaw} listings`,
    `${round1(lift)}× your usual reject rate of ${pct(m.baseline)}`,
    `Confidence: ${pct(m.wilson_lower)} (${TIER_LABEL[row.tier] || '—'})`,
    `Seen across ${m.distinct_rejected_listings ?? 0} different listings`,
  ];
  return {
    dimension: row.dimension,
    dimensionLabel: DIMENSION_LABEL[row.dimension] || row.dimension,
    value: row.value,
    label: humaniseValue(row.dimension, row.value),
    status: row.status,
    tier: row.tier,
    tierLabel: TIER_LABEL[row.tier] || '—',
    rejectPct: Math.round(rejectRate * 100),
    nRaw,
    kRaw,
    lift,
    liftLabel: `${round1(lift)}×`,
    wilsonPct: Math.round((Number(m.wilson_lower) || 0) * 100),
    distinct: m.distinct_rejected_listings ?? 0,
    volumeArtefact: artefact,
    artefactNote: artefact
      ? 'High volume, but about your usual reject rate — not disproportionately disliked.'
      : '',
    reason: m.reason || whyLines[0],
    whyLines,
    runsQualified: row.runs_qualified ?? 0,
  };
}

/** Rank actionable rows for the inbox (§2.8) and cap at MAX_INBOX. */
export function rankForInbox(rows, max) {
  return [...rows]
    .sort((a, b) => {
      const wa = a.metrics?.wilson_lower || 0;
      const wb = b.metrics?.wilson_lower || 0;
      if (wb !== wa) return wb - wa;
      return (b.metrics?.lift || 0) - (a.metrics?.lift || 0);
    })
    .slice(0, max);
}

/** Sort the patterns-forming rows by confidence (Wilson lower bound) desc. */
export function sortByConfidence(rows) {
  return [...rows].sort((a, b) => (b.metrics?.wilson_lower || 0) - (a.metrics?.wilson_lower || 0));
}

/**
 * The status a row reads as right now. A `snoozed` row whose `snoozed_until` has
 * passed re-surfaces as `actionable` (snooze expiry is handled here, not by the engine
 * job — its ON CONFLICT CASE guard never flips a snoozed row back, so the view owns it).
 */
export function effectiveStatus(row = {}, now = new Date()) {
  if (row.status === 'snoozed') {
    const until = row.snoozed_until ? new Date(row.snoozed_until) : null;
    if (until && until <= now) return 'actionable'; // a dated snooze that has elapsed
  }
  return row.status;
}

/** Whole days remaining on a snooze (≥0), for the "snoozed · N days left" copy. */
export function snoozeDaysLeft(row = {}, now = new Date()) {
  if (!row.snoozed_until) return 0;
  const ms = new Date(row.snoozed_until).getTime() - now.getTime();
  return Math.max(0, Math.ceil(ms / 86_400_000));
}

/**
 * Split rows into the Section-4 buckets by EFFECTIVE status (snooze expiry applied).
 * Only `actionable` rows reach the inbox; `forming` rows are the low-pressure "patterns
 * forming" list; the rest map to Active (confirmed_hide), Probation (confirmed_scrape),
 * Dismissed and Snoozed.
 */
export function classifySuggestions(rows = [], config = resolveConfig(), now = new Date()) {
  const eff = rows.map((r) => ({ row: r, status: effectiveStatus(r, now) }));
  const of = (s) => eff.filter((e) => e.status === s).map((e) => e.row);
  const inbox = rankForInbox(of('actionable'), config.MAX_INBOX);
  return {
    inbox: inbox.map(toCard),
    forming: sortByConfidence(of('forming')).map(toCard),
    active: of('confirmed_hide').map(toCard),
    probation: of('confirmed_scrape').map(toCard),
    dismissed: of('dismissed').map(toCard),
    snoozed: of('snoozed').map((r) => ({ ...toCard(r), snoozeDaysLeft: snoozeDaysLeft(r, now) })),
    counts: {
      total: rows.length,
      actionable: of('actionable').length,
      forming: of('forming').length,
    },
  };
}

/**
 * Model-confidence meter (§4.6): how much feedback has been collected vs the global
 * training gate. Reads the feedback summary recorded on the latest run.
 */
export function buildConfidenceMeter(meta, config = resolveConfig()) {
  const fb = meta && meta.params && meta.params.feedback;
  if (!fb) {
    return { ready: false, pct: 0, label: 'Still learning — the engine has not evaluated your feedback yet.' };
  }
  const have = Number(fb.system_decayed) || 0;
  const need = Number(fb.global_min) || config.GLOBAL_MIN_FEEDBACK;
  if (fb.global_gate_open) {
    return {
      ready: true,
      pct: 100,
      label: `Ready — learned from ${Math.round(have)} recent reactions.`,
    };
  }
  const remaining = Math.max(0, Math.ceil(need - have));
  return {
    ready: false,
    pct: Math.min(99, Math.round((have / need) * 100)),
    label: `Still learning — about ${remaining} more reactions before suggestions begin.`,
  };
}
