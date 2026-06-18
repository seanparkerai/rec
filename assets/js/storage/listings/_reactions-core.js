// storage/listings/_reactions-core.js — shared paging helper for the append-only
// listing_reactions log. Used by feed.js (current-reaction map + full log) and by
// learned.js (recompute trains on the whole log). Pure over the passed `sb` client;
// NOT re-exported on the public storage surface (internal to the storage/listings split).

// The reaction log is APPEND-ONLY and unbounded — it already exceeds Supabase's
// ~1000-row single-response cap, so any single .select() silently truncates and
// the newest reactions vanish (likes never reach Saved; decided properties
// resurface in the feed). Page through every row in 1000-row windows, mirroring
// the uncapped getListings() loop. A STABLE order (created_at, then id as a
// tiebreak for same-millisecond rows) keeps the .range() windows from skipping or
// duplicating rows across pages. `id` is always selected so the tiebreak resolves
// even for callers that don't otherwise need it.
export async function _fetchAllReactionRows(sb, hid, { select, ascending = true }) {
  const PAGE = 1000;
  const all = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb
      .from('listing_reactions')
      .select(select)
      .eq('household_id', hid)
      .order('created_at', { ascending })
      .order('id', { ascending })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    const batch = data ?? [];
    all.push(...batch);
    if (batch.length < PAGE) break; // last (short) page reached
  }
  return all;
}
