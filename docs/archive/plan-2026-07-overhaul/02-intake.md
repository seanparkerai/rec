# Intake — §7 Q&A standard · §8 global conventions

> Split from `fable_refactor.md` (2026-07-01, content unchanged). Directory: [`plan/README.md`](README.md).

## 7. Q&A intake — the context-gathering interrogation

After the scan and before re-planning, Fable runs a structured Q&A with the owner. The goal is to
extract aspirations, taste, and constraints the code cannot reveal. Use `AskUserQuestion` for the
choices; capture free-form context in prose. Record every answer **inline in this file** under each
segment so the program is self-documenting. This is the "abundance of context and aspirations" the
owner wants to provide before the plan is overhauled top to bottom.

**7.0 The question & feedback standard (owner-directed — read before asking anything).**
The owner wants to give *super-specific* feedback on the **assumptions and decisions Fable is
considering** — so the quality of the questions is what unlocks the quality of the answers. Every
question Fable puts to the owner (here, and throughout the program via `AskUserQuestion`) must meet
this bar:

- **Surfaces a real, named decision or assumption.** Don't ask "what do you think?" Ask about the
  *specific* fork you're standing at, and put your current leaning on the table so the owner can
  confirm or correct it: "I'm assuming the dashboard should lead with *readiness*, not *money* — is
  that right?"
- **Easy to read.** One decision per question. Short. Plain language. Lead with the question, then the
  context — never bury the ask under a wall of preamble.
- **Easy to answer.** Offer 2–4 concrete options, each a sentence the owner can simply pick, with the
  **trade-off stated** ("faster but less transparent" vs "shows the working but busier"). Put your
  **recommended** option first and say *why*. Always leave room for "something else."
- **Shows the consequence.** Say what changes downstream depending on the answer, so the owner can
  weight their effort. Flag cheap-to-reverse decisions as such ("we can change this later") so the
  owner doesn't over-deliberate a small call.
