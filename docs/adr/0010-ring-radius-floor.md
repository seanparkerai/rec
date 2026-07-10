# 0010. The drawn ring is the coverage floor — learned radii may only widen scope

Date: 2026-07-10

## Status

Accepted (owner directive, 2026-07-10: "if any single property is covered by a ring and
becomes available within my limits — it should become visible to me with no exceptions").

## State / rail

The radius learner's persistence plan (`assets/js/refinement/radius-persistence.js`
`planRadii`), the shared read-side tuning overlay
(`tools/lib/geofence-universe.mjs` `applyRadiusTuning` + `ringFloorInputs`), the fetcher
(`tools/fetch-listings.mjs`), the nightly coverage sentinel
(`tools/audit-listing-coverage.mjs` — the §16 mechanical rail whose enforced radius this
ADR changes), and the rails that pinned the old auto-shrink behaviour:
`tests/unit/refinement-radius.test.js`, `tests/unit/radius-hardening.test.js`,
`tests/characterization/fetch-targets.test.js`.

## Context

The per-area radius learner (2026-06 refinement engine) **auto-applied** its learned
radii to `area_search_tuning` — shrinking both the paid Apify search disk and the
membership geofence — as a cost/noise optimisation, gated only on a like-count
confidence threshold. Meanwhile the Areas map draws each area's ring from
`criteria.location` (per-area override → household global `searchRadiusMi` → 3 mi
default) and **never reads the tuning table**. By 2026-07-10 the learner had silently
shrunk four actively-held areas to 0.76 / 1.44 / 1.62 / 2.87 mi while their drawn rings
stayed at 3 mi: **567 in-DB listings sat inside drawn rings with no membership row**, so
they never reached the household feed — and the coverage sentinel blessed the state
because its drift check used the same shrunken radii. The ring the user sees and the
coverage the pipeline delivers had no mechanical connection.

## Decision

**The drawn ring is the user's trust surface, and it is the floor.** An
autonomously-applied radius (search disk, geofence scalar, every directional petal) may
never fall below the ring radius the map displays for that area — it may only widen
scope. Tightening below the ring requires user consent: the learner's honest
recommendation survives in `recommended_radius_mi` and in the per-household **tighten
suggestion**, and Apply (`tightenRadiusBoth`) moves the drawn ring *and* pins
`override_radius_mi` in one action, keeping ring == pipeline. A user pin is therefore
exempt from the floor.

Enforced at three independent layers:

- **Write side** — `planRadii` floors every non-pinned tuning upsert at
  `ringRadii[areaId] ?? defaultRingMi` (drivers derive both from live criteria rows via
  `ringFloorInputs`; a bundle/read without criteria floors at the 3 mi default ring).
- **Read side** — `applyRadiusTuning` applies the same floor when the universe is
  built, so the fetcher, backfills and importers never scrape or stamp below the ring
  even if a stale shrunken tuning row survives.
- **Rail** — the nightly coverage sentinel's membership-drift radius is
  `max(learned/native, ring)` (pin exempt), so any regression is a red run, not a
  silent hole.

The live shrunken rows were repaired (radii restored to the 3 mi ring) and the 567
missing junction rows backfilled in the same session.

## Consequences

- A property inside a drawn ring, within the household's limits, is fetched, stamped
  and fed — or the sentinel goes red. The map is now mechanically honest.
- The learner keeps its value as a *recommender* (suggestions still surface tightens),
  but paid-search savings from auto-shrink are forgone until the user consents — the
  owner explicitly chose trust over spend.
- The exploration-ring cadence is unchanged (it only ever widens to `RADIUS_CEIL_MI`);
  with ring == ceil == 3 mi it is currently a no-op, and remains correct if the ceiling
  is ever raised.
- Raising a household's global display radius above 3 mi now widens the scrape and the
  sentinel check automatically (the floor follows the widest household ring).
