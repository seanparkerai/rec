// listing-areas-writer.mjs — shared writer for the listing↔area membership
// junction (`listing_areas`, the m2m table). Both listings writers
// (tools/fetch-listings.mjs live fetch, tools/import-apify-runs.mjs backfill) and
// the one-off recompute (tools/backfill-listing-areas.mjs) emit the SAME membership
// rows from withinGeofence().areas through here, so a listing's area set is written
// identically regardless of which path produced the row (the SUPABASE_SYNC writer-
// parity contract). No DOM, no Supabase client — plain REST against the service role.
//
// Writes go through the SECURITY DEFINER RPC `replace_listing_areas(p_rightmove_id,
// p_rows)`: delete-then-insert per listing in one transaction. A listing's
// membership set can SHRINK between fetches (re-geocode) or when an area's radius is
// tuned, so a plain upsert would leave stale rows — replace is atomic and correct.

/**
 * Flatten geofence results into membership rows. Pure.
 * @param {Array<{ l: object, g: { pass: boolean, areas?: Array } }>} geoResults
 *   the [{ listing, withinGeofence-verdict }] pairs the writers already build.
 * @returns {Array<{ rightmove_id, area_id, distance_mi, is_primary }>}
 */
export function membershipRowsFor(geoResults) {
  return (geoResults || [])
    .filter((x) => x?.g?.pass && Array.isArray(x.g.areas))
    .flatMap((x) => x.g.areas.map((a) => ({
      rightmove_id: x.l.rightmove_id,
      area_id: a.area_id,
      distance_mi: a.distance_mi,
      is_primary: a.is_primary,
    })));
}

/**
 * Group flat membership rows by rightmove_id → Map<id, rows[]>. Pure.
 * Duplicate (rightmove_id, area_id) pairs keep the FIRST row: a repeated geo
 * verdict for the same listing would otherwise land two is_primary rows in one
 * set, which the replace_listing_areas RPC rejects wholesale.
 */
export function groupByListing(memberRows) {
  const byId = new Map();
  const seen = new Set();
  for (const r of memberRows || []) {
    if (!r?.rightmove_id || !r?.area_id) continue;
    const key = `${r.rightmove_id} ${r.area_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (!byId.has(r.rightmove_id)) byId.set(r.rightmove_id, []);
    byId.get(r.rightmove_id).push({
      area_id: r.area_id,
      distance_mi: r.distance_mi ?? null,
      is_primary: !!r.is_primary,
    });
  }
  return byId;
}

/**
 * Atomically replace each listing's membership set via the replace_listing_areas
 * RPC (one call per listing — the membership set can shrink, so per-listing
 * delete-then-insert is the correct unit). @returns the number of listings written.
 * @param {Array} memberRows  flat rows from membershipRowsFor()
 * @param {object} opts        { SUPABASE_URL, SERVICE_KEY }
 */
export async function replaceListingAreas(memberRows, { SUPABASE_URL, SERVICE_KEY } = {}) {
  if (!SERVICE_KEY) throw new Error('replaceListingAreas: SERVICE_KEY required');
  const byId = groupByListing(memberRows);
  const url = `${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/rpc/replace_listing_areas`;
  let written = 0;
  for (const [rightmove_id, rows] of byId) {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_rightmove_id: rightmove_id, p_rows: rows }),
    });
    if (!res.ok) throw new Error(`replace_listing_areas(${rightmove_id}) failed: ${res.status} ${await res.text()}`);
    written += 1;
  }
  return written;
}
