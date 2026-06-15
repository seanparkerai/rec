// suggestions/model.js — the normalized suggestion view-model shared by the Listings
// page and the Trends (refinement) page. PURE: no DOM, no I/O, no clock beyond an
// injectable `now`. Two sources feed one shape:
//   • LIVE conflicts  — meta-observations.detectConflicts() objects (real-time, client
//     computed: tighten radius, over-budget, excluded type, below-min-beds, stop-search).
//   • ENGINE cards     — refinement/view.toCard() view-models (Supabase refinement_suggestions).
// Both map to a NormalizedSuggestion the shared renderer (suggestions/card.js) turns into
// markup and the action router (suggestions/apply.js) acts on.
//
// NormalizedSuggestion shape:
//   { id, source:'live'|'engine', kind, dimension, value, label, dimensionLabel,
//     message, detail, whyLines[], tier, tierLabel, current, proposed, areaId,
//     apply:{ fn, args } | null, applyLabel, actions[], confirm, confirmAction,
//     rejectPct?, liftLabel?, distinct?, volumeArtefact?, artefactNote? }

const round0 = (n) => Math.round(Number(n) || 0);
const gbp = (n) => `£${round0(n).toLocaleString('en-GB')}`;

/** Map ONE live conflict (detectConflicts output) to a NormalizedSuggestion. */
export function fromConflict(c, { areasMeta = {} } = {}) {
  const base = {
    source: 'live',
    id: c.key,
    kind: c.kind,
    message: c.message,
    detail: c.suggestion,
    whyLines: [],
    tier: 'live',
    tierLabel: 'Observed',
    current: c.threshold ?? null,
    proposed: c.proposed ?? null,
    areaId: c.areaId ?? null,
    value: null,
    confirm: false,
    confirmAction: null,
    actions: ['apply', 'snooze', 'dismiss'],
  };

  switch (c.kind) {
    case 'tighten-buffer': {
      const label = areasMeta[c.areaId]?.name || c.areaId;
      return {
        ...base, dimension: 'radius', dimensionLabel: 'Search radius', label,
        apply: { fn: 'setAreaRadius', args: { areaId: c.areaId, miles: c.proposed } },
        applyLabel: `Tighten to ~${c.proposed} mi`,
      };
    }
    case 'stop-searching': {
      if (c.areaId) {
        const label = areasMeta[c.areaId]?.name || c.areaId;
        return {
          ...base, dimension: 'area', dimensionLabel: 'Area', label, value: c.areaId,
          confirm: true, confirmAction: 'stop',
          apply: { fn: 'stopArea', args: { value: c.areaId } },
          applyLabel: 'Stop searching',
        };
      }
      // Outcode prune — no probation row maps to an outcode, so it's Snooze/Dismiss-only.
      return {
        ...base, dimension: 'outcode', dimensionLabel: 'Outcode', label: c.outcode || '',
        apply: null, applyLabel: '', actions: ['snooze', 'dismiss'],
      };
    }
    case 'over-budget':
      return {
        ...base, dimension: 'budget', dimensionLabel: 'Budget', label: 'Budget ceiling',
        apply: c.proposed ? { fn: 'raiseBudget', args: { value: c.proposed } } : null,
        applyLabel: c.proposed ? `Raise to ${gbp(c.proposed)}` : '',
        actions: c.proposed ? ['apply', 'snooze', 'dismiss'] : ['snooze', 'dismiss'],
      };
    case 'below-min-beds':
      return {
        ...base, dimension: 'beds', dimensionLabel: 'Bedrooms', label: 'Bedroom minimum',
        apply: c.proposed != null ? { fn: 'lowerMinBeds', args: { value: c.proposed } } : null,
        applyLabel: c.proposed != null ? `Lower to ${round0(c.proposed)} beds` : '',
      };
    case 'excluded-type': {
      const matched = Array.isArray(c.excludedMatched) ? c.excludedMatched.filter(Boolean) : [];
      return {
        ...base, dimension: 'property_type', dimensionLabel: 'Property type',
        label: matched.join(', ') || 'Property type',
        apply: matched.length ? { fn: 'acceptType', args: { values: matched } } : null,
        applyLabel: matched.length ? 'Re-accept this type' : '',
        actions: matched.length ? ['apply', 'snooze', 'dismiss'] : ['snooze', 'dismiss'],
      };
    }
    default:
      return { ...base, dimension: 'other', label: '', apply: null, applyLabel: '', actions: ['snooze', 'dismiss'] };
  }
}

/** Map ONE engine card (refinement/view.toCard() output) to a NormalizedSuggestion. */
export function fromEngineCard(card) {
  const isArea = card.dimension === 'area';
  return {
    source: 'engine',
    id: `${card.dimension}:${card.value}`,
    kind: isArea ? 'engine-area' : 'engine-type',
    dimension: card.dimension,          // engine dimension drives snooze/dismiss
    value: card.value,
    label: card.label,
    dimensionLabel: card.dimensionLabel,
    message: card.reason,
    detail: '',
    whyLines: card.whyLines || [],
    tier: card.tier || 'forming',
    tierLabel: card.tierLabel || '—',
    current: null,
    proposed: null,
    areaId: isArea ? card.value : null,
    rejectPct: card.rejectPct,
    liftLabel: card.liftLabel,
    distinct: card.distinct,
    volumeArtefact: card.volumeArtefact,
    artefactNote: card.artefactNote,
    apply: isArea
      ? { fn: 'stopArea', args: { value: card.value } }
      : { fn: 'excludeType', args: { value: card.value } },
    applyLabel: isArea ? 'Stop searching' : 'Hide from view',
    confirm: true,
    confirmAction: isArea ? 'stop' : 'hide',
    actions: ['apply', 'snooze', 'dismiss'],
  };
}

/**
 * Combine the two sources into one inbox list. Engine suggestions (statistically vetted)
 * lead; live observations follow. A live stop-area is dropped when an engine area
 * suggestion already covers the same area (the engine card wins — same areaId).
 */
export function combineSuggestions({ conflicts = [], engineInbox = [], areasMeta = {} } = {}) {
  const engine = (engineInbox || []).map(fromEngineCard);
  const engineAreaIds = new Set(engine.filter((e) => e.dimension === 'area').map((e) => e.value));
  const live = (conflicts || [])
    .map((c) => fromConflict(c, { areasMeta }))
    .filter((n) => !(n.dimension === 'area' && engineAreaIds.has(n.value)));
  return [...engine, ...live];
}
