# Phase-3 IA & navigation proposal (step 3.1 — for ⚙ owner design review)

> Authored 2026-07-01 by Fable from the Phase-2-complete codebase (12 pages + `index.html` +
> the admin `/live-feed/` kiosk; 11-item burger drawer). Owner decisions recorded in
> [`04-program.md`](04-program.md) frame everything here: **rethink IA, rebuild page-by-page on
> the existing token/shell/CSS foundations**; north star **feed quality + trust in numbers**;
> **cut nothing**. Build starts only after this review — steps 3.2–3.3 (shell resilience,
> token fallbacks) are IA-independent and proceed meanwhile.

## 1. The thesis (what's wrong, in one paragraph)

Real use is a phone, and the daily loop is **check new listings → react → occasionally open a
dossier or an area → glance at money/readiness**. Today that loop lives 2–3 taps deep behind a
burger drawer with 11 flat items, while the home screen spends its most valuable viewport on
12 equal-weight tiles. The IA should put the loop's 4 destinations under the thumb, collapse
the three listings views (Browse/Saved/Rejected) into one surface, and make the dashboard lead
with the verdict + next action instead of a tile wall.

## 2. Proposed navigation model (mobile-first)

- **Bottom tab bar on phones (<768px), 5 slots:** `Home · Properties · Areas · Money · More`
  — fixed, safe-area-inset aware, 44px+ targets, `aria-current` marking. The burger drawer
  survives inside **More** (Ask, Journey, Profile, Trends, Live feed, sign-out, theme).
- **≥768px:** the tab bar yields to the existing header + drawer (unchanged pattern, denser
  viewport can afford it) — one component, CSS-gated.
- **Properties = Browse | Saved | Passed** as segmented views of ONE surface (`listings.html`
  hosts the segments; saved-listings/rejected keep their URLs as redirect/anchor targets so
  bookmarks + `data-nav` history survive — no capability cut, a merge).
- **Ask** stays a page (in More) but gains a persistent affordance on Home ("Ask about
  this…" entry point). Not a floating overlay — calm-precise says no FAB clutter.

## 3. Per-page wireframe note + anchor (one line each)

| Surface | Anchor | Mobile-first wireframe note |
|---|---|---|
| Home (`index.html`) | Linear-dense | Lede = verdict strip (readiness + new-since-last-visit count → taps into Properties), then 3 bands: **Act** (next best action, new listings), **Money** (deposit arc, affordability), **Track** (journey, shortlist); tiles ranked, not equal. |
| Properties (`listings.html`) | Linear-dense | Segmented Browse/Saved/Passed; card = photo-led, price+beds+fit-dot on one line, thumb-zone reaction row; controls in a filter sheet, not a toolbar. |
| Property dossier | Stripe-docs | Hero gallery (lazy, srcset), sticky action bar (react/save/rate) at the thumb, collapsible sections, "why am I seeing this" membership chips. |
| Areas + map | Linear-dense | Map first at 100dvh-minus-chrome with a draggable list sheet; picker (with the 2.19 Home toggle) reachable in one tap. |
| Area detail | Stripe-docs | Editorial dossier unchanged in spirit; sticky mini-TOC; prices matched to criteria stay above the fold. |
| Money (`finances.html`) | Linear-dense | Verdict first (can/can't + headroom), calculators as collapsible stages, charts sized to container queries with SVG title/desc. |
| Profile | Stripe-docs | Inline-edit field groups; Areas section = the shared picker; first-run banner until real data. |
| Journey | Stripe-docs | Vertical timeline, current stage pinned; ticks write journey_progress as today. |
| Ask | Stripe-docs | Chat column, composer pinned above the keyboard (dvh), Messages dialog unchanged. |
| Trends (`refinement.html`) | Linear-dense | Kept as-is this phase beyond shell/a11y passes (engine UI is Phase 4's surface). |
| Rejected/Saved pages | — | Become segment views of Properties (URLs preserved). |
| Login / live-feed kiosk | — | Untouched (kiosk is admin-only signage). |

## 4. What this deliberately does NOT change

Tokens, type ramp, palette, Pico v2 base, the shell-injection architecture (hardened in 3.3,
not replaced), auth-guard, storage layer, any URL. No page is deleted (owner: cut nothing) —
Saved/Rejected fold into segments but keep their addresses.

## 5. ⚙ Owner review — the four decisions (per §7.0: recommendation first)

1. **Bottom tab bar on phones?** (a) **Yes, 5 tabs as proposed** *(recommended — puts the
   daily loop under the thumb; the single highest-leverage mobile change)*; (b) No — keep
   burger-only, just re-order the drawer. Consequence: (a) adds one new shell component +
   per-page padding-bottom; reversible by CSS.
2. **Merge Browse/Saved/Passed into one Properties surface?** (a) **Yes, segments**
   *(recommended — one mental place for properties; kills two top-level pages without cutting
   anything)*; (b) No — three separate pages as today. Consequence: (a) reshapes 3.4's build
   and simplifies nav; URLs survive either way.
3. **Home lede:** (a) **Verdict strip + ranked bands (Act/Money/Track)** *(recommended —
   at-a-glance precedence per the dashboard's own §10.2 goals)*; (b) keep the current
   equal-tile bento, restyled only. Consequence: (a) is a rebuild of index.html's grid order;
   data/tiles all survive.
4. **Tab-bar slot 4:** (a) **Money** *(recommended — trust-in-numbers is the #2 north-star
   axis)*; (b) Ask; (c) Journey. Consequence: whichever loses lives in More — one tap further.

Everything else above I treat as within the already-granted redesign latitude; correct me
where taste differs. On approval, 3.4–3.9 expand to atomic steps honouring these answers.
