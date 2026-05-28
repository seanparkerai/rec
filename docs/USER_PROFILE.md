# USER PROFILE — about the buyer

> **Note (2026-05-27):** References to `data/profile.json`, `data/criteria.json`, `data/finances.json` in this document are historical. Those files have been removed. User data lives in Supabase — access via `mcp__supabase__execute_sql` or the portal.

The narrative version of the buyer profile (Supabase `profile`, `criteria`, and `finances` tables).

## Who's buying
Solo **first-time buyer**, no dependents. Permanent employment — **£64,000** base salary plus a consistent
**~£3,000** annual bonus. **Excellent** credit profile, no adverse history.

## How we want to live
Countryside living in a **low-population village** — a quiet, rural setting. Hampshire countryside near
**Winchester / Salisbury** is the focus.

## What we're looking for (headline)
A **2–3 bedroom freehold** home (3 ideal) with a **garden** and **off-street parking**, **move-in ready**
(no major works), **EPC C or above**, in a rural Hampshire village near Winchester or Salisbury.

## Budget & finances (headline)
- **Target property price:** up to **£400,000** (plan to offer 5–10% under, e.g. **£380,000**).
- **Deposit:** ~**£38,000** (10%); target overall savings **£50–65k** for deposit + extras.
- **Mortgage:** up to **£360,000**, **35-year** term, **90–95% LTV**, **2-year fixed** preferred,
  ~£1,800–£2,000/month affordable.
- **Moving window:** **March – September 2026**.
- Detailed savings, costs, bills, expenses, shopping list and gift cards live on the Finances page
  (`data/finances.json`).

## Must-haves (deal-breakers)
Freehold · 2+ bedrooms · garden · off-street parking · EPC C or above · countryside/rural setting.

## Nice-to-haves
3 bedrooms · move-in ready · near Winchester or Salisbury · low-population village.

## Hard noes / areas to avoid
Leasehold · EPC below C · properties needing major works (roof / boiler / damp).

## Location focus
Hampshire countryside near **Winchester** and **Salisbury**. The full target list (191 villages across
Hampshire & Wiltshire) is in `docs/AREAS.md` / `data/areas.json`.

## Notes
Comfortable maximising borrowing as salary increases are expected. Keen to keep mortgage/arrangement fees
low. Prefers a short (2-year) fixed rate.

## Search filters (Rightmove / Zoopla settings)

These map 1-to-1 to filters in `data/criteria.json`, ready to apply on listing portals.

- **Location** — own list (191 villages in `data/areas.json`), **1-mile** search radius around each.
- **Price** — **£200,000 – £400,000**.
- **Beds** — **2+** (3 ideal). **Baths** — **1+** (2 ideal).
- **Property types** — Detached & Bungalow (preferred); Semi-detached & Terraced (acceptable).
  Excluded: Flat/Apartment, Park/Mobile home.
- **Tenure** — Freehold only. Excluded: Leasehold, Shared Ownership.
- **Status** — include For Sale and Under Offer/Sold STC. Exclude Retirement and Auction.
  Include New Build. Highlight Chain-Free and Price-Reduced (signals, not filters).
- **Must-have features** — Garden, off-street parking.
- **Nice-to-have features** — Garage, driveway, balcony/terrace, en-suite, conservatory, home office,
  EV charging. Treated as scoring weights, not exclusions.
- **EPC** — **C or above**.
- **Freshness** — added in the last **24 hours**.
- **Include keywords** — `village`, `rural`, `countryside`, `freehold`, `EPC A/B/C`.
- **Exclude keywords** — `leasehold`, `shared ownership`, `retirement`, `auction`, `cash buyers only`,
  `needs modernisation`, `in need of refurbishment`, `investment opportunity`, `mobile home`, `park home`.
