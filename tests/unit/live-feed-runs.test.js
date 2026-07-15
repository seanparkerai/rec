// tests/live-feed-runs.test.js — pure tests for the /live-feed kiosk logic:
// sync_log → run clustering, liveness, the London fetch-slot clock, and the
// anti-burn-in layout cycle. Offline; mirrors the harness register(...) shape.
import { clusterRuns, dailyAverages, nextSlot, FETCH_SLOTS } from '../../assets/js/live-feed/runs.js';
import { nextUserOrder, burnShift } from '../../assets/js/live-feed/layout.js';

export async function register({ test, assert, assertEqual }) {
  // A fixed clock so isLive / windows are deterministic.
  const NOW = Date.parse('2026-06-22T12:00:00Z');
  const ago = (mins) => new Date(NOW - mins * 60000).toISOString();

  // ── clusterRuns ───────────────────────────────────────────────────────────
  test('clusterRuns: splits two bursts on a > gapMinutes silence', () => {
    const rows = [
      // Run A — three rows ~2h ago, within a couple minutes of each other.
      { action: 'insert', at: ago(122) },
      { action: 'update', at: ago(121) },
      { action: 'insert', at: ago(120) },
      // Run B — two rows ~1m ago.
      { action: 'insert', at: ago(2) },
      { action: 'delete', at: ago(1) },
    ];
    const runs = clusterRuns(rows, { now: NOW });
    assertEqual(runs.length, 2, 'two runs');
    // Newest first.
    assert(new Date(runs[0].finishedAt) > new Date(runs[1].finishedAt), 'newest first');
  });

  test('clusterRuns: tallies added/updated/removed + total', () => {
    const rows = [
      { action: 'insert', at: ago(10) },
      { action: 'insert', at: ago(10) },
      { action: 'update', at: ago(9) },
      { action: 'delete', at: ago(9) },
    ];
    const [run] = clusterRuns(rows, { now: NOW });
    assertEqual(run.added, 2);
    assertEqual(run.updated, 1);
    assertEqual(run.removed, 1);
    assertEqual(run.total, 4);
  });

  test('clusterRuns: isLive true only within the live window', () => {
    const live = clusterRuns([{ action: 'insert', at: ago(1) }], { now: NOW, liveWindowMinutes: 3 });
    assertEqual(live[0].isLive, true);
    const stale = clusterRuns([{ action: 'insert', at: ago(30) }], { now: NOW, liveWindowMinutes: 3 });
    assertEqual(stale[0].isLive, false);
  });

  test('clusterRuns: drops rows with an unparseable timestamp', () => {
    const runs = clusterRuns([{ action: 'insert', at: 'not-a-date' }, { action: 'insert', at: ago(5) }], { now: NOW });
    assertEqual(runs.length, 1);
    assertEqual(runs[0].total, 1);
  });

  test('clusterRuns: empty / non-array input → []', () => {
    assertEqual(clusterRuns(null).length, 0);
    assertEqual(clusterRuns([]).length, 0);
  });

  // ── dailyAverages ─────────────────────────────────────────────────────────
  test('dailyAverages: counts only runs inside the window', () => {
    const runs = [
      { finishedAt: ago(60), added: 10 },        // 1h ago — in 7d window
      { finishedAt: ago(60 * 24 * 2), added: 4 }, // 2d ago — in
      { finishedAt: ago(60 * 24 * 9), added: 99 }, // 9d ago — out of 7d
    ];
    const a = dailyAverages(runs, { days: 7, now: NOW });
    assertEqual(a.runs, 2);
    assertEqual(a.addedPerDay, 2); // (10+4)/7
    assertEqual(a.runsPerDay, 0.29); // 2/7 → 0.29
  });

  // ── nextSlot (Europe/London 08:00/10:00/12:00/14:00/18:00/21:00) ──────────
  test('nextSlot: slots are the documented London schedule', () => {
    assertEqual(JSON.stringify(FETCH_SLOTS), JSON.stringify([8, 10, 12, 14, 18, 21]));
  });

  test('nextSlot: London 09:00 → next is 10:00', () => {
    // June = BST (UTC+1): 08:00Z === London 09:00.
    const slot = nextSlot(new Date('2026-06-22T08:00:00Z'));
    assertEqual(slot.hour, 10);
    assertEqual(slot.label, '10:00');
  });

  test('nextSlot: London evening 19:00 → next is the 21:00 slot', () => {
    // 18:00Z === London 19:00 (BST) → past 18:00, so next is 21:00.
    const slot = nextSlot(new Date('2026-06-22T18:00:00Z'));
    assertEqual(slot.hour, 21);
    assertEqual(slot.label, '21:00');
  });

  test('nextSlot: after the last slot rolls to 08:00 next day', () => {
    // 21:30Z === London 22:30 (BST) → past 21:00, so next is 08:00 tomorrow.
    const slot = nextSlot(new Date('2026-06-22T21:30:00Z'));
    assertEqual(slot.hour, 8);
    assert(slot.at.getTime() > Date.parse('2026-06-22T21:30:00Z'), 'next slot is in the future');
  });

  // ── burn-in helpers ───────────────────────────────────────────────────────
  test('nextUserOrder: swaps the two panels each refresh', () => {
    assertEqual(JSON.stringify(nextUserOrder(['luke', 'suzanne'])), JSON.stringify(['suzanne', 'luke']));
    assertEqual(JSON.stringify(nextUserOrder(['suzanne', 'luke'])), JSON.stringify(['luke', 'suzanne']));
    assertEqual(JSON.stringify(nextUserOrder(undefined)), JSON.stringify(['suzanne', 'luke']));
  });

  test('burnShift: deterministic, small, and wraps the ring', () => {
    assertEqual(JSON.stringify(burnShift(0)), JSON.stringify({ x: 0, y: 0 }));
    for (let t = -10; t <= 20; t++) {
      const { x, y } = burnShift(t);
      assert(Math.abs(x) <= 3 && Math.abs(y) <= 3, `shift within ±3px at tick ${t}`);
    }
    // Same index after a full ring.
    assertEqual(JSON.stringify(burnShift(1)), JSON.stringify(burnShift(9)));
  });
}
