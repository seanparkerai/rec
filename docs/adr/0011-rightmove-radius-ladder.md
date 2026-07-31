# 0011. Rightmove's search radius is an enum — snap UP onto the ladder, never down

Date: 2026-07-31

## Status

Accepted (coverage audit, 2026-07-31 — owner report: "I'm seeing a vastly larger number of
listings coming from Wimborne/Dorset than from my own areas").

## State / rail

`tools/fetch-listings.mjs` (`RIGHTMOVE_RADII`, `snapRadiusUp`, `buildSearchUrl`,
`CLUSTER_CAP_MI`), the new rail `tests/contract/fetch-radius.test.js`, and
`.github/workflows/fetch-listings.yml` (`cluster_cap_mi` default). Adjacent, unchanged:
`tools/audit-listing-coverage.mjs` (the sentinel measures membership *after* the fetch, so
it could not see this), ADR 0010's ring floor (a *geofence* rule, also downstream of the
fetch).

## Context

Rightmove's `radius` search parameter is an **enum**, not a free number: the search form
only ever emits `0 / 0.25 / 0.5 / 1 / 3 / 5 / 10 / 15 / 20 / 30 / 40`. An off-ladder value
is rejected and the search returns **zero results** — silently, with an HTTP 200 and an
empty result page. This is the same class of trap already documented and handled for
`maxDaysSinceAdded` (which accepts only 1/3/7/14, "any other value returns 0 results"), but
the radius parameter was never given the same treatment.

Cluster mode computes a **geometric** disk radius — `max(distance(seed, member) +
member.searchRadiusMi)`, capped at `CLUSTER_CAP_MI` — which almost never lands on a ladder
value. In the 2026-07-31 production universe (187 demand areas, 56 cluster targets),
**36 of 56 targets emitted an off-ladder radius** (3.4, 4.3, 4.5, 4.6, 4.7, 4.8, 5.1, 5.2,
5.3, 5.4, 5.7, 6.0, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.9, 7.0 mi) and therefore returned
nothing on every run. Only the **lone-village disks — which sit at exactly 3.0mi, a ladder
value — were ever really searched.**

Measured coverage before the fix: an area's centre sat inside a disk Rightmove would
actually honour for only **40 of the household's 180 active areas (22%)** —
**Dorset 71%, Hampshire 26%, Wiltshire 13%**. That asymmetry is the whole of the owner's
report: the recently-added Dorset areas are geographically isolated, so they became
lone-village 3.0mi disks that worked, while the dense Hampshire/Wiltshire village clusters
merged into multi-village disks that did not.

Three properties of the failure made it invisible to every existing guard:

1. **It looks like a quiet market.** A broken target logs `raw 0 → in-buffer 0 → unique 0`,
   identical to a genuinely empty rural search. The run exits green.
2. **The truncation sentinel is the wrong end of the range.** It fires when a target *fills*
   the result cap; a target returning zero is the silent case, and nothing watched for it.
3. **The coverage sentinel runs downstream.** `audit-listing-coverage.mjs` reconciles
   `listings` against `listing_areas` and the feed — it can only audit listings that were
   fetched. A listing never fetched is not drift; it is absent, and the audit was clean
   (0 membership drift, 0 unexplained residue) throughout.

The evidence is empirical rather than documentary (Rightmove is unreachable from the
sandbox, and the enum is not published). The decisive observation is internal and does not
depend on knowing the exact ladder: `PO14:stubbington-hampshire+4` (r=6.0mi) geometrically
**contains** `SO31:locks-heath-hampshire+0` (r=3.0mi, 3.6mi from the seed) and ran with the
same price band, beds floor and recency window on the same runs — yet returned `raw 0` on
every run while the contained disk returned 4, 7 and 8. A strictly larger disk over the
same market cannot return strictly fewer listings unless its query was rejected.

## Decision

**Every radius the fetcher puts on the wire is snapped UP onto the Rightmove ladder.**

- **Up, never down.** Rounding down would shrink the searched disk below the geometry the
  cluster was built to cover and silently drop listings — precisely the failure class ADR
  0010 and the coverage sentinel exist to prevent. Rounding up only widens the *paid*
  search; the coordinate geofence still decides membership, so a wider disk costs a few
  more discarded results but can never admit an out-of-ring listing.
- **The snap lives in `buildSearchUrl`, not in target assembly.** `target.radiusMiles` stays
  the true geometric radius (it is what the logs, the cluster invariants and the
  characterization golden master reason about); only the emitted URL is quantised. This
  keeps the wire format a serialisation concern.
