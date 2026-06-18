// storage/listings.js — re-export shim. The content + listings + learned-prefs
// storage surface, split (this phase) into storage/listings/{content,feed,learned}.js
// behind this shim so the public import path is unchanged: the top-level storage.js
// re-exports this module wholesale, and storage/refinement.js pulls
// getLearnedPreferences / saveLearnedPreferences through here. The shared paged-log
// helper (_fetchAllReactionRows) lives in storage/listings/_reactions-core.js and is
// intentionally NOT re-exported here — it stays internal to the split.
export * from './listings/content.js';
export * from './listings/feed.js';
export * from './listings/learned.js';
