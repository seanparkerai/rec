# Phase 0 probe findings — Apify actor + spend levers

**Run 2026-08-27** via `.github/workflows/probe-rightmove.yml` (probes H and P, both free).
Source: `tools/probe-rightmove-params.mjs`. Raw logs: Actions runs `33112549187`, `33112753638`.

These are **observed facts from the live account and actor**, not inference. They replace the
assumptions previously encoded in `tools/fetch-listings.mjs` and `tests/contract/fetch-spend.test.js`.

## 1. The actor's real input schema

`dhrumil/rightmove-scraper`, `defaultRunOptions`:
`{"build":"latest","timeoutSecs":0,"memoryMbytes":256,"maxItems":null,"maxTotalChargeUsd":null,"restartOnError":true}`

| Field | Type | Default |
|---|---|---|
| `listUrls` | array | — |
| `propertyUrls` | array | `[]` |
| `monitoringMode` | boolean | `false` |
| `deduplicateAtTaskLevel` | boolean | `false` |
| `fullPropertyDetails` | boolean | `false` |
| `includePriceHistory` | boolean | `false` |
| `includeNearestSchools` | boolean | `false` |
| `enableDelistingTracker` | boolean | `false` |
| `addEmptyTrackerRecord` | boolean | `false` |
| `email` | string | `""` |
| `maxProperties` | integer | **`1000`** |
| `proxy` | object | `{"useApifyProxy":true}` |

## 2. Verdict on what the repo currently sends

`buildActorInput()` (`tools/fetch-listings.mjs:512`) sends `maxItems`, `maxBudget`,
`monitoringMode`, `includePriceHistory`.

| Field | Verdict |
|---|---|
| `maxItems` | **NOT IN SCHEMA — silently ignored.** `RESULTS_PER_OUTCODE`, pinned by the spend rail as one of "the two cost levers" and set to 1000 by the workflow, **does nothing**. |
| `maxBudget` | **NOT IN SCHEMA — silently ignored.** The `$25` cap the comments call "no overrun possible" has **never applied**. The real lever is `maxTotalChargeUsd`, a **run option** (currently `null`), not an input field. |
| `maxProperties` | ACCEPTED, default **1000**. Never set by the repo — so the effective per-search cap has always been 1000. |
| `fullPropertyDetails` | ACCEPTED, default **`false`**. **Good news:** the feared 5× multiplier was never being paid. Pin it explicitly anyway — never rely on a default for a 5× charge. |
| `monitoringMode` | ACCEPTED, default `false`. |
| `includePriceHistory` | ACCEPTED, default `false`. Correct as-is. |

**No hidden multipliers after all:** `memoryMbytes` is already 256 (no memory scaling) and the proxy
default is `useApifyProxy` (datacentre, not the 5× residential group). Both earlier worries are closed.

**New lever discovered, not in any prior research:** `deduplicateAtTaskLevel` (boolean, default
`false`). Directly relevant to the duplicate-billing problem — needs a paid probe to establish
whether it dedupes *before* billing or merely at output.

## 3. The number that matters

```
account: SeanParker   plan=STARTER   maxMonthlyUsageUsd=50
monthlyUsageUsd: 80.066
```

The actor's last run was **2026-08-06**; since then every call returns:

```
HTTP 403  { "error": { "type": "platform-feature-disabled",
                       "message": "Monthly usage hard limit exceeded" } }
```

**This is deliberate — the owner capped Apify spend on purpose while this model is designed.**

But the usage figure is the finding: **~$80 burned between 1 and 6 August — roughly $13/day, a
~$400/month run-rate** for the current design. That is the baseline the new model must beat, and it
justifies the whole exercise on its own.

It also means the **only working spend cap in the entire system is an Apify account setting that
appears nowhere in this codebase.** Every in-repo cap is inert.

## 4. Why three weeks of total failure was invisible

Worth fixing regardless of the deliberate pause, because the same blindness will hide the next real
outage:

1. The `pg_cron → workflow_dispatch` runs are the ones that actually fetch. All of them fail
   (`105/105 targets FAILED`, `raw 0 · written 0`).
2. The GitHub `schedule` backstop runs short-circuit on the once-per-slot gate, so they report
   **success without attempting anything** — a green tick over a fetcher that fetched nothing.
3. `dispatch-sentinel.yml` asserts only that a dispatch **ran** in the trailing 26h, not that it
   **succeeded**. It has been passing throughout.
4. `apifyCall()` raises `apify HTTP ${res.status}` and **discards the response body** — which is
   why the cause read as an opaque 403 rather than "Monthly usage hard limit exceeded".

Fixes: surface the response body in the thrown error, and make the sentinel assert a *successful*
fetch with `written > 0`, not merely a dispatch.

## 5. Still unverified — needs spend, deferred until the owner re-enables it

| Probe | Question | Blocks |
|---|---|---|
| J | Does `monitoringMode: true` make run 2 bill only new listings? | The single largest saving in the plan |
| I | Does a valid zero-result search cost anything? | Whether empty outcodes are free |
| K | Does `fullPropertyDetails: false` return enough text for the keyword gate? | The period/Georgian/cottage filter |
| A | Does an exact `minPrice == maxPrice` band work? | Both of Luke's searches |
| F | Are two adjacent outcodes disjoint? | Invariant I1 |
| — | Does `deduplicateAtTaskLevel` dedupe before billing? | New; possible extra saving |

Run them with `probes=J,I,K,A,F` in `.github/probe-request.txt` once spend is on. Total cost of the
full set is well under $1.

**What can proceed without spend:** everything in §2 is definitive, so the `buildActorInput` fix,
the `search_profiles` schema, the query planner, the UI and the admin panel are all unblocked. Only
the *verification* of monitoring behaviour waits.
