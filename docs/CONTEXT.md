# CONTEXT — Research foundation

Distilled, sourced research that underpins this project. Three parts: **(A)** UK first-time buyer domain,
**(B)** technical architecture, **(C)** Hampshire & Wiltshire region. Figures are as of **2026** and should
be re-checked before relying on them for decisions.

---

## A. UK first-time buyer domain

### A1. End-to-end buying process (England, no chain ≈ 12–16 weeks offer→completion)
1. Prepare finances — credit check, save deposit, get a **Mortgage in Principle (MIP/AIP)**.
2. Search & view (Rightmove, Zoopla, local agents).
3. Make an offer (MIP strengthens it).
4. Offer accepted — legal work begins.
5. Instruct a **surveyor** (survey level depends on property age/value).
6. **Conveyancing / searches** (title, local authority, environmental, drainage).
7. Full **mortgage application**; lender does its own **valuation** (separate from your survey).
8. **Exchange of contracts** — legally binding; completion date set; deposit paid.
9. Final checks / walk-through.
10. **Completion** — funds transfer, keys.
11. Move in & register (council tax, utilities, GP, Land Registry).

### A2. Financials (2026)
- **Deposit:** min 5% (95% LTV); better rates at 10% (90%), 15%+ (85% or below). Avg FTB deposit ≈ £63,855
  on avg price ≈ £243,500. Some 98% LTV products exist (≈£5k–£10k min deposit).
- **Mortgage types:** fixed (2/3/5/10 yr — most popular with FTBs) vs tracker/variable (follows BoE base
  rate + margin). Rate breakpoints at 95/90/85/80/75% LTV. (Early-2026 examples: ~5.4% @95%, ~5.1% @90%.)
- **Stamp Duty (SDLT) — first-time buyer relief (April 2025 rules, current in 2026):**
  - £0–£300,000 → **0%**
  - £300,001–£500,000 → **5%** (on the slice above £300k)
  - **Above £500,000 → no FTB relief**, standard rates apply.
  - Example: £350k → £2,500. (Relief threshold dropped from £625k to £500k in April 2025.)
- **Lifetime ISA (LISA):** open age 18–39, contribute to 50; **£4,000/yr** limit; **25% govt bonus**
  (max £1,000/yr); tax-free; penalty-free withdrawal for a first home **≤£450,000** or after age 60; else
  25% penalty. (A "First-Time Buyer ISA" is slated to replace LISA from April 2028; existing accounts stay.)
- **Other costs (typical ranges):** conveyancing £1,316–£1,744 (+VAT, freehold) / higher leasehold;
  disbursements ~£709; lender valuation ~£452; survey **L1** £300–£380, **L2 (HomeBuyer)** ~£499,
  **L3 (Building)** £630–£1,500+; broker £0–£999; removals £400–£3,500 (avg ~£1,112); Royal Mail
  redirection ~£67/yr. One-off costs excl. deposit & SDLT ≈ **£4,000–£8,500+**.

### A3. Property evaluation criteria
- **Must-haves / deal-breakers:** tenure (freehold preferred; leasehold check lease >80yr, ground rent,
  service charge); EPC (aim D+); structurally sound (survey); mortgageable; council-tax band; utilities.
- **Important:** flood risk; broadband speed; transport links; parking; schools/Ofsted; crime rate.
- **Nice-to-haves:** garden/aspect; amenities; walkability; period character; garage/storage; light/views.

### A4. Free UK data sources / APIs (for future enrichment)
- HM Land Registry **Price Paid** (sold prices) — landregistry.data.gov.uk
- **EPC register** (energy ratings) — open data
- **police.uk** crime data API (JSON) — data.police.uk
- **GOV.UK** long-term flood risk — gov.uk/check-long-term-flood-risk
- **Ofcom** broadband checker — checker.ofcom.org.uk
- **Ofsted** inspection reports — reports.ofsted.gov.uk
- Council tax bands — local council sites.

### A5. Recommended tracker fields
- **Savings tracker:** targetDeposit, targetPrice, depositPct, currentSaved, monthlyContribution,
  startDate, targetDate, lisaContribYTD, lisaBonusYTD, contributions[] {date, amount, source},
  progressPct (derived), monthsRemaining (derived), projectedCompletion (derived), onTrack flag.
- **Property comparison:** address, postcode, listingUrl, askingPrice, sdltEstimate, surveyCost,
  conveyancingEstimate, totalPurchaseCost, councilTaxAnnual, mortgageNeeded, ltv, monthlyPaymentEstimate,
  type, beds/baths, sqm, tenure (+lease details), yearBuilt, condition, epc, garden/parking,
  floodRisk, broadbandMbps, crimeRate, nearestSchool/ofsted, nearestStation/minutes, priorityRank,
  decisionStatus, notes.

---

## B. Technical architecture

