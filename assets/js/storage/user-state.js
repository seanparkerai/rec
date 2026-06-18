// storage/user-state.js — re-export shim. Household user-state (profile, criteria,
// finances, goals, journey, readiness, investments, shortlist + status/ratings/zones),
// split (this phase) into storage/user-state/{singletons,readiness,investments,
// shortlist}.js behind this shim. Public import path unchanged: the top-level
// storage.js re-exports this module wholesale.
export * from './user-state/singletons.js';
export * from './user-state/readiness.js';
export * from './user-state/investments.js';
export * from './user-state/shortlist.js';
