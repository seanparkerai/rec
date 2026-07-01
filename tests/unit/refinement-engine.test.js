// tests/refinement-engine.test.js — Stage 2 of the Model Refinement Engine
// (docs/archive/REFINEMENT_PLAN.md §2). Exercises the PURE statistical core in isolation:
// normalisation, time-decayed counts, Wilson lower bound (with small-n continuity
// correction), baseline/lift, the one-sided two-proportion test, Benjamini-Hochberg
// FDR, the five gates, confidence tiers, ranking, and the volume_artefact flag.
//
// The five named cases from the Stage 2 box are all here:
//   1. small-sample penalty (7/8 ranks below 870/1000)
//   2. volume-artefact (high count, lift≈1 → flagged, not actionable)
//   3. decay (a stale pattern fades below the sample gate)
//   4. FDR (many noisy values → few/zero false actionables)
//   5. duplicate-key normalisation (bemerton-sp2 variants collapse)
// plus the acceptance check: the real type distribution ranks terraced (the
// mid-terrace equivalent) above detached/semi.
import {
  runRefinementEngine, wilsonLowerBound, twoProportionPValue, benjaminiHochberg,
  decayWeight, normaliseValue, extractValue, tierFor,
} from '../../assets/js/refinement/engine.js';
import { resolveConfig, PRESETS, DEFAULT_PRESET } from '../../assets/js/refinement/config.js';

