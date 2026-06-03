// listing-reactions.js — TEMPORARY re-export shim (REFACTOR P5).
//
// The module moved to ./listings/reactions.js during the P5 listings/
// folderization. assets/js/storage.js (§16 — not edited until P8) still imports
// reaction helpers from this old path, so this shim forwards the full named
// export surface unchanged. REMOVE in P8, once storage.js imports
// './listings/reactions.js' directly (the import-layer test's "no stale
// exceptions" check and CHECKLIST P5/P8 track this).
export * from './listings/reactions.js';
