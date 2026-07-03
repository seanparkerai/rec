// tests/unit/engine-hardening.test.js — mutation-hardening anchors for the engine's
// statistical core (step 4.10b). Every test here exists to kill a SURVIVED mutant from
// the 2026-07-03 Stryker report: exact-value anchors for the Wilson/Fisher formulas,
// exact boundary tests for every tier/gate threshold (>= vs >), the full ranking
// tie-break ladder, and the BH-FDR edge behaviour. Values are hand-anchored: a change
// here is a deliberate §3.10-adjacent statistics change, never a drive-by.
import {
  runRefinementEngine, scoreFromAggregates, buildAggregates, wilsonLowerBound,
  fisherExactPValue, benjaminiHochberg, decayWeight, normaliseValue, extractValue, tierFor,
} from '../../assets/js/refinement/engine.js';
import { resolveConfig } from '../../assets/js/refinement/config.js';

export async function register({ test, assert, assertEqual }) {
  const cfg = resolveConfig();
  const close = (a, b, msg, eps = 1e-12) => assert(Math.abs(a - b) < eps, `${msg}: ${a} !== ${b}`);

  // ── Wilson lower bound: exact-value anchors (kills the formula's arithmetic mutants) ──
  test('hardening: wilsonLowerBound exact anchors, plain formula', () => {
    close(wilsonLowerBound(8, 10), 0.49015684672072346, 'w(8,10)');
    close(wilsonLowerBound(50, 100), 0.40382982859014716, 'w(50,100)');
    close(wilsonLowerBound(3, 40), 0.025835556771858243, 'w(3,40)');
    assertEqual(wilsonLowerBound(0, 10), 0, 'k=0 → exactly 0');
    assertEqual(wilsonLowerBound(5, 0), 0, 'n=0 → 0');
    assertEqual(wilsonLowerBound(5, -1), 0, 'n<0 → 0');
  });

  test('hardening: wilsonLowerBound exact anchors, continuity-corrected branch', () => {
    close(wilsonLowerBound(8, 10, { continuity: true }), 0.4421761486272936, 'cc w(8,10)');
    close(wilsonLowerBound(1, 2, { continuity: true }), 0.026676532765647083, 'cc w(1,2)');
    assertEqual(wilsonLowerBound(0, 10, { continuity: true }), 0, 'cc p<=0 → exactly 0');
    // CC must sit strictly below the plain bound in the small-n regime it corrects.
    assert(wilsonLowerBound(8, 10, { continuity: true }) < wilsonLowerBound(8, 10),
      'cc bound below plain bound at small n');
  });

  // ── Fisher exact: anchors + degenerate-input guards ─────────────────────────
  test('hardening: fisherExactPValue exact anchors and degenerate guards', () => {
    close(fisherExactPValue(3, 4, 1, 4), 0.2428571428571424, 'B3 anchor 3/4 vs 1/4', 1e-10);
    close(fisherExactPValue(2, 3, 10, 20), 0.5341614906832272, 'f(2,3,10,20)', 1e-10);
    assertEqual(fisherExactPValue(1, 0, 1, 4), 1, 'n1=0 → 1');
    assertEqual(fisherExactPValue(1, 2, 1, 0), 1, 'n2=0 → 1');
    assertEqual(fisherExactPValue(1, 0.4, 1, 4), 1, 'n1 rounds to 0 → 1');
    // Defensive rounding: fractional decayed-looking inputs land on the integer grid.
    close(fisherExactPValue(2.4, 3.4, 10.4, 20.4), fisherExactPValue(2, 3, 10, 20), 'rounding');
    // k clamped into [0, n]: k1 > n1 behaves as k1 = n1.
    close(fisherExactPValue(9, 4, 1, 4), fisherExactPValue(4, 4, 1, 4), 'k1 clamped to n1');
    close(fisherExactPValue(-3, 4, 1, 4), fisherExactPValue(0, 4, 1, 4), 'k1 clamped to 0');
  });

  // ── Benjamini-Hochberg: boundary, reset, pull-in, and order sensitivity ─────
  test('hardening: BH passes p exactly equal to (rank/m)·q (boundary is inclusive)', () => {
    const items = [{ p_value: 0.05 }];
    benjaminiHochberg(items, 0.05);
    assertEqual(items[0].fdr_significant, true, 'p == q at m=1 passes');
  });

  test('hardening: BH resets stale flags and flags by identity, not by position', () => {
    // Pre-set flags must be RESET before evaluation (the forEach clear is load-bearing).
    const items = [
      { id: 'noise', p_value: 0.9, fdr_significant: true },
      { id: 'real', p_value: 0.01, fdr_significant: false },
    ];
    benjaminiHochberg(items, 0.05);
    assertEqual(items[0].fdr_significant, false, 'stale true reset to false');
    assertEqual(items[1].fdr_significant, true, 'small p flagged (sort by p, not position)');
  });

  test('hardening: BH pull-in — the largest passing rank drags every smaller rank through', () => {
    // Sorted: 0.021, 0.04, 0.05 with q=0.05, m=3. Ranks 1,2 fail their own cutoffs
    // (0.0167, 0.0333) but rank 3 passes (0.05 ≤ 0.05) → ALL THREE significant.
    const items = [{ p_value: 0.04 }, { p_value: 0.021 }, { p_value: 0.05 }];
    benjaminiHochberg(items, 0.05);
    assert(items.every((it) => it.fdr_significant === true), 'all pulled in by rank 3');
  });

  // ── Confidence tiers: every boundary is inclusive (>=) ──────────────────────
  test('hardening: tierFor boundaries are inclusive at every threshold', () => {
    assertEqual(tierFor(cfg.TIER_STRONG, cfg), 'strong', '== TIER_STRONG');
    assertEqual(tierFor(cfg.TIER_STRONG - 1e-9, cfg), 'confident', 'just below strong');
    assertEqual(tierFor(cfg.TIER_CONFIDENT, cfg), 'confident', '== TIER_CONFIDENT');
    assertEqual(tierFor(cfg.WILSON_FLOOR, cfg), 'probable', '== WILSON_FLOOR');
    assertEqual(tierFor(cfg.FORMING_FLOOR, cfg), 'forming', '== FORMING_FLOOR');
    assertEqual(tierFor(cfg.FORMING_FLOOR - 1e-9, cfg), 'none', 'just below forming');
  });

  // ── Decay: clamp + exact half-life points ───────────────────────────────────
  test('hardening: decayWeight exact points and negative-age clamp', () => {
    assertEqual(decayWeight(0, 30), 1, 'age 0 → 1');
    assertEqual(decayWeight(30, 30), 0.5, 'one half-life → 0.5');
    assertEqual(decayWeight(60, 30), 0.25, 'two half-lives → 0.25');
    assertEqual(decayWeight(-5, 30), 1, 'future-dated clamps to weight 1');
  });

  // ── Value extraction ─────────────────────────────────────────────────────────
  test('hardening: extractValue snapshot-first with listing fallback; boolean labels', () => {
    const r = { listing_snapshot: { property_type: 'Flat' }, listing: { property_type: 'House' } };
    assertEqual(extractValue(r, 'property_type'), 'flat', 'snapshot wins');
    const r2 = { listing_snapshot: {}, listing: { property_type: 'House' } };
    assertEqual(extractValue(r2, 'property_type'), 'house', 'falls back to joined listing');
    assertEqual(extractValue(r, 'no_such_dimension'), null, 'unknown dimension → null');
    assertEqual(extractValue({ listing_snapshot: { outdoor_space: true } }, 'outdoor'), 'yes', 'true → yes');
    assertEqual(extractValue({ listing_snapshot: { outdoor_space: false } }, 'outdoor'), 'no', 'false → no');
    assertEqual(extractValue({ listing_snapshot: {} }, 'outdoor'), null, 'missing bool → null');
    assertEqual(normaliseValue('  MiXeD '), 'mixed', 'trim+lower');
    assertEqual(normaliseValue('   '), null, 'whitespace-only → null');
  });

  // ── Synthetic-aggregates helpers for exact gate boundaries ───────────────────
  const val = (value, k, n, { distinct = k, kRaw = k, nRaw = n } = {}) => ({
    value, n_eff: n, k_eff: k, n_raw: nRaw, k_raw: kRaw, distinct_rejected_listings: distinct,
  });
  const agg = (systemDecayed, perDimension) => ({ systemDecayed, perDimension });

  test('hardening: global gate opens at EXACTLY GLOBAL_MIN_FEEDBACK (inclusive)', () => {
    const mk = (sys) => scoreFromAggregates(
      agg(sys, { area: { dimDecayed: cfg.DIM_MIN_FEEDBACK, values: [val('x', 10, 20)] } }),
    );
    assertEqual(mk(cfg.GLOBAL_MIN_FEEDBACK).candidates[0].gates.global, true, '== opens');
    assertEqual(mk(cfg.GLOBAL_MIN_FEEDBACK - 1e-9).candidates[0].gates.global, false, 'below stays shut');
  });

  test('hardening: dimension gate opens at EXACTLY DIM_MIN_FEEDBACK (inclusive)', () => {
    const mk = (dim) => scoreFromAggregates(
      agg(cfg.GLOBAL_MIN_FEEDBACK, { area: { dimDecayed: dim, values: [val('x', 10, 20)] } }),
    );
    assertEqual(mk(cfg.DIM_MIN_FEEDBACK).candidates[0].gates.global, true, '== opens');
    assertEqual(mk(cfg.DIM_MIN_FEEDBACK - 1e-9).candidates[0].gates.global, false, 'below stays shut');
  });

  test('hardening: sample gate is inclusive at MIN_EFFECTIVE_SAMPLE and MIN_DISTINCT', () => {
    const mk = (n, distinct) => scoreFromAggregates(
      agg(cfg.GLOBAL_MIN_FEEDBACK, {
        area: { dimDecayed: cfg.DIM_MIN_FEEDBACK, values: [val('x', n, n, { distinct })] },
      }),
    ).candidates[0].gates.sample;
    assertEqual(mk(cfg.MIN_EFFECTIVE_SAMPLE, cfg.MIN_DISTINCT), true, 'both == pass');
    assertEqual(mk(cfg.MIN_EFFECTIVE_SAMPLE - 1e-9, cfg.MIN_DISTINCT), false, 'n_eff below fails');
    assertEqual(mk(cfg.MIN_EFFECTIVE_SAMPLE, cfg.MIN_DISTINCT - 1), false, 'distinct below fails');
  });

  test('hardening: continuity correction switches OFF at exactly CONTINUITY_N_MAX', () => {
    const run = (n) => scoreFromAggregates(
      agg(cfg.GLOBAL_MIN_FEEDBACK, { area: { dimDecayed: cfg.DIM_MIN_FEEDBACK, values: [val('x', 8, n)] } }),
    ).candidates[0].wilson_lower;
    const plain = wilsonLowerBound(8, cfg.CONTINUITY_N_MAX, { z: cfg.WILSON_Z, continuity: false });
    const cc = wilsonLowerBound(8, cfg.CONTINUITY_N_MAX, { z: cfg.WILSON_Z, continuity: true });
    assert(plain !== cc, 'sanity: the two branches differ at this n');
    assertEqual(run(cfg.CONTINUITY_N_MAX), plain, 'n_eff == max uses the PLAIN formula');
    const justUnder = cfg.CONTINUITY_N_MAX - 0.5;
    assertEqual(run(justUnder), wilsonLowerBound(8, justUnder, { z: cfg.WILSON_Z, continuity: true }),
      'n_eff just under uses the CC formula');
  });

  test('hardening: all-zero rejects give p0 = 0 and lift exactly 0 (never NaN)', () => {
    const out = scoreFromAggregates(
      agg(cfg.GLOBAL_MIN_FEEDBACK, { area: { dimDecayed: cfg.DIM_MIN_FEEDBACK, values: [val('x', 0, 20)] } }),
    );
    assertEqual(out.baseline.area, 0, 'p0 = 0');
    assertEqual(out.candidates[0].lift, 0, 'lift = 0, not 0/0');
    const empty = scoreFromAggregates(agg(0, { area: { dimDecayed: 0, values: [] } }));
    assertEqual(empty.baseline.area, 0, 'empty pool baseline = 0, not NaN');
  });

  // ── Ranking tie-break ladder (§2.8): wilson desc → lift desc → n_eff desc → value asc ──
  test('hardening: equal wilson_lower falls to LIFT (cross-dimension baselines differ)', () => {
    // dim A: x is the whole pool → p0 = 0.5 → lift(x) = 1.
    // dim B: y (2/4) beside z (0/4) → p0 = 0.25 → lift(y) = 2. Same k/n → same wilson.
    const out = scoreFromAggregates(agg(cfg.GLOBAL_MIN_FEEDBACK, {
      a: { dimDecayed: cfg.DIM_MIN_FEEDBACK, values: [val('x', 2, 4)] },
      b: { dimDecayed: cfg.DIM_MIN_FEEDBACK, values: [val('y', 2, 4), val('z', 0, 4)] },
    }));
    const order = out.candidates.map((c) => c.value);
    assertEqual(order[0], 'y', 'higher lift first on equal wilson');
    assertEqual(order[1], 'x', 'lower lift second');
  });

  test('hardening: equal wilson and lift fall to n_eff desc, then value asc', () => {
    // k=0 values: wilson 0 and lift 0 for all → n_eff decides; equal n_eff → value asc.
    const out = scoreFromAggregates(agg(cfg.GLOBAL_MIN_FEEDBACK, {
      a: { dimDecayed: cfg.DIM_MIN_FEEDBACK, values: [val('bb', 0, 4), val('aa', 0, 4), val('big', 0, 8)] },
    }));
    assertEqual(out.candidates.map((c) => c.value).join(','), 'big,aa,bb',
      'n_eff desc first, then value asc for the equal pair');
  });

  // ── Volume artefact: raw-count boundary + reason copy branch ─────────────────
  test('hardening: volume_artefact fires at EXACTLY MIN_REJECTS raw (inclusive), lift ≤ max', () => {
    // One value = whole pool → lift = 1 = VOLUME_ARTEFACT_MAX_LIFT (inclusive edge).
    const mk = (kRaw) => scoreFromAggregates(
      agg(cfg.GLOBAL_MIN_FEEDBACK, {
        area: { dimDecayed: cfg.DIM_MIN_FEEDBACK, values: [val('x', 40, 80, { kRaw, nRaw: kRaw * 2 })] },
      }),
    ).candidates[0];
    const at = mk(cfg.VOLUME_ARTEFACT_MIN_REJECTS);
    assertEqual(at.volume_artefact, true, 'k_raw == min → artefact');
    assert(at.reason.startsWith('High volume'), 'artefact reason names high volume');
    const under = mk(cfg.VOLUME_ARTEFACT_MIN_REJECTS - 1);
    assertEqual(under.volume_artefact, false, 'one below → not an artefact');
    assert(under.reason.includes('× your'), 'normal reason quotes the lift multiple');
  });

  // ── EXCLUDE_PASSES threading through aggregation ─────────────────────────────
  test('hardening: EXCLUDE_PASSES drops pass reactions from BOTH system and dimension counts', () => {
    const now = '2026-06-05T00:00:00Z';
    const rows = [
      { listing_id: 'a', reaction: 'reject', created_at: now, listing_snapshot: { property_type: 'flat' } },
      { listing_id: 'b', reaction: 'pass', created_at: now, listing_snapshot: { property_type: 'flat' } },
    ];
    const incl = buildAggregates(rows, { now, config: resolveConfig({ overrides: { EXCLUDE_PASSES: false } }) });
    const excl = buildAggregates(rows, { now, config: resolveConfig({ overrides: { EXCLUDE_PASSES: true } }) });
    assertEqual(incl.systemDecayed, 2, 'passes counted when included');
    assertEqual(excl.systemDecayed, 1, 'passes dropped from systemDecayed');
    assertEqual(incl.perDimension.property_type.values[0].n_eff, 2, 'pass in the value pool');
    assertEqual(excl.perDimension.property_type.values[0].n_eff, 1, 'pass out of the value pool');
  });

  // ── Defaults: no-opts calls resolve config and the two default dimensions ────
  test('hardening: buildAggregates defaults — resolveConfig() and [area, property_type]', () => {
    const out = buildAggregates([]);
    assertEqual(out.systemDecayed, 0, 'empty input');
    assertEqual(Object.keys(out.perDimension).join(','), 'area,property_type', 'default dimensions');
    const scored = scoreFromAggregates(out); // dimensions default = keys of perDimension
    assertEqual(Object.keys(scored.dimensions).join(','), 'area,property_type', 'score inherits keys');
    assertEqual(runRefinementEngine([]).candidates.length, 0, 'engine no-opts runs clean');
  });
}
