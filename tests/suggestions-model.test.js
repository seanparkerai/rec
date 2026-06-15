// tests/suggestions-model.test.js — the normalized suggestion mappers (pure).
import { fromConflict, fromEngineCard, combineSuggestions } from '../assets/js/suggestions/model.js';

export async function register({ test, assert, assertEqual }) {
  const areasMeta = { 'wherwell-sp11': { name: 'Wherwell', geofenceRadiusMi: 5 } };

  test('model: tighten-buffer maps to a setAreaRadius apply with the proposed miles', () => {
    const n = fromConflict({ key: 'tighten:wherwell-sp11', kind: 'tighten-buffer', message: 'm', suggestion: 's', threshold: 5, proposed: 2, areaId: 'wherwell-sp11' }, { areasMeta });
    assertEqual(n.source, 'live');
    assertEqual(n.dimension, 'radius');
    assertEqual(n.label, 'Wherwell');
    assertEqual(n.apply.fn, 'setAreaRadius');
    assertEqual(n.apply.args.areaId, 'wherwell-sp11');
    assertEqual(n.apply.args.miles, 2);
  });

  test('model: over-budget maps to raiseBudget with the priciest liked home', () => {
    const n = fromConflict({ key: 'conflict:over-budget', kind: 'over-budget', message: 'm', suggestion: 's', threshold: 400000, proposed: 465000 });
    assertEqual(n.apply.fn, 'raiseBudget');
    assertEqual(n.apply.args.value, 465000);
  });

  test('model: below-min-beds maps to lowerMinBeds with the smallest liked home', () => {
    const n = fromConflict({ key: 'conflict:below-min-beds', kind: 'below-min-beds', message: 'm', suggestion: 's', threshold: 3, proposed: 2 });
    assertEqual(n.apply.fn, 'lowerMinBeds');
    assertEqual(n.apply.args.value, 2);
  });

  test('model: excluded-type maps to acceptType with the matched excluded entries', () => {
    const n = fromConflict({ key: 'conflict:excluded-type', kind: 'excluded-type', message: 'm', suggestion: 's', threshold: 'Flat / Apartment', excludedMatched: ['Flat / Apartment'] });
    assertEqual(n.apply.fn, 'acceptType');
    assertEqual(n.apply.args.values[0], 'Flat / Apartment');
  });

  test('model: a stop-area conflict needs confirm and maps to stopArea', () => {
    const n = fromConflict({ key: 'prune-area:hatherden-sp11', kind: 'stop-searching', message: 'm', suggestion: 's', threshold: 0, areaId: 'hatherden-sp11' }, { areasMeta });
    assertEqual(n.dimension, 'area');
    assertEqual(n.confirm, true);
    assertEqual(n.confirmAction, 'stop');
    assertEqual(n.apply.fn, 'stopArea');
    assertEqual(n.apply.args.value, 'hatherden-sp11');
  });

  test('model: an outcode prune is Snooze/Dismiss-only (no probation mapping)', () => {
    const n = fromConflict({ key: 'prune-outcode:sp11', kind: 'stop-searching', message: 'm', suggestion: 's', threshold: 0, outcode: 'SP11' });
    assertEqual(n.dimension, 'outcode');
    assertEqual(n.apply, null);
    assert(!n.actions.includes('apply'), 'no apply action for an outcode prune');
  });

  test('model: an engine area card maps to a confirmed stopArea', () => {
    const card = { dimension: 'area', value: 'foo-sp1', label: 'Foo (SP1)', dimensionLabel: 'Area', reason: 'r', whyLines: ['w'], tier: 'strong', tierLabel: 'Strong' };
    const n = fromEngineCard(card);
    assertEqual(n.source, 'engine');
    assertEqual(n.apply.fn, 'stopArea');
    assertEqual(n.confirm, true);
    assertEqual(n.value, 'foo-sp1');
  });

  test('model: an engine property_type card maps to a confirmed excludeType (hide)', () => {
    const card = { dimension: 'property_type', value: 'terraced', label: 'Terraced', dimensionLabel: 'Property type', reason: 'r', whyLines: [], tier: 'confident', tierLabel: 'Confident' };
    const n = fromEngineCard(card);
    assertEqual(n.apply.fn, 'excludeType');
    assertEqual(n.confirmAction, 'hide');
  });

  test('model: combineSuggestions leads with engine cards and de-dupes a covered area', () => {
    const conflicts = [
      { key: 'prune-area:foo-sp1', kind: 'stop-searching', message: 'm', suggestion: 's', threshold: 0, areaId: 'foo-sp1' },
      { key: 'tighten:wherwell-sp11', kind: 'tighten-buffer', message: 'm', suggestion: 's', threshold: 5, proposed: 2, areaId: 'wherwell-sp11' },
    ];
    const engineInbox = [{ dimension: 'area', value: 'foo-sp1', label: 'Foo', dimensionLabel: 'Area', reason: 'r', whyLines: [], tier: 'strong', tierLabel: 'Strong' }];
    const out = combineSuggestions({ conflicts, engineInbox, areasMeta });
    assertEqual(out[0].source, 'engine', 'engine leads');
    // The live prune-area for foo-sp1 is dropped (engine covers it); tighten survives.
    assert(!out.some((n) => n.source === 'live' && n.dimension === 'area' && n.value === 'foo-sp1'), 'duplicate area dropped');
    assert(out.some((n) => n.kind === 'tighten-buffer'), 'tighten kept');
    assertEqual(out.length, 2);
  });
}