- **Carries your reasoning.** Briefly show the assumption behind the options ("because you ranked
  trust-in-numbers highest, I'm leaning toward showing the calculation") so the owner can correct the
  *premise*, not just the choice.
- **Batched sensibly.** Group related decisions into one `AskUserQuestion` set; don't drip trivial
  questions one at a time, and don't dump twenty at once. Reserve prose for open-ended aspirations.

*Worked example of a good question:* "**For the listings feed, should a poor *affordability* fit hide
a property outright, or just rank it lower?** Today it's a hard gate — over-budget homes never appear.
(a) **Keep the hard gate** *(recommended — keeps the feed honest about what you can actually buy)*;
(b) Soft — show them, clearly flagged 'over budget', ranked last; (c) A toggle you control. This
changes how aggressive the feed feels and whether you ever see 'stretch' homes." — one decision,
plain, optioned, recommended-with-reason, consequence shown.

The goal: the owner reads a question in ten seconds and gives a precise, confident answer — because
Fable did the work of *framing* the decision, not just raising it. This standard governs the §10
per-segment Q&A sets too: rewrite any thin question to meet it before asking.

**7.1 Global / cross-cutting questions**
- What does "a new standard" mean to *you* here — speed, beauty, trust in the numbers, less manual
  work, delight, something else? Rank them; the ranking sets the program's optimisation target.
- Which **single page** do you use most, and which frustrates you most? (Sets the first target.)
- Are there pages or features you'd **cut** entirely if it sharpened the rest?
- Risk tolerance: bias toward bold rebuilds (more upside, more review) or conservative, invisible
  refactors (safer, slower)? Per segment, not just globally.
- How much do you want to **see** the machinery — the learning model's reasoning, the finance
  assumptions, the fit scores — vs. trust a clean verdict? (Drives transparency vs. minimalism.)
- Any hard deadlines, life events, or buying milestones the program should be paced around?
- Brand & voice: keep the current "calm precise editorial" direction, or evolve it? Reference sites/
  apps you love that should influence the new standard?
- Device reality: which devices do you *actually* use this on, in which orientations?
- Guard rails (§4): any part of the spine you're nervous about us touching, or eager to see rebuilt?
- Tests (§5): how much do you trust the current numbers/behaviour today — where do you double-check by
  hand? (Those are the behaviours the new tests must pin first.)
- What in the current system do you **never want changed** — the things that already feel right?

**7.2 Per-segment questions.** Each deep-dive (§10) ends with a tailored question set. Run them
segment-by-segment as you reach each one, not all upfront — context is freshest then.

**7.3 Output of intake.** A prioritised, sequenced backlog replacing the §10 "opportunities" stubs;
an agreed order of attack across segments; the guard-rail redesign decisions (§4); and the shape of
the new test apparatus (§5) — all recorded in §9.

---

## 8. Global conventions Fable must hold throughout

These are the *current* conventions. They are excellent and should be the floor for the new standard;
where §4 lets you raise them (e.g. evolving the token system or the design anchors), do so deliberately
and update the governing doc — never drift silently below them.

- **Design anchors (`DESIGN.md` §1).** Every view is *Stripe-docs* (editorial, content-led) or
  *Linear-dense* (data-rich UI) — never both, never neither. Name the anchor in every UI commit.
- **Tokens only.** No hard-coded hex, type px, or off-scale spacing in component CSS — everything via
  `tokens.css` custom properties (`--space-*`, `--text-*`, `--rec-*`, `--focus-ring`).
- **The five rules of the overhaul (`DESIGN.md` §5).** At-a-glance precedence; no isolated
  calculators; always-show-then-explain; no graphic without a verdict; visual cues replace text.
- **Responsive doctrine (`DESIGN.md` §6).** Mobile-first; `min-width` breakpoints 480/768/1024/1280;
  no transition in the iPad 600–800 band; `dvh`/`svh` not `vh`; container-queries for components; no
  inline styles; ≥44×44 targets. Mechanically enforced by `tools/lint-responsive.mjs` (to be upgraded
  to semantic rules under §5.2).
- **Accessibility floor (`CLAUDE.md` §11).** WCAG 2.2 AA: contrast, focus-visible never obscured,
  landmarks + skip-link, labelled forms, no colour-only signals, `<dialog>` for modals, reduced
  motion honoured. AA is the floor; aim higher where cheap.
- **Pico v2 conventions (`CLAUDE.md` §12).** Semantic HTML first; theme via `--pico-*` variable
  overrides, not source edits; dark mode via `data-theme` attribute.
- **Module layout (`CLAUDE.md` §19).** Small single-purpose modules; thin `page-*.js` coordinators;
  CSS mirrors the JS structure. Keep new code in this shape (or, under §4, propose a better one and
  migrate wholesale).
- **Content accuracy (`CLAUDE.md` §7).** Area/house content only after place- and type-specific web
  research, with `sources[]`. Never auto-generate. Only openly-licensed imagery, credited + licensed.
- **The feature-description standard (§6).** Every behaviour you ship is described and vetted to §6.

### 8.1 External validation — process (G1–G5)

The validation review confirmed the document's process choices and recommends making a few of them
**mechanical** rather than prose:

- **G1 — Trunk-based development:** Confirmed (DORA research). **Add:** enforce **branch protection +
  required green CI on `main`**, and treat **every merge as deployable** (GitHub Pages deploys on push).
- **G2 — ADRs:** Confirmed (Michael Nygard, 2011). **Add:** create **`docs/adr/NNNN-*.md`** with a
  standard template + `status` field, and **map every guard-rail / rail-change decision (§4) to an
  ADR** — this turns the §4 "rail-change protocol" into a concrete, reviewable artefact.
- **G3 — Conventional Commits:** Confirmed. **Add `commitlint` in CI** (optionally
  `release-please`/`changesets`).
- **G4 — Guard-rail protocol (§4):** Confirmed as sound. **Make it mechanical:** a rail change =
  **an ADR (G2) + a green run of the rebuilt suite**, enforced by branch protection + required CI —
  not by prose alone.
- **G5 — Incremental refactoring (strangler/characterization):** Confirmed (Fowler/Feathers); no change.

(Sources: DORA *Accelerate*; Nygard "Documenting Architecture Decisions", 2011; conventionalcommits.org;
Fowler & Feathers, 2004.)

---