- **`CLUSTER_CAP_MI` defaults to 5, itself a ladder value** (was 7). At a cap of 7 every
  full cluster would snap to the next rung, 10mi — four times the area, all of it trimmed
  back by the 3mi geofence and all of it billed. A cap of 5 makes a full cluster snap to
  exactly 5. Cost note: this raises the daily target count from 56 to 100 (~3mi:51,
  ~5mi:49). Apify bills per *result*, and tighter disks return far fewer
  fetched-then-discarded results, so this is the cheaper of the two; if per-actor-start cost
  ever dominates, `cluster_cap_mi=10` is the ladder-valid way to trade back.

Coverage after the fix: **180/180 areas (100%)** in every county, with zero off-ladder radii
emitted.

## Wave 2 — the snap alone still left zero slack

Re-auditing after the snap shipped, a **ring-point probe** (every area, 97 points each:
centre plus 24 bearings at 4 shells of the 3mi ring — 18,139 points over the live
universe) found **22 areas with ring points outside every search disk**, and a
worst-case single-disk containment margin of **0.00mi**. The snap had made the radii
legal but left the geometry exactly flush.

Two causes, both structural:

1. **Offset centres.** A disk is centred on the seed's Rightmove `POSTCODE^` point — a
   postcode centroid that `tools/resolve-areas.mjs` obtains by *reverse-geocoding the
   stored village coords* — while the geofence ring is centred on those coords
   themselves. In rural Hampshire/Wiltshire the nearest postcode unit's centroid sits a
   few hundred metres to ~1.5km away. The two circles are concentric only by accident.
2. **Zero-margin geometry.** `clusterVillages` sets `radius = max(distance(seed, member)
   + member.searchRadiusMi)`, so every member's ring is exactly flush with the disk
   edge; a lone village gets `radius === its own ring`. Equal radii + offset centres
   leaves a crescent of every ring permanently unsearched.

**Decision:** a `SEARCH_MARGIN_MI = 1` centre-offset allowance is added *before* the
snap (`wireRadiusFor()`), so the searched disk **strictly** contains the ring. One mile
comfortably exceeds any reverse-geocode offset and also absorbs the fact that
Rightmove's own distance metric cannot be verified from here. Because it is applied
before quantisation it usually costs nothing beyond the rung the snap would have picked
anyway; the visible change is that a lone 3mi village now goes on the wire at 5mi
instead of 3mi. Re-probed after the change: **0 uncovered points, worst-case margin
+2.00mi, every ring contained by a single disk.**

A second latent hole was found and instrumented rather than changed: in cluster mode an
outcode containing even one village without a tight identifier is demoted to a single
whole-outcode search carrying **no radius**, which returns only listings filed inside
that outcode — so every village whose ring crosses the district boundary loses its
cross-border coverage silently. Every area resolves tight today, so this never fires;
a **coarse-fallback sentinel** now names the offending outcodes and areas in the run log
if it ever does.

## Live confirmation

The first production run on the fixed build wrote new listings into
`bemerton-sp2`, `wilton-sp2`, `broad-chalke-sp5`, `stockbridge-so20` and `upham-so32`
within minutes — all of them multi-village cluster members that had returned `raw 0` on
every run for weeks (the Salisbury SP1/SP2 areas had taken no new listing since
2026-07-17). This is the empirical confirmation the sandbox could not obtain directly,
since Rightmove is unreachable from it.

## Consequences

- A new §16-class mechanical rail, `tests/contract/fetch-radius.test.js`, pins the ladder
  itself, the never-shrink property across the 0–45mi range, the exact set of geometric
  radii production was emitting when the bug was found, and that `CLUSTER_CAP_MI` stays a
  ladder value. Changing the ladder now requires a deliberate diff against the live search
  form.
- Foundation (standing-stock) pulls roughly double in worst-case cost, since the target
  count nearly doubled while `RESULTS_PER_OUTCODE` is unchanged. The dry-run-first protocol
  for foundation runs is unchanged and still mandatory.
- The pre-fix `listings` corpus is **not** representative: roughly four-fifths of the
  household's areas were never searched, so the standing stock for Hampshire and Wiltshire
  villages is missing everything listed since cluster mode was introduced that was not
  incidentally caught by an overlapping 3.0mi disk. A foundation backfill is required to
  recover it; that is a separate, owner-approved, budgeted phase.
- **Open (not addressed here):** no listing is ever archived — 0 of 1551 rows carry
  `archived_at` and 721 have not been re-seen in 30+ days, because the daily run uses a
  1-day recency window and so never revisits standing stock. The feed therefore accumulates
  sold/withdrawn properties indefinitely. Logged for its own phase.