export async function register({ test, assert, assertEqual }) {
  const NOW = '2026-06-05T00:00:00Z';
  const DAY = 86_400_000;
  const ago = (days) => new Date(Date.parse(NOW) - days * DAY).toISOString();

  let seq = 0;
  const react = (reaction, { type, area, id } = {}, days = 1) => ({
    listing_id: id ?? `L${seq++}`,
    reaction,
    created_at: ago(days),
    listing_snapshot: {
      ...(type !== undefined ? { property_type: type } : {}),
      ...(area !== undefined ? { area_id: area } : {}),
    },
  });
  // n reject + l like + p pass reactions for one property_type, all recent.
  const batch = (type, rej, like = 0, pass = 0, days = 1) => {
    const out = [];
    for (let i = 0; i < rej; i++) out.push(react('reject', { type }, days));
    for (let i = 0; i < like; i++) out.push(react('like', { type }, days));
    for (let i = 0; i < pass; i++) out.push(react('pass', { type }, days));
    return out;
  };

  const cfg = resolveConfig(); // Cautious defaults
  const typeOf = (run, value) => run.dimensions.property_type.candidates.find((c) => c.value === value);
  const rankIndex = (run, value) => run.candidates.findIndex((c) => c.value === value);

  // ── config sanity ────────────────────────────────────────────────────────────
  test('refinement-config: Cautious is the shipped default with the documented levers', () => {
    assertEqual(cfg.preset, 'cautious');
    assertEqual(cfg.WILSON_FLOOR, 0.88);
    assertEqual(cfg.MIN_LIFT, 1.20); // rebased 2026-06-19 to the genuine-baseline headroom (was 1.6)
    assertEqual(cfg.PERSISTENCE_RUNS, 5);
    assertEqual(cfg.FDR_Q, 0.05);
    assertEqual(cfg.HALF_LIFE_DAYS, 150);
    assertEqual(cfg.GLOBAL_MIN_FEEDBACK, 300);
    assertEqual(cfg.DIM_MIN_FEEDBACK, 150);
    assertEqual(DEFAULT_PRESET, 'cautious');
    // Aggressive lowers the bar; Balanced sits between.
    assert(PRESETS.aggressive.WILSON_FLOOR < PRESETS.balanced.WILSON_FLOOR, 'aggressive floor lower');
    assert(PRESETS.balanced.WILSON_FLOOR < PRESETS.cautious.WILSON_FLOOR, 'balanced floor lower than cautious');
    // MIN_LIFT floors must stay reachable against the genuine baseline (~0.82 → ceiling ≈ 1.22):
    // strictest (Cautious) below the ceiling, and ordered Cautious > Balanced > Aggressive.
    assert(PRESETS.cautious.MIN_LIFT < 1.22, 'Cautious lift floor stays under the achievable ceiling');
    assert(PRESETS.balanced.MIN_LIFT < PRESETS.cautious.MIN_LIFT, 'Balanced lift floor below Cautious');
    assert(PRESETS.aggressive.MIN_LIFT < PRESETS.balanced.MIN_LIFT, 'Aggressive lift floor below Balanced');
  });

  // ── normalisation primitives ───────────────────────────────────────────────
  test('refinement: normaliseValue lower-trims and nulls empties', () => {
    assertEqual(normaliseValue('  Bemerton-SP2 '), 'bemerton-sp2');
    assertEqual(normaliseValue('DETACHED'), 'detached');
    assertEqual(normaliseValue('   '), null);
    assertEqual(normaliseValue(null), null);
    assertEqual(normaliseValue(undefined), null);
  });

  test('refinement: extractValue reads snapshot first, falls back to joined listing', () => {
    assertEqual(extractValue({ listing_snapshot: { property_type: 'Flat' } }, 'property_type'), 'flat');
    assertEqual(extractValue({ listing: { area_id: 'WHERWELL-SP11' } }, 'area'), 'wherwell-sp11');
    assertEqual(
      extractValue({ listing_snapshot: { area_id: 'A' }, listing: { area_id: 'B' } }, 'area'),
      'a', 'snapshot wins over the joined row',
    );
    assertEqual(extractValue({ listing_snapshot: {} }, 'property_type'), null);
  });

  test('refinement: extractValue buckets the expanded dimensions (price/beds/outdoor/parking/outcode)', () => {
    const snap = (s) => ({ listing_snapshot: s });
    assertEqual(extractValue(snap({ price: 275_000 }), 'price_band'), '250-300k');
    assertEqual(extractValue(snap({ price: 950_000 }), 'price_band'), '800k+');
    assertEqual(extractValue(snap({ beds: 3 }), 'beds'), '3');
    assertEqual(extractValue(snap({ beds: 7 }), 'beds'), '5+');
    assertEqual(extractValue(snap({ outdoor_space: true }), 'outdoor'), 'yes');
    assertEqual(extractValue(snap({ outdoor_space: false }), 'outdoor'), 'no');
    assertEqual(extractValue(snap({ has_parking: true }), 'parking'), 'yes');
    assertEqual(extractValue(snap({ outcode: 'PO7' }), 'outcode'), 'po7');
    // Absent fields and unknown dimensions contribute nothing (no phantom bucket).
    assertEqual(extractValue(snap({}), 'price_band'), null);
    assertEqual(extractValue(snap({ outdoor_space: null }), 'outdoor'), null);
    assertEqual(extractValue(snap({ price: 275_000 }), 'unknown_dim'), null);
  });

  test('refinement: the engine scores an expanded dimension end-to-end', () => {
    // A genuine-style price-band pool: the 800k+ band is rejected far more than baseline.
    const r = (reaction, price, id) => ({ listing_id: id, reaction, created_at: ago(1), listing_snapshot: { price } });
    const reactions = [];
    let n = 0;
    for (let i = 0; i < 40; i++) reactions.push(r('reject', 950_000, `H${n++}`)); // 800k+ : 40/40
    for (let i = 0; i < 30; i++) reactions.push(r('reject', 275_000, `H${n++}`)); // 250-300k mixed
    for (let i = 0; i < 30; i++) reactions.push(r('like', 275_000, `H${n++}`));
    const run = runRefinementEngine(reactions, { now: NOW, config: resolveConfig({ preset: 'balanced' }), dimensions: ['price_band'] });
    const hi = run.dimensions.price_band.candidates.find((c) => c.value === '800k+');
    assert(hi && hi.lift > 1, 'the 800k+ band lifts above the price-band baseline');
    assert(hi.distinct_rejected_listings === 40, 'distinct rejected listings counted per dimension');
  });

  // ── decay weighting ──────────────────────────────────────────────────────────
  test('refinement: decayWeight halves at one half-life and floors negative ages at 1', () => {
    assert(Math.abs(decayWeight(150, 150) - 0.5) < 1e-12, 'one half-life → 0.5');
    assert(Math.abs(decayWeight(300, 150) - 0.25) < 1e-12, 'two half-lives → 0.25');
    assertEqual(decayWeight(0, 150), 1);
    assertEqual(decayWeight(-5, 150), 1); // future-dated clamps to age 0
  });

  // ── Wilson lower bound ───────────────────────────────────────────────────────
  test('refinement: Wilson lower bound rises with n at a fixed rate, and penalises small n', () => {
    const small = wilsonLowerBound(7, 8, { z: 1.96, continuity: true });
    const large = wilsonLowerBound(875, 1000, { z: 1.96, continuity: false });
    assert(small < large, `87.5% of 8 (${small.toFixed(3)}) must sit below 87.5% of 1000 (${large.toFixed(3)})`);
    // bounds stay inside [0,1]
    assert(small > 0 && small < 1, 'within unit interval');
    assertEqual(wilsonLowerBound(0, 0, {}), 0); // empty
    assertEqual(wilsonLowerBound(0, 10, { continuity: true }), 0); // zero rejects
  });

  test('refinement: continuity correction is more conservative than plain Wilson at small n', () => {
    const plain = wilsonLowerBound(7, 8, { z: 1.96, continuity: false });
    const cc = wilsonLowerBound(7, 8, { z: 1.96, continuity: true });
    assert(cc < plain, `cc (${cc.toFixed(3)}) should be below plain (${plain.toFixed(3)}) at n=8`);
  });

  // ── two-proportion test ──────────────────────────────────────────────────────
  test('refinement: one-sided two-proportion p-value is small only when v is rejected MORE', () => {
    const more = twoProportionPValue(95, 100, 50, 100); // 95% vs 50%
    const equal = twoProportionPValue(50, 100, 50, 100); // 50% vs 50%
    const less = twoProportionPValue(20, 100, 80, 100); // 20% vs 80%
    assert(more < 0.001, `clearly-more → tiny p (${more})`);
    assert(Math.abs(equal - 0.5) < 1e-6, `equal → ~0.5 (${equal})`);
    assert(less > 0.99, `less → ~1 (${less})`);
    assertEqual(twoProportionPValue(5, 0, 5, 10), 1); // degenerate
  });

  // ── Benjamini-Hochberg FDR (direct) ──────────────────────────────────────────
  test('refinement: BH flags only the genuine few among mostly-null p-values', () => {
    const items = [];
    for (let i = 0; i < 4; i++) items.push({ p_value: 1e-5 });        // 4 real signals
    for (let i = 0; i < 96; i++) items.push({ p_value: 0.5 + i * 0.004 }); // 96 nulls (0.5..0.88)
    benjaminiHochberg(items, 0.05);
    const passed = items.filter((it) => it.fdr_significant).length;
    assertEqual(passed, 4, 'exactly the 4 real signals pass FDR; the 96 nulls do not');
  });

  test('refinement: BH passes nothing when every value is null noise', () => {
    const items = Array.from({ length: 50 }, () => ({ p_value: 0.5 }));
    benjaminiHochberg(items, 0.05);
    assertEqual(items.filter((it) => it.fdr_significant).length, 0);
  });

  // ── tiers ────────────────────────────────────────────────────────────────────
  test('refinement: confidence tiers map to the §2.7 boundaries', () => {
    assertEqual(tierFor(0.40, cfg), 'none');
    assertEqual(tierFor(0.70, cfg), 'forming');   // [0.65, 0.88)
    assertEqual(tierFor(0.89, cfg), 'probable');  // [0.88, 0.90)
    assertEqual(tierFor(0.92, cfg), 'confident'); // [0.90, 0.95)
    assertEqual(tierFor(0.97, cfg), 'strong');    // [0.95, 1.0]
  });

  // ════════════════════════════════════════════════════════════════════════════
  // 1. SMALL-SAMPLE PENALTY — 7/8 must rank below 870/1000
  // ════════════════════════════════════════════════════════════════════════════
  test('refinement: small-sample 7/8 ranks BELOW 870/1000 (Wilson lower bound)', () => {
    const reactions = [
      ...batch('tiny-strong', 7, 1),   // 7 of 8 rejected
      ...batch('big-steady', 870, 130), // 870 of 1000 rejected
    ];
    const run = runRefinementEngine(reactions, { now: NOW, config: cfg, dimensions: ['property_type'] });
    const tiny = typeOf(run, 'tiny-strong');
    const big = typeOf(run, 'big-steady');
    assert(tiny.wilson_lower < big.wilson_lower,
      `wilson_lower tiny=${tiny.wilson_lower.toFixed(3)} must be < big=${big.wilson_lower.toFixed(3)}`);
    assert(rankIndex(run, 'big-steady') < rankIndex(run, 'tiny-strong'),
      'the big steady sample outranks the tiny one despite a higher raw rate');
  });

  // ════════════════════════════════════════════════════════════════════════════
  // 2. VOLUME-ARTEFACT — high count, lift ≈ 1 → flagged, never actionable
  // ════════════════════════════════════════════════════════════════════════════
  test('refinement: high-volume low-lift value is flagged volume_artefact and is not actionable', () => {
    const reactions = [
      ...batch('detached', 200),  // high volume, all rejected
      ...batch('terraced', 200),  // high volume, all rejected
      ...batch('cottage', 5),     // low volume
    ];
    const run = runRefinementEngine(reactions, { now: NOW, config: cfg, dimensions: ['property_type'] });
    const detached = typeOf(run, 'detached');
    const cottage = typeOf(run, 'cottage');
    assert(Math.abs(detached.lift - 1) < 1e-9, `lift ≈ 1 (${detached.lift})`);
    assertEqual(detached.volume_artefact, true, 'high count + lift≤1 → artefact');
    assertEqual(detached.actionable, false, 'an artefact is never actionable (lift below MIN_LIFT)');
    assertEqual(cottage.volume_artefact, false, 'low raw reject count is not a volume artefact');
  });

  // ════════════════════════════════════════════════════════════════════════════
  // 3. DECAY — a strong-but-stale pattern fades below the sample gate
  // ════════════════════════════════════════════════════════════════════════════
  test('refinement: a stale pattern decays below the sample gate while a fresh twin passes', () => {
    const reactions = [
      ...batch('fresh', 20, 0, 0, 1),    // 20 rejects, ~1 day old
      ...batch('stale', 20, 0, 0, 600),  // 20 rejects, 600 days old (4 half-lives)
    ];
    const run = runRefinementEngine(reactions, { now: NOW, config: cfg, dimensions: ['property_type'] });
    const fresh = typeOf(run, 'fresh');
    const stale = typeOf(run, 'stale');
    assert(stale.n_eff < fresh.n_eff * 0.2, `stale n_eff (${stale.n_eff.toFixed(2)}) ≪ fresh (${fresh.n_eff.toFixed(2)})`);
    assertEqual(fresh.gates.sample, true, 'fresh clears the effective-sample gate');
    assertEqual(stale.gates.sample, false, 'stale falls below MIN_EFFECTIVE_SAMPLE after decay');
    assert(stale.wilson_lower < fresh.wilson_lower, 'confidence in the stale pattern has faded');
  });

  // ════════════════════════════════════════════════════════════════════════════
  // 4. FDR — many noisy values produce few/zero false actionables
  // ════════════════════════════════════════════════════════════════════════════
  test('refinement: a field of noisy small-n values yields zero actionables and ≤2 FDR hits', () => {
    const reactions = [];
    for (let v = 0; v < 40; v++) {
      const rej = 5 + (v % 5); // rates 0.5..0.9 of 10 — noisy, none truly disproportionate
      reactions.push(...batch(`noise-${v}`, rej, 10 - rej));
    }
    const run = runRefinementEngine(reactions, { now: NOW, config: cfg, dimensions: ['property_type'] });
    assertEqual(run.actionable.length, 0, 'pure noise surfaces nothing actionable');
    const fdrHits = run.dimensions.property_type.candidates.filter((c) => c.fdr_significant).length;
    assert(fdrHits <= 2, `FDR keeps false discoveries near zero (got ${fdrHits})`);
  });

  // ════════════════════════════════════════════════════════════════════════════
  // 5. DUPLICATE-KEY NORMALISATION — bemerton-sp2 variants collapse to one value
  // ════════════════════════════════════════════════════════════════════════════
  test('refinement: case/whitespace area-id variants collapse into a single candidate', () => {
    const reactions = [
      react('reject', { area: 'Bemerton-SP2', id: 'a' }),
      react('reject', { area: 'bemerton-sp2', id: 'b' }),
      react('reject', { area: ' BEMERTON-SP2 ', id: 'c' }),
      react('reject', { area: '  bemerton-sp2', id: 'd' }),
    ];
    const run = runRefinementEngine(reactions, { now: NOW, config: cfg, dimensions: ['area'] });
    const cands = run.dimensions.area.candidates;
    assertEqual(cands.length, 1, 'four casing variants → one normalised candidate');
    assertEqual(cands[0].value, 'bemerton-sp2');
    assertEqual(cands[0].n_raw, 4);
    assertEqual(cands[0].distinct_rejected_listings, 4);
  });

  // ── persistence + full actionable path (validates gates positively) ──────────
  test('refinement: a strong disproportionate signal becomes actionable only after persistence', () => {
    // Low baseline (most stock kept), one heavily-rejected type → lift well over 1.6.
    const reactions = [
      ...batch('park home', 60),       // 60/60 rejected, 60 distinct listings
      ...batch('detached', 30, 170),   // 200 reactions, mostly kept
      ...batch('semi-detached', 20, 180),
    ];
    const opts = { now: NOW, config: cfg, dimensions: ['property_type'] };

    const firstRun = runRefinementEngine(reactions, opts);
    const ph1 = typeOf(firstRun, 'park home');
    assertEqual(ph1.gates.global, true, 'global+dimension feedback gate is open');
    assertEqual(ph1.gates.sample, true, 'effective-sample + distinct-listing gate passes');
    assertEqual(ph1.gates.confidence, true, 'Wilson lower bound clears the floor');
    assertEqual(ph1.gates.disproportionality, true, 'FDR-significant and lift ≥ MIN_LIFT');
    assert(ph1.lift >= cfg.MIN_LIFT, `lift ${ph1.lift.toFixed(2)} clears MIN_LIFT`);
    assertEqual(ph1.qualifies_this_run, true, 'gates 1–4 satisfied');
    assertEqual(ph1.actionable, false, 'but not actionable yet — persistence not met on run 1');

    // Replay with prior consecutive qualifying runs so the persistence gate (5) trips.
    const persisted = runRefinementEngine(reactions, {
      ...opts,
      priorRunsQualified: { 'property_type:park home': cfg.PERSISTENCE_RUNS - 1 },
    });
    const ph2 = typeOf(persisted, 'park home');
    assertEqual(ph2.runs_qualified, cfg.PERSISTENCE_RUNS, 'consecutive qualifying runs reached the threshold');
    assertEqual(ph2.gates.persistence, true);
    assertEqual(ph2.actionable, true, 'now actionable');
    assertEqual(persisted.actionable[0].value, 'park home', 'and it tops the actionable list');
  });

  test('refinement: nothing is actionable until the global training gate is met', () => {
    // Same strong signal but far below GLOBAL_MIN_FEEDBACK decayed reactions.
    const reactions = [...batch('park home', 20), ...batch('detached', 10, 30)];
    const run = runRefinementEngine(reactions, {
      now: NOW, config: cfg, dimensions: ['property_type'],
      priorRunsQualified: { 'property_type:park home': 99 },
    });
    const ph = typeOf(run, 'park home');
    assertEqual(ph.gates.global, false, 'too little feedback system-wide → global gate shut');
    assertEqual(ph.actionable, false, 'persistence cannot rescue a shut global gate');
  });

  // ════════════════════════════════════════════════════════════════════════════
  // ACCEPTANCE — the real type distribution ranks "terraced" (mid-terrace) above
  // detached/semi, and the ~98.7% baseline keeps everything below MIN_LIFT.
  // Counts mirror the live listing_reactions snapshot (docs/SCHEMA_NOTES.md §2).
  // ════════════════════════════════════════════════════════════════════════════
  test('refinement: live type distribution surfaces terraced above detached & semi-detached', () => {
    const reactions = [
      ...batch('detached', 778, 5, 1),
      ...batch('semi-detached', 523, 12, 6),
      ...batch('terraced', 419, 0, 0),
      ...batch('flat', 381, 0, 0),
      ...batch('apartment', 249, 0, 0),
      ...batch('end of terrace', 183, 4, 3),
      ...batch('detached bungalow', 105, 4, 1),
      ...batch('bungalow', 96, 1, 3),
      ...batch('park home', 81, 0, 0),
      ...batch('maisonette', 78, 0, 0),
      ...batch('house', 70, 2, 0),
      ...batch('link detached house', 48, 1, 0),
      ...batch('town house', 45, 0, 0),
    ];
    const run = runRefinementEngine(reactions, { now: NOW, config: cfg, dimensions: ['property_type'] });

    const terraced = typeOf(run, 'terraced');
    const detached = typeOf(run, 'detached');
    const semi = typeOf(run, 'semi-detached');

    // Ranking: terraced (100% reject) sits above detached (99.2%) and semi (96.7%).
    assert(rankIndex(run, 'terraced') < rankIndex(run, 'detached'), 'terraced ranks above detached');
    assert(rankIndex(run, 'terraced') < rankIndex(run, 'semi-detached'), 'terraced ranks above semi-detached');
    assert(terraced.lift > detached.lift && detached.lift > semi.lift, 'lift orders terraced > detached > semi');

    // When the WHOLE pool is uniformly ~98.7% rejected there is no disproportionality:
    // lift ≈ 1.0 for every type, so nothing clears MIN_LIFT and nothing is actionable.
    // (This is the raw, unfiltered shape; the genuine-only baseline test below is the
    // realistic one the engine actually scores against.)
    assert(run.baseline.property_type > 0.97, `degenerate baseline ≈ ${run.baseline.property_type.toFixed(3)}`);
    assertEqual(run.actionable.length, 0, 'uniform near-total rejection → no disproportionality → nothing actionable');
  });

  // ════════════════════════════════════════════════════════════════════════════
  // BASELINE-CEILING CALIBRATION (2026-06-19) — against the GENUINE-only baseline
  // (~0.82, the rate the live engine scores), the max achievable lift is 1/0.82 ≈ 1.22.
  // The rebased floors must make Balanced reachable while Cautious stays the strict
  // floor that only the most extreme (near-100%-reject) signal can clear.
  // ════════════════════════════════════════════════════════════════════════════
  test('refinement: genuine ~0.82 baseline — Balanced is reachable, Cautious stays strict', () => {
    // Pool baseline = 328 rejects / 400 = 0.82. 'terraced' is 100%-rejected (lift ≈ 1.22);
    // 'flat' is ~94%-rejected (lift ≈ 1.15); detached/semi sit below baseline.
    const reactions = [
      ...batch('terraced', 70, 0, 0),   // 70/70  → p_hat 1.00, lift ≈ 1.22
      ...batch('flat', 66, 4, 0),       // 66/70  → p_hat 0.94, lift ≈ 1.15
      ...batch('detached', 130, 50, 0), // 130/180 → below baseline
      ...batch('semi-detached', 62, 18, 0),
    ];
    const balanced = resolveConfig({ preset: 'balanced' });
    const runB = runRefinementEngine(reactions, { now: NOW, config: balanced, dimensions: ['property_type'] });
    const tB = typeOf(runB, 'terraced');
    const fB = typeOf(runB, 'flat');
    assert(runB.baseline.property_type > 0.80 && runB.baseline.property_type < 0.84,
      `baseline ≈ 0.82 (got ${runB.baseline.property_type.toFixed(3)})`);
    assert(tB.lift > 1.20, `terraced lift ≈ 1.22 (got ${tB.lift.toFixed(3)})`);
    assertEqual(tB.qualifies_this_run, true, 'Balanced: the 100%-reject signal qualifies (was impossible at the old 1.3 floor)');
    assertEqual(fB.qualifies_this_run, true, 'Balanced: a ~94%-reject signal (lift ≈ 1.15) also qualifies');

    // Same snapshot under Cautious: the strict floor (1.20) still admits the most
    // extreme signal but gates the moderate one — Cautious stays near-silent.
    const cautious = resolveConfig({ preset: 'cautious' });
    const runC = runRefinementEngine(reactions, { now: NOW, config: cautious, dimensions: ['property_type'] });
    assertEqual(typeOf(runC, 'flat').qualifies_this_run, false, 'Cautious: the moderate signal is gated by the strict lift floor');
  });
}
