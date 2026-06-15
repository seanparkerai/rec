// storage.js — re-export shim (REFACTOR P8). The 845-line implementation was split
// into storage/{core,user-state,listings,outreach}.js; this file preserves the exact
// 45-function public surface so no page/module import needs to change. Per §16/§17,
// storage.js is split behind a byte-identical shim, never rewritten — the localStorage +
// Supabase write-through behaviour is unchanged; only the file layout moved.
export { getCurrentUser, signOut, _internal, hasRealUserData } from './storage/core.js';
export * from './storage/user-state.js';
export * from './storage/listings.js';
export * from './storage/outreach.js';
export * from './storage/refinement.js';
export * from './storage/ask.js';
