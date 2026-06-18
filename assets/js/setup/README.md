# assets/js/setup/

**Domain:** Onboarding wizard — branching multi-step form for household setup (profile, criteria, finances, goals).

**Naming:** Setup modules are prefixed; pure logic (steps, validate, completeness) is unit-testable in Node; wizard.js orchestrates DOM + state.

**Entry point:** `wizard.js` exports `createWizard(root, { state, accessors, areaApi, onFinish })`. Renders one step at a time from declarative `steps.js` definitions, autosaves edits via `autosave.js` (never clobbering sibling keys), validates via `validate.js`, gates next-button via `requiredGate()`, and announces progress to screen readers via `a11y.js`. Steps are branching (buying situation / employment basis) and fields map to dotted paths in user-state blobs (profile.person.fullName, criteria.location.postcode, etc).

**Key constraint:** Field paths are blob-prefixed and PURE DATA-driven; wizard reads/writes via injected storage accessors, so the form logic is decoupled from storage transport. Browser-only; pure modules (steps, validate, completeness, autosave) export testable predicates and transformers.

Run `find assets/js/setup -name '*.js'` for the live file list. See docs/REPO_MAP.md for the whole-repo map.
