// tests/refinement-view.test.js — Stage 4 read-only control panel view-models
// (docs/archive/REFINEMENT_PLAN.md §4). Exercises the PURE view layer: value humanisation,
// the card view-model (incl. the volume-artefact note, §2.8), status classification,
// the inbox ranking + MAX_INBOX cap, and the model-confidence meter states.
import {
  humaniseValue, toCard, whySignalsFor, rankForInbox, sortByConfidence, classifySuggestions, buildConfidenceMeter,
  REFINEMENT_HIDE_KEY, hideRuleKey, hiddenRulesFromOverrides, matchingHideRule, listingHiddenByRefinement,
  probationStatusLabel, effectiveStatus, snoozeDaysLeft,
  REFINEMENT_SETTINGS_KEY, presetFromOverrides, PRESET_OPTIONS, presetNudge, topDislikesLine,
} from '../../assets/js/refinement/view.js';
import { effectiveWeights, REASON_COUNTS_KEY } from '../../assets/js/learned-preferences.js';
import { resolveConfig } from '../../assets/js/refinement/config.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const _ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');

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

  test('view: humaniseValue formats the expanded dimensions', () => {
    assertEqual(humaniseValue('price_band', '250-300k'), '£250k–£300k');
    assertEqual(humaniseValue('price_band', '800k+'), '£800k+');
    assertEqual(humaniseValue('price_band', '<250k'), 'Under £250k');
    assertEqual(humaniseValue('beds', '3'), '3 bedrooms');
    assertEqual(humaniseValue('beds', '1'), '1 bedroom');
    assertEqual(humaniseValue('beds', '5+'), '5+ bedrooms');
    assertEqual(humaniseValue('outdoor', 'no'), 'No outdoor space');
    assertEqual(humaniseValue('parking', 'yes'), 'Has parking');
    assertEqual(humaniseValue('outcode', 'po7'), 'PO7');
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

  // ── sensitivity nudge (§4.6) ───────────────────────────────────────────────
  const openMeta = { params: { feedback: { global_gate_open: true } } };
  test('view: presetNudge prompts a Balanced switch when forming patterns are stuck on Cautious', () => {
    const n = presetNudge(openMeta, { counts: { actionable: 0, forming: 3 } }, 'cautious');
    assert(n && n.recommend === 'balanced', 'recommends balanced');
    assert(n.label.includes('Cautious') && n.label.includes('3'), 'names the preset and the count');
  });
  test('view: presetNudge stays silent when there is nothing to nudge about', () => {
    // gate closed
    assertEqual(presetNudge({ params: { feedback: { global_gate_open: false } } }, { counts: { actionable: 0, forming: 3 } }, 'cautious'), null);
    // already actionable
    assertEqual(presetNudge(openMeta, { counts: { actionable: 1, forming: 3 } }, 'cautious'), null);
    // no forming patterns yet
    assertEqual(presetNudge(openMeta, { counts: { actionable: 0, forming: 0 } }, 'cautious'), null);
    // already off the strict preset
    assertEqual(presetNudge(openMeta, { counts: { actionable: 0, forming: 3 } }, 'balanced'), null);
  });

  // ── Stage 5: display-hide rules (Approach B) ───────────────────────────────
  const overridesWith = (...rules) => ({
    'type:flat': { weight: -0.8 }, // a real learned override — must NOT be read as a hide rule
    [REFINEMENT_HIDE_KEY]: Object.fromEntries(rules.map((r) => [hideRuleKey(r.dimension, r.value), r])),
  });

  test('view: hiddenRulesFromOverrides reads the reserved key and humanises labels', () => {
    const ov = overridesWith(
      { dimension: 'property_type', value: 'terraced', count: 170, at: '2026-06-05T00:00:00Z' },
      { dimension: 'area', value: 'hambledon-po7', count: 12 },
    );
    const rules = hiddenRulesFromOverrides(ov);
    assertEqual(rules.length, 2);
    const t = rules.find((r) => r.value === 'terraced');
    assertEqual(t.dimension, 'property_type');
    assertEqual(t.label, 'Terraced');
    assertEqual(t.count, 170);
    const a = rules.find((r) => r.dimension === 'area');
    assertEqual(a.label, 'Hambledon (PO7)');
  });

  test('view: hiddenRulesFromOverrides is empty for a blank / missing reserved key', () => {
    assertEqual(hiddenRulesFromOverrides({}).length, 0);
    assertEqual(hiddenRulesFromOverrides({ 'type:flat': { weight: -0.5 } }).length, 0);
    assertEqual(hiddenRulesFromOverrides().length, 0);
  });

  test('view: matchingHideRule matches case-insensitively (Title-Case listing vs lower rule)', () => {
    const rules = hiddenRulesFromOverrides(overridesWith(
      { dimension: 'property_type', value: 'terraced' },
      { dimension: 'area', value: 'hambledon-po7' },
    ));
    // listings store Title-Case property_type
    assert(listingHiddenByRefinement({ property_type: 'Terraced', area_id: 'whiteley-po15' }, rules), 'Terraced matches terraced rule');
    assert(matchingHideRule({ property_type: 'Terraced' }, rules).label === 'Terraced', 'returns the matched rule');
    assert(listingHiddenByRefinement({ property_type: 'Detached', area_id: 'Hambledon-PO7' }, rules), 'area_id matches case-insensitively');
    assert(!listingHiddenByRefinement({ property_type: 'Detached', area_id: 'whiteley-po15' }, rules), 'no rule → not hidden');
    assert(!listingHiddenByRefinement({}, rules), 'missing fields → not hidden');
  });

  test('view: the reserved hide key is invisible to effectiveWeights (no numeric .weight)', () => {
    // SAFETY: the whole Approach-B design rests on effectiveWeights skipping the
    // reserved object. The real 'type:flat' override survives; the hide blob does not
    // leak a weight into scoring.
    const ov = overridesWith({ dimension: 'property_type', value: 'terraced', count: 170 });
    const eff = effectiveWeights({}, ov);
    assertEqual(eff['type:flat'], -0.8);
    assert(!(REFINEMENT_HIDE_KEY in eff), 'reserved hide key never becomes a scoring weight');
  });

  // ── Stage 6: probation re-probe status copy ────────────────────────────────
  test('view: probationStatusLabel describes the re-probe cadence (forward-looking)', () => {
    const l = probationStatusLabel({ reprobe_every_runs: 6, status: 'active' }, cfg);
    assert(l.includes('every 6 scraper runs'), 'states the cadence');
    assert(!l.includes('Last re-checked'), 'no "last re-checked" until the scraper writes one');
  });

  test('view: probationStatusLabel falls back to the config cadence and surfaces reconsider', () => {
    assert(probationStatusLabel({}, cfg).includes(`every ${cfg.PROBATION_REPROBE_RUNS} scraper runs`), 'config default cadence');
    const last = probationStatusLabel({ reprobe_every_runs: 4, last_reprobe_run: 12 }, cfg);
    assert(last.includes('run 12'), 'surfaces last_reprobe_run once present');
    assert(probationStatusLabel({ status: 'reconsider', reprobe_every_runs: 6 }, cfg).includes('reconsidering'), 'reconsider badge copy');
  });

  // ── Stage 5/6: dismiss / snooze (with snooze expiry) ───────────────────────
  test('view: a snooze re-surfaces as actionable once snoozed_until passes', () => {
    const now = new Date('2026-06-05T00:00:00Z');
    const future = { status: 'snoozed', snoozed_until: '2026-07-05T00:00:00Z' };
    const past = { status: 'snoozed', snoozed_until: '2026-05-05T00:00:00Z' };
    assertEqual(effectiveStatus(future, now), 'snoozed', 'still snoozed before expiry');
    assertEqual(effectiveStatus(past, now), 'actionable', 'expired snooze returns to the inbox');
    assertEqual(effectiveStatus({ status: 'dismissed' }, now), 'dismissed', 'non-snooze statuses are unchanged');
    assertEqual(snoozeDaysLeft(future, now), 30, '30 days left');
    assertEqual(snoozeDaysLeft(past, now), 0, 'never negative');
  });

  test('view: classifySuggestions routes an expired snooze to the inbox and a live one to snoozed', () => {
    const now = new Date('2026-06-05T00:00:00Z');
    const rows = [
      row({ value: 's-live', status: 'snoozed', snoozed_until: '2026-07-01T00:00:00Z' }),
      row({ value: 's-exp', status: 'snoozed', snoozed_until: '2026-06-01T00:00:00Z' }),
      row({ value: 'd1', status: 'dismissed' }),
    ];
    const g = classifySuggestions(rows, cfg, now);
    assertEqual(g.snoozed.length, 1, 'only the live snooze stays snoozed');
    assertEqual(g.snoozed[0].value, 's-live');
    assert(typeof g.snoozed[0].snoozeDaysLeft === 'number', 'snoozed cards carry days left');
    assertEqual(g.inbox.length, 1, 'the expired snooze re-enters the inbox');
    assertEqual(g.inbox[0].value, 's-exp');
    assertEqual(g.dismissed.length, 1);
    assertEqual(g.counts.actionable, 1, 'counts reflect effective status');
  });

  // ── Stage 7: sensitivity preset persistence ────────────────────────────────
  test('view: presetFromOverrides reads the reserved settings key, defaults to balanced', () => {
    assertEqual(presetFromOverrides({}), 'balanced'); // DEFAULT_PRESET (2026-07-05 recalibration)
    assertEqual(presetFromOverrides({ [REFINEMENT_SETTINGS_KEY]: { preset: 'cautious' } }), 'cautious');
    assertEqual(presetFromOverrides({ [REFINEMENT_SETTINGS_KEY]: { preset: 'nonsense' } }), 'balanced', 'invalid → default');
    assertEqual(PRESET_OPTIONS.length, 3);
  });

  test('view: the reserved settings key is invisible to effectiveWeights', () => {
    const ov = { 'type:flat': { weight: -0.5 }, [REFINEMENT_SETTINGS_KEY]: { preset: 'aggressive' } };
    const eff = effectiveWeights({}, ov);
    assertEqual(eff['type:flat'], -0.5);
    assert(!(REFINEMENT_SETTINGS_KEY in eff), 'settings key never becomes a scoring weight');
  });

  test('view (4.6/P10h): the page surfaces reconsider prominently with a one-tap re-enable', () => {
    // The card markup lives in page-refinement.js (page coordinators get DOM
    // tests in the Phase-3 rebuild); pin the P10h surfacing at source level so
    // it can't silently regress meanwhile.
    const src = readFileSync(join(_ROOT, 'assets/js/page-refinement.js'), 'utf8');
    assert(/worth another look/i.test(src), 'reconsider headline copy present');
    assert(/Re-enable this area/.test(src), 'one-tap re-enable CTA present');
    assert(/status === 'reconsider'/.test(src), 'driven by the probation row status');
  });

  // ── explainability whySignals (P10a, step 4.5) ───────────────────────────────
  test('view (4.5): whySignals surfaces the main learned weight + same-kind context', () => {
    const r = { dimension: 'property_type', value: 'terraced', metrics: {}, tier: 'confident' };
    const effective = {
      'type:terraced': -0.12,
      'type:flat': -0.4,
      'type:detached': 0.1,
      'type:bungalow': 0.02,
      'area:oakley-rg23': -0.3, // different kind — never included
    };
    const ws = whySignalsFor(r, effective);
    assertEqual(ws[0].signal, 'type:terraced');
    assertEqual(ws[0].contribution, 'main');
    assertEqual(ws[0].direction, 'disliked');
    const supporting = ws.filter((s) => s.contribution === 'supporting');
    assertEqual(supporting.length, 2, 'strongest two same-kind co-signals only');
    assertEqual(supporting[0].signal, 'type:flat', 'ordered by |weight|');
    assert(!ws.some((s) => s.signal.startsWith('area:')), 'other kinds excluded');
    const card = toCard(r, effective);
    assertEqual(card.whySignals.length, 3);
    assert(card.whyLines.some((l) => l.includes('Learned weight: -0.12 (disliked)')),
      'the Why? drawer carries the learned-weight line');
  });

  test('view (4.5): no learned weights → whySignals empty, card shape unchanged', () => {
    const r = { dimension: 'property_type', value: 'terraced', metrics: {}, tier: 'confident' };
    assertEqual(whySignalsFor(r, null).length, 0);
    const card = toCard(r);
    assertEqual(card.whySignals.length, 0, 'no phantom signals without a weight map');
    assertEqual(card.whyLines.length, 4, 'the four statistical lines only');
    const groups = classifySuggestions(
      [{ dimension: 'property_type', value: 'terraced', status: 'forming', metrics: {}, tier: 'forming' }],
      undefined, new Date(), { effective: { 'type:terraced': -0.2 } },
    );
    assertEqual(groups.forming[0].whySignals[0].signal, 'type:terraced',
      'classifySuggestions threads the weight map to every card');
  });

  // ── step 4.7 (P10c): "your top dislikes" from the persisted reason counts ────
  test('view (4.7): topDislikesLine summarises the persisted reject reasons, capped', () => {
    const prefs = { derived: { [REASON_COUNTS_KEY]: { reject: [
      { key: 'too_expensive', label: 'Too expensive', count: 7 },
      { key: 'wrong_area', label: 'Wrong area', count: 4 },
      { key: 'no_parking', label: 'No parking', count: 2 },
      { key: 'dated', label: 'Needs updating', count: 1 },
    ], like: [] } } };
    const line = topDislikesLine(prefs);
    assertEqual(line, 'Your top dislikes: Too expensive ×7 · Wrong area ×4 · No parking ×2',
      'top three, ranked, labelled, counted');
    assert(topDislikesLine(prefs, 1).endsWith('Too expensive ×7'), 'n caps the list');
  });

  test('view (4.7): topDislikesLine is null with no persisted counts (cold / pre-recompute)', () => {
    assertEqual(topDislikesLine(null), null);
    assertEqual(topDislikesLine({ derived: {} }), null, 'row exists but counts never recomputed');
    assertEqual(topDislikesLine({ derived: { [REASON_COUNTS_KEY]: { reject: [], like: [] } } }), null,
      'no attributed rejects yet → no line, not an empty shell');
    assertEqual(topDislikesLine({ derived: { [REASON_COUNTS_KEY]: { reject: [{ key: 'x', count: 3 }] } } }),
      'Your top dislikes: x ×3', 'label falls back to the key');
  });

  test('view (4.7): the reserved counts key never leaks into effective weights or cards', () => {
    const derived = {
      'type:flat': { weight: -0.2, n_liked: 0, n_rejected: 9 },
      [REASON_COUNTS_KEY]: { reject: [{ key: 'too_expensive', count: 7 }], like: [] },
    };
    const eff = effectiveWeights(derived, {});
    assertEqual(Object.keys(eff).join(','), 'type:flat',
      'effectiveWeights skips the reserved object (no numeric .weight)');
  });
}
