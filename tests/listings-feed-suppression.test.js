// tests/listings-feed-suppression.test.js — characterises how the Listings feed and
// the Saved view now derive their state from the LIVE append-only reaction log
// (latestPerListing) and suppress / de-duplicate by physical-property fingerprint.
// Mirrors the composition wired into page-listings.js (decidedSets / isDecided /
// dedupeByFingerprint) and page-saved-listings.js (dedupeNewestByFingerprint), so the
// wiring can't silently regress even though the page coordinators aren't themselves
// unit-importable (they touch the DOM + storage).
import { latestPerListing } from '../assets/js/listings/reactions.js';
import {
  decidedSets, isDecided, dedupeNewestByFingerprint, foldDecision,
} from '../assets/js/listings/suppress.js';
import { propertyFingerprint } from '../assets/js/listings/classify.js';

export async function register({ test, assert, assertEqual }) {
  const snap = (address, beds, property_type) => ({ address, beds, property_type });

  // An append-only log: the same listing reacted twice (pass → reject), a like, and a
  // pass-only. The feed reduces this to the CURRENT reaction per listing.
  const log = [
    { listing_id: '100', reaction: 'pass',   created_at: '2026-06-01T09:00:00Z', listing_snapshot: snap('Burgate, FORDINGBRIDGE', 2, 'Semi-Detached') },
    { listing_id: '100', reaction: 'reject', created_at: '2026-06-02T09:00:00Z', reason: 'too_small', listing_snapshot: snap('Burgate, FORDINGBRIDGE', 2, 'Semi-Detached') },
    { listing_id: '200', reaction: 'like',   created_at: '2026-06-02T10:00:00Z', listing_snapshot: snap('Augustus Avenue, Fordingbridge, SP6', 2, 'Terraced') },
    { listing_id: '300', reaction: 'pass',   created_at: '2026-06-02T11:00:00Z', listing_snapshot: snap('Whitsbury Road, Fordingbridge', 3, 'Detached') },
  ];

  test('feed: latestPerListing collapses the append-only log to the current verb', () => {
    const latest = latestPerListing(log);
    assertEqual(latest.get('100').reaction, 'reject', 'most-recent row wins (pass→reject)');
    assertEqual(latest.get('200').reaction, 'like');
    assertEqual(latest.get('300').reaction, 'pass');
  });

  test('feed: decided = latest like/reject; a pass is never decided', () => {
    const decided = decidedSets(latestPerListing(log));
    assert(decided.ids.has('100') && decided.ids.has('200'), 'reject + like are decided');
    assertEqual(decided.ids.has('300'), false, 'a pass stays resurfaceable');
  });

  test('feed: a re-list under a NEW id is suppressed by fingerprint; a passed one is not', () => {
    const decided = decidedSets(latestPerListing(log));
    // 200 (Augustus Avenue) was LIKED; it re-lists under a new id with new type text.
    const likedTwin = { rightmove_id: '999', address: 'Augustus Avenue, Fordingbridge, SP6', beds: 2, property_type: 'Terraced House' };
    assertEqual(isDecided(likedTwin, decided), true, 're-list of a liked property is suppressed');
    // 300 (Whitsbury Road) was only PASSED — its re-list is NOT suppressed (pass may
    // resurface), even though the address is specific enough to fingerprint.
    const passTwin = { rightmove_id: '998', address: 'Whitsbury Road, Fordingbridge, SP6', beds: 3, property_type: 'Detached' };
    assert(propertyFingerprint(passTwin), 'precondition: the passed address IS fingerprintable');
    assertEqual(isDecided(passTwin, decided), false, 'a passed property may resurface');
  });

  test('feed: decidedSets falls back to the live row for the fingerprint', () => {
    // A reject whose snapshot lacks an address still suppresses its re-list when the
    // live row carries the address (the liveById fallback the feed passes in).
    const latest = new Map([['400', { reaction: 'reject', listing_snapshot: { beds: 2, property_type: 'Semi-Detached' } }]]);
    const liveById = new Map([['400', { rightmove_id: '400', address: 'Tinkers Cross, Fordingbridge, SP6', beds: 2, property_type: 'Semi-Detached' }]]);
    const decided = decidedSets(latest, liveById);
    const twin = { rightmove_id: '401', address: 'Tinkers Cross, Fordingbridge, SP6', beds: 2, property_type: 'Semi-Detached House' };
    assertEqual(isDecided(twin, decided), true, 'live-row fingerprint fallback suppresses the re-list');
  });

  // ── Saved view collapse (dedupeNewestByFingerprint) ──────────────────────────
  test('saved: same-property likes collapse to the most-recently-liked', () => {
    const liked = [
      { listing: { rightmove_id: 'a', address: 'Burgate, FORDINGBRIDGE', beds: 2, property_type: 'Semi-Detached', price: 300000 }, created_at: '2026-06-01T00:00:00Z' },
      { listing: { rightmove_id: 'b', address: 'Burgate, FORDINGBRIDGE', beds: 2, property_type: 'Semi-Detached House', price: 280000 }, created_at: '2026-06-03T00:00:00Z' },
      { listing: { rightmove_id: 'c', address: 'Fordingbridge', beds: 3, property_type: 'Terraced' }, created_at: '2026-06-02T00:00:00Z' }, // town-only → kept
    ];
    const out = dedupeNewestByFingerprint(liked, (x) => x.listing, (x) => x.created_at);
    assertEqual(out.length, 2, 'the Burgate pair collapses; the town-only save survives');
    const burgate = out.find((x) => x.listing.address.includes('Burgate'));
    assertEqual(burgate.listing.rightmove_id, 'b', 'newest created_at (06-03) is the representative');
  });

  test('saved: dedupeNewestByFingerprint picks the rep by time, not array order', () => {
    const liked = [
      { listing: { rightmove_id: 'b', address: 'Burgate, FORDINGBRIDGE', beds: 2, property_type: 'Semi-Detached House' }, created_at: '2026-06-03T00:00:00Z' },
      { listing: { rightmove_id: 'a', address: 'Burgate, FORDINGBRIDGE', beds: 2, property_type: 'Semi-Detached' }, created_at: '2026-06-01T00:00:00Z' },
    ];
    const out = dedupeNewestByFingerprint(liked, (x) => x.listing, (x) => x.created_at);
    assertEqual(out.length, 1);
    assertEqual(out[0].listing.rightmove_id, 'b', 'the newest created_at wins regardless of order');
  });

  // ── Event-driven re-suppression (dossier → feed via `reactions-changed`) ─────
  // A like on the dossier page never touched the feed's `decided` set directly; the
  // fix routes it through saveListingReaction's `reactions-changed` event, whose
  // handler folds the decision into `decided` with foldDecision — the SAME primitive
  // the feed's own Save uses. These assert that shared primitive end-to-end.
  test('event-fold: a dossier like (id only) becomes decided by id and by fingerprint', () => {
    // Start from a log with NO reaction for listing 555, mirroring a fresh feed.
    const decided = decidedSets(latestPerListing(log));
    const liveById = new Map([
      ['555', { rightmove_id: '555', address: 'Sandleheath Road, Fordingbridge, SP6', beds: 3, property_type: 'Detached' }],
    ]);
    assertEqual(isDecided(liveById.get('555'), decided), false, 'undecided before the event');
    // The event carries only an id (the dossier doesn't know the feed's row) — the
    // fingerprint is recovered from liveById, exactly as the page listener calls it.
    foldDecision(decided, '555', 'like', null, liveById);
    assertEqual(isDecided(liveById.get('555'), decided), true, 'decided by id after the like event');
    // And a re-list under a NEW id (same address) is caught by fingerprint.
    const reListed = { rightmove_id: '777', address: 'Sandleheath Road, Fordingbridge, SP6', beds: 3, property_type: 'Detached House' };
    assertEqual(isDecided(reListed, decided), true, 're-list of the just-liked property is suppressed by fingerprint');
  });

  test('event-fold: a pass event never decides', () => {
    const decided = decidedSets(latestPerListing(log));
    const liveById = new Map([
      ['888', { rightmove_id: '888', address: 'X Road, Fordingbridge', beds: 2, property_type: 'Flat' }],
    ]);
    foldDecision(decided, '888', 'pass', liveById.get('888'), liveById);
    assertEqual(decided.ids.has('888'), false, 'pass stays resurfaceable');
    assertEqual(isDecided(liveById.get('888'), decided), false, 'a passed property is never suppressed');
  });
}
