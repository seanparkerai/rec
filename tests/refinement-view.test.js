// tests/refinement-view.test.js — Stage 4 read-only control panel view-models
// (docs/REFINEMENT_PLAN.md §4). Exercises the PURE view layer: value humanisation,
// the card view-model (incl. the volume-artefact note, §2.8), status classification,
// the inbox ranking + MAX_INBOX cap, and the model-confidence meter states.
import {
  humaniseValue, toCard, rankForInbox, sortByConfidence, classifySuggestions, buildConfidenceMeter,
} from '../assets/js/refinement/view.js';
import { resolveConfig } from '../assets/js/refinement/config.js';

export async function register({ test, assert, assertEqual }) {
  const cfg = resolveConfig();

  const row = (over = {}) => ({
    dimension: 'property_type', value: 'terraced', tier: 'strong', status: 'forming',
    runs_qualified: 0,
    metrics: {
      n_raw: 419, k_raw: 419, n_eff: 416, k_eff: 416, p_hat: 1,
      wilson_lower: 0.9908, lift: 1.0139, baseline: 0.9862,
      distinct_rejected_listings: 285, volume_artefact: false, reason: 'Rejected 100% of 419',
      ...(over.metrics || {}),
    },
    ...over,
  });

  // ── humaniseValue ────────────────────────────────────────────────────────
  test('view: humaniseValue formats areas as "Name (OUTCODE)" and types as Title Case', () => {
    assertEqual(humaniseValue('area', 'chillworth-so16'), 'Chillworth (SO16)');
    assertEqual(humaniseValue('area', 'bishop-s-waltham-so32'), 'Bishop S Waltham (SO32)');
    assertEqual(humaniseValue('property_type', 'semi-detached'), 'Semi-Detached');
    assertEqual(humaniseValue('property_type', 'end of terrace'), 'End Of Terrace');
  });

  // ── toCard ───────────────────────────────────────────────────────────────
  test('view: toCard derives label, reject %, lift and the four Why? lines', () => {
    const c = toCard(row());
    assertEqual(c.label, 'Terraced');
    assertEqual(c.dimensionLabel, 'Property type');
    assertEqual(c.rejectPct, 100);
    assertEqual(c.tierLabel, 'Strong');
    assertEqual(c.liftLabel, '1.0×');
    assertEqual(c.wilsonPct, 99);
    assertEqual(c.distinct, 285);
    assertEqual(c.whyLines.length, 4);
    assert(c.whyLines[0].includes('419 of 419'), 'reason line has counts');
    assertEqual(c.volumeArtefact, false);
    assertEqual(c.artefactNote, '');
  });

  test('view: a volume-artefact card carries the explanatory note (§2.8)', () => {
    const c = toCard(row({ value: 'detached', metrics: { volume_artefact: true, lift: 0.99, n_raw: 800, k_raw: 790, baseline: 0.99, wilson_lower: 0.98, distinct_rejected_listings: 600 } }));
    assertEqual(c.volumeArtefact, true);
    assert(c.artefactNote.includes('not disproportionately disliked'), 'note explains the artefact');
  });

  // ── ranking + cap ─────────────────────────────────────────────────────────
  test('view: rankForInbox orders by Wilson lower bound and caps at MAX_INBOX', () => {
    const rows = [];
    for (let i = 0; i < 9; i++) rows.push(row({ value: `v${i}`, metrics: { wilson_lower: 0.80 + i * 0.01 } }));
    const ranked = rankForInbox(rows, cfg.MAX_INBOX);
    assertEqual(ranked.length, cfg.MAX_INBOX, 'capped at MAX_INBOX (5)');
    assertEqual(ranked[0].value, 'v8', 'highest Wilson first');
    assert((ranked[0].metrics.wilson_lower) > (ranked[1].metrics.wilson_lower), 'descending');
  });

  test('view: sortByConfidence is a stable Wilson-desc sort', () => {
    const sorted = sortByConfidence([
      row({ value: 'a', metrics: { wilson_lower: 0.7 } }),
      row({ value: 'b', metrics: { wilson_lower: 0.9 } }),
      row({ value: 'c', metrics: { wilson_lower: 0.8 } }),
    ]);
    assertEqual(sorted.map((r) => r.value).join(''), 'bca');
  });

  // ── classification ────────────────────────────────────────────────────────
  test('view: classifySuggestions splits rows into the Section-4 buckets', () => {
    const rows = [
      row({ value: 'act1', status: 'actionable' }),
      row({ value: 'f1', status: 'forming' }),
      row({ value: 'f2', status: 'forming' }),
      row({ value: 'd1', status: 'dismissed' }),
      row({ value: 'h1', status: 'confirmed_hide' }),
      row({ value: 's1', status: 'confirmed_scrape' }),
      row({ value: 'z1', status: 'snoozed' }),
    ];
    const g = classifySuggestions(rows, cfg);
    assertEqual(g.inbox.length, 1);
    assertEqual(g.forming.length, 2);
    assertEqual(g.active.length, 1);
    assertEqual(g.probation.length, 1);
    assertEqual(g.dismissed.length, 1);
    assertEqual(g.snoozed.length, 1);
    assertEqual(g.counts.actionable, 1);
    assertEqual(g.counts.forming, 2);
    assert(g.inbox[0].label && g.forming[0].label, 'buckets contain card view-models');
  });

  // ── confidence meter ───────────────────────────────────────────────────────
  test('view: confidence meter reports Ready when the global gate is open', () => {
    const meta = { params: { feedback: { system_decayed: 3556, global_min: 300, global_gate_open: true } } };
    const m = buildConfidenceMeter(meta, cfg);
    assertEqual(m.ready, true);
    assertEqual(m.pct, 100);
    assert(m.label.includes('Ready'), 'ready label');
  });

  test('view: confidence meter counts down remaining reactions when still learning', () => {
    const meta = { params: { feedback: { system_decayed: 120, global_min: 300, global_gate_open: false } } };
    const m = buildConfidenceMeter(meta, cfg);
    assertEqual(m.ready, false);
    assertEqual(m.pct, 40); // 120/300
    assert(m.label.includes('180'), 'about 180 more reactions');
  });

  test('view: confidence meter handles no evaluation run yet', () => {
    const m = buildConfidenceMeter(null, cfg);
    assertEqual(m.ready, false);
    assertEqual(m.pct, 0);
  });
}
