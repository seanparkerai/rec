// tests/refinement-observations.test.js — the "Trends & nudges" lane (2026-06-19).
// Exercises the PURE observation builder: which cards surface from reaction mix /
// learned drivers / coverage / forming digest, and that a dismissal filters a card out.
import { buildObservations, observationDismissKey, isDismissed } from '../../assets/js/refinement/observations.js';

export async function register({ test, assert, assertEqual }) {
  const NOW = new Date('2026-06-19T00:00:00Z');
  const ago = (days) => new Date(NOW.getTime() - days * 86_400_000).toISOString();
  // Distinct minutes so these read as genuine one-at-a-time reactions, not a bulk sweep
  // (≥6 graded in one minute would be classified 'bulk' and stripped by provenance).
  let mins = 0;
  const minsAgo = () => new Date(NOW.getTime() - (mins++) * 90_000).toISOString();

  // 14 graded reactions (above the MIN_GRADED_FOR_TRENDS floor): 4 likes, 10 rejects.
  const log = [];
  for (let i = 0; i < 4; i++) log.push({ reaction: 'like', created_at: minsAgo() });
  for (let i = 0; i < 10; i++) log.push({ reaction: 'reject', created_at: minsAgo() });

  const prefs = {
    derived: {
      'type:detached': { weight: 0.22, n_liked: 4, n_rejected: 1 },
      'type:flat': { weight: -0.18, n_liked: 0, n_rejected: 9 },
    },
  };
  const criteria = { propertyTypes: ['detached', 'flat', 'bungalow'] };
  const groups = { forming: [{ label: 'Terraced' }, { label: 'Flat' }] };

  test('observations: surfaces keep-rate, strongest pull, biggest turn-off, coverage gap, forming digest', () => {
    const obs = buildObservations({ reactionLog: log, prefs, criteria, groups, now: NOW });
    const byKind = Object.fromEntries(obs.map((o) => [o.kind, o]));
    assert(byKind['keep-rate'], 'keep-rate present');
    assert(byKind['keep-rate'].title.includes('29%'), '4 of 14 graded ≈ 29% liked'); // 4/(4+10)
    assertEqual(byKind['driver-like'].tone, 'positive');
    assert(byKind['driver-like'].title.includes('Detached'), 'strongest pull = detached');
    assertEqual(byKind['driver-reject'].tone, 'watch');
    assert(byKind['coverage-gap'].title.toLowerCase().includes('bungalow'), 'searched-but-never-liked = bungalow & flat');
    assert(byKind['forming-digest'].title.includes('2 patterns'), 'forming digest counts the forming bucket');
  });

  test('observations: stays quiet below the genuine-signal floor', () => {
    const thin = [{ reaction: 'like', created_at: ago(1) }, { reaction: 'reject', created_at: ago(1) }];
    const obs = buildObservations({ reactionLog: thin, prefs: {}, criteria: {}, groups: {}, now: NOW });
    assertEqual(obs.find((o) => o.kind === 'keep-rate'), undefined, 'no keep-rate with only 2 graded');
  });

  test('observations: a live dismissal filters the card out (and tolerates both entry shapes)', () => {
    const future = new Date(NOW.getTime() + 7 * 86_400_000).toISOString();
    const past = new Date(NOW.getTime() - 1 * 86_400_000).toISOString();
    // object form { kind, until } (what setConflictState writes)
    assertEqual(isDismissed('keep-rate', { [observationDismissKey('keep-rate')]: { kind: 'dismiss', until: future } }, NOW), true);
    // legacy ISO-string form
    assertEqual(isDismissed('keep-rate', { [observationDismissKey('keep-rate')]: future }, NOW), true);
    // elapsed dismissal no longer suppresses
    assertEqual(isDismissed('keep-rate', { [observationDismissKey('keep-rate')]: { until: past } }, NOW), false);

    const dismissed = { ...prefs, dismissals: { [observationDismissKey('keep-rate')]: { kind: 'dismiss', until: future } } };
    const obs = buildObservations({ reactionLog: log, prefs: dismissed, criteria, groups, now: NOW });
    assertEqual(obs.find((o) => o.id === 'keep-rate'), undefined, 'dismissed keep-rate is filtered out');
  });
}