| Concern | Choice | CDN / note |
|---|---|---|
| Structure | Multi-page HTML + **fetch-and-inject partials**, vanilla JS | No build step; each page plain HTML; shared `components/` mounted by `components.js`. |
| Styling | **Pico CSS** + custom design tokens | `https://cdn.jsdelivr.net/npm/@picocss/pico@2/css/pico.min.css` — ~10KB, semantic, dark mode, themeable via CSS custom props. |
| Charts | **Chart.js** | `https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js` — ~60KB, line/bar. |
| Maps | **Leaflet + Leaflet-Geoman (free)** | Leaflet `@1.9.4`; Geoman `@geoman-io/leaflet-geoman-free@2` — polygon draw/edit (Leaflet.draw is unmaintained). **OSM tiles** `https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png` (respect usage policy + attribution). |
| Data | **JSON files + `localStorage`** behind `storage.js` | Git-tracked content as JSON; user edits persist client-side; future backend swaps one module. |
| Validation/Tests | **`tests.html`** + tiny assert + JSON schema checks | No npm. Schema drift, broken-link, calculator benchmarks. |

**Storage abstraction principle:** all reads/writes go through `storage.js`. Today it reads JSON from
`data/` and persists overrides to `localStorage` (keyed per dataset). Later, swap the implementation for
`fetch('/api/...')` without touching pages. Keep methods like `getProfile()`, `saveProfile()`,
`getAreas()`, `getFinances()`, `saveFinances()`.

**Partials principle:** pages include `<div data-include="/components/header.html"></div>`; `components.js`
fetches and injects them on `DOMContentLoaded`, then marks the active nav link and wires the theme toggle.

---

## C. Hampshire & Wiltshire region

### C1. Sub-regions & towns (seed; expand in Phase 3 — see docs/AREAS.md)
- **Hampshire:** *Winchester & Downs* (Winchester, Alresford, Cheriton, Colden Common); *Test Valley*
  (Andover, Romsey, Stockbridge, Whitchurch); *East Hants* (Petersfield, Alton, Chawton); *New Forest*
  (Lyndhurst, Brockenhurst, Lymington, Beaulieu, Sway, Milford-on-Sea); *South Coast* (Fareham, Emsworth);
  *North/urban* (Basingstoke, Eastleigh, Chandler's Ford).
- **Wiltshire:** *Salisbury & south* (Salisbury, Wilton, Tisbury, Mere, Broad Chalke); *Plain/centre*
  (Amesbury, Tidworth, Bulford, Ludgershall, Larkhill); *Marlborough Downs/Pewsey* (Marlborough, Pewsey,
  Aldbourne, Avebury); *West/NW* (Chippenham, Trowbridge, Westbury, Melksham, Calne, Corsham); *North*
  (Cricklade, Royal Wootton Bassett).
- **Border belt:** Andover ↔ Tidworth ↔ Amesbury triangle (dual-county commuter zone).

### C2. Characteristic house types by area
- **Rural chalkland (both counties):** thatched **cob** cottages; **flint-and-brick** cottages; chalk-cob
  boundary walls; linear thatched settlements along chalk streams.
- **Market towns (Salisbury, Marlborough, Winchester):** **Georgian** townhouses, period townhouses.
- **Test Valley / New Forest:** thatched & Edwardian cottages, farmsteads, period townhouses (Lymington).
- **General stock:** **Victorian/Edwardian terraces**, **1930s semis**, post-war estates, modern
  **new-build** estates, bungalows.
- **Military areas (Tidworth/Bulford/Ludgershall):** Victorian/Edwardian barracks + modernised **Service
  Family Accommodation (SFA)** and new estates.

### C3. Town/village profile framework (the 9 categories used per area)
1. Overview & character (county, sub-region, identity, landmarks)
2. Local vibe & community
3. Amenities & services (shops, GP, leisure)
4. Transport & commute (rail/bus/road; times to London, Southampton, Salisbury, Bath/Bristol)
5. Housing & property (dominant types, average prices, trends)
6. Schools & education (names, Ofsted, catchments)
7. Lifestyle & things to do (countryside/AONB, coast, culture)
8. Pros & cons (buyer perspective)
9. Who it suits (families / commuters / retirees / WFH / outdoors)

### C4. Reputable content & imagery sources (use during content creation)
- Listings/prices: **Rightmove**, **Zoopla** (area guides, sold prices, school/transport panels).
- Lifestyle/area guides: **Garrington (South)**, **Muddy Stilettos**, **iLiveHere** (resident reviews).
- Official stats/planning: **ONS** housing, **Wiltshire Council**, **Hampshire County Council**.
- Transport: **South Western Railway**, National Rail.
- Tourism: **Visit Hampshire**, **Visit Wiltshire**, **New Forest** guides.
- **Images (licence-safe only):** Wikimedia Commons, Geograph (CC BY-SA), Unsplash, official tourism —
  download into `assets/img/`, record `credit` + `licence`.

---

## Key sources
UK buying: Rightmove guides; GOV.UK (SDLT, LISA, flood); MoneyHelper; MoneySavingExpert (LISA); Unbiased
(deposits); Compare My Move / HomeOwners Alliance (fees & surveys). Data: landregistry.data.gov.uk,
data.police.uk, checker.ofcom.org.uk, reports.ofsted.gov.uk. Tech: picocss.com, chartjs.org, leafletjs.com,
geoman.io, jsdelivr.com, OSM tile usage policy. Region: Rightmove/Zoopla area guides, Garrington, Muddy
Stilettos, ONS, Visit Hampshire/Wiltshire, Wikimedia Commons, Geograph.
