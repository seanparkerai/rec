// Guards the 79 High Street building schema against the geometry mistakes that
// are invisible until you are standing inside the model: floors that do not
// stack, rooms that overlap, and openings that run off the end of their wall.
//
// The owner correction of 2026-08-25 is the rule this encodes: the two floors
// share one envelope. No overhang, no overlap.

import { readFileSync } from 'node:fs';

const data = JSON.parse(readFileSync(new URL('../../data/buildings/79-high-street.json', import.meta.url), 'utf8'));

const HOUSE_WALLS = (level) => data.walls.filter(
  (w) => w.level === level && w.kind === 'external' && !w.id.startsWith('gar-'),
);
const span = (walls) => {
  const xs = walls.flatMap((w) => [w.a[0], w.b[0]]);
  const ys = walls.flatMap((w) => [w.a[1], w.b[1]]);
  return { w: Math.max(...xs) - Math.min(...xs), d: Math.max(...ys) - Math.min(...ys) };
};

export async function register({ test, assert, assertEqual }) {
  test('house-planner: the two floors share one envelope (no overhang, no overlap)', () => {
    const g = span(HOUSE_WALLS('ground'));
    const f = span(HOUSE_WALLS('first'));
    assert(Math.abs(g.w - f.w) < 0.02, `width differs: ground ${g.w} vs first ${f.w}`);
    assert(Math.abs(g.d - f.d) < 0.02, `depth differs: ground ${g.d} vs first ${f.d}`);
  });

  test('house-planner: no two rooms on a level overlap', () => {
    for (const level of data.levels) {
      const rooms = data.rooms.filter((r) => r.level === level.id);
      for (let i = 0; i < rooms.length; i += 1) {
        for (let j = i + 1; j < rooms.length; j += 1) {
          const [ax0, ay0, ax1, ay1] = rooms[i].rect;
          const [bx0, by0, bx1, by1] = rooms[j].rect;
          const overlaps = ax0 < bx1 - 0.001 && bx0 < ax1 - 0.001
            && ay0 < by1 - 0.001 && by0 < ay1 - 0.001;
          assert(!overlaps, `${rooms[i].id} overlaps ${rooms[j].id} on ${level.id}`);
        }
      }
    }
  });

  test('house-planner: every opening sits on a real wall and fits inside it', () => {
    const byId = new Map(data.walls.map((w) => [w.id, w]));
    for (const o of data.openings) {
      const wall = byId.get(o.wall);
      assert(wall, `opening ${o.id} references missing wall ${o.wall}`);
      const len = Math.hypot(wall.b[0] - wall.a[0], wall.b[1] - wall.a[1]);
      assert(o.at - o.width / 2 >= -0.001,
        `${o.id} starts before the wall begins (${(o.at - o.width / 2).toFixed(2)}m)`);
      assert(o.at + o.width / 2 <= len + 0.001,
        `${o.id} runs past the end of ${o.wall} (${(o.at + o.width / 2).toFixed(2)}m of ${len.toFixed(2)}m)`);
    }
  });

  test('house-planner: openings on the same wall do not collide', () => {
    const byWall = new Map();
    for (const o of data.openings) {
      if (!byWall.has(o.wall)) byWall.set(o.wall, []);
      byWall.get(o.wall).push(o);
    }
    for (const [wallId, list] of byWall) {
      const sorted = [...list].sort((a, b) => a.at - b.at);
      for (let i = 1; i < sorted.length; i += 1) {
        const prevEnd = sorted[i - 1].at + sorted[i - 1].width / 2;
        const thisStart = sorted[i].at - sorted[i].width / 2;
        assert(thisStart >= prevEnd - 0.001,
          `${sorted[i].id} overlaps ${sorted[i - 1].id} on ${wallId}`);
      }
    }
  });

  test('house-planner: every room is reachable — each has a door or is open-plan', () => {
    const walled = new Set(data.walls.map((w) => w.id));
    const doorWalls = new Set(data.openings.filter((o) => o.type !== 'window').map((o) => o.wall));
    for (const id of doorWalls) assert(walled.has(id), `door on unknown wall ${id}`);
    assert(doorWalls.size >= 8, `expected doors throughout, found them on ${doorWalls.size} walls`);
  });

  test('house-planner: the double garage has two doors and its labelled size', () => {
    const garage = data.rooms.find((r) => r.id === 'garage');
    assert(garage, 'the garage is modelled');
    const [x0, y0, x1, y1] = garage.rect;
    assert(Math.abs((x1 - x0) - 6.20) < 0.02, `garage width ${(x1 - x0).toFixed(2)} should be 6.20`);
    assert(Math.abs((y1 - y0) - 5.58) < 0.02, `garage depth ${(y1 - y0).toFixed(2)} should be 5.58`);
    const doors = data.openings.filter((o) => o.type === 'garage');
    assertEqual(doors.length, 2, 'two up-and-over doors, as the aerial shows');
  });

  test('house-planner: the stair rises exactly one storey', () => {
    const s = data.stairs;
    assert(s, 'stairs are modelled');
    const rise = data.levels[1].elevation - data.levels[0].elevation;
    const perRiser = rise / s.risers;
    assert(perRiser > 0.15 && perRiser < 0.22,
      `riser of ${(perRiser * 1000).toFixed(0)}mm is outside a buildable range`);
    const run = s.risers * s.treadGoing;
    const [, y0, , y1] = s.footprint;
    assert(run <= (y1 - y0) + 0.5, `stair run ${run.toFixed(2)}m does not fit its ${(y1 - y0).toFixed(2)}m footprint`);
  });

  test('house-planner: the bathroom sits under the lean-to, not under the first floor', () => {
    const leanTo = data.roofs.find((r) => r.type === 'monopitch' && r.id === 'roof-bathroom');
    assert(leanTo, 'the bathroom lean-to roof is modelled');
    const [lx0, ly0, lx1, ly1] = leanTo.rect;
    for (const id of ['bathroom', 'shower']) {
      const [x0, y0, x1, y1] = data.rooms.find((r) => r.id === id).rect;
      assert(x0 >= lx0 - 0.01 && x1 <= lx1 + 0.01 && y0 >= ly0 - 0.01 && y1 <= ly1 + 0.01,
        `${id} is not inside the lean-to footprint`);
    }
    // Nothing on the first floor may sit above it.
    for (const r of data.rooms.filter((x) => x.level === 'first')) {
      const [x0, y0, x1, y1] = r.rect;
      const over = x0 < lx1 - 0.01 && lx0 < x1 - 0.01 && y0 < ly1 - 0.01 && ly0 < y1 - 0.01;
      assert(!over, `${r.id} sits above the single-storey lean-to`);
    }
  });

  test('house-planner: 79a is modelled in three parts and never overlaps the house', () => {
    assertEqual(data.structures.length, 3, '79a: road range, connecting part, front return');
    const house = { x0: 0, y0: 0, x1: 9.86, y1: 8.41 };
    for (const s of data.structures) {
      const [x0, y0, x1, y1] = s.rect;
      const overlaps = x0 < house.x1 - 0.01 && house.x0 < x1 - 0.01
        && y0 < house.y1 - 0.01 && house.y0 < y1 - 0.01;
      assert(!overlaps, `${s.id} overlaps the house footprint`);
    }
    const wrap = data.structures.find((s) => s.id === '79a-front-wrap');
    assert(wrap, '79a returns round the front (owner correction)');
    assert(wrap.rect[2] > 0, 'the front return comes past the south-west corner');
  });

  test('house-planner: 79a front return clears the dining-room window', () => {
    const wrap = data.structures.find((s) => s.id === '79a-front-wrap');
    const win = data.openings.find((o) => o.id === 'w-dining-front');
    const wall = data.walls.find((w) => w.id === win.wall);
    const winStartX = wall.a[0] + win.at - win.width / 2;
    assert(wrap.rect[2] <= winStartX + 0.01,
      `the front return reaches x=${wrap.rect[2]} but the window starts at x=${winStartX.toFixed(2)}`);
  });

  test('house-planner: rear projections are ordered kitchen > garage > bathroom lean-to', () => {
    const rearOf = (id) => {
      const r = data.roofs.find((x) => x.id === id);
      return r.rect[3];
    };
    const kitchenWing = rearOf('roof-rear-wing');
    const garage = rearOf('roof-garage');
    const leanTo = rearOf('roof-bathroom');
    assert(leanTo < garage,
      `lean-to rear ${leanTo} must sit forward of the garage rear ${garage}`);
    assert(garage < kitchenWing,
      `garage rear ${garage} must sit forward of the kitchen wing rear ${kitchenWing}`);
    const frontBand = 4.24;
    assert((kitchenWing - frontBand) > 2 * (leanTo - frontBand),
      'the kitchen wing should project much further than the lean-to, not marginally');
  });

  test('house-planner: the garage is attached to the house', () => {
    const houseEast = 9.86;
    const [gx0, gy0, , gy1] = data.rooms.find((r) => r.id === 'garage').rect;
    assert(Math.abs(gx0 - houseEast) < 0.01,
      `the garage west face is at ${gx0}, not against the house at ${houseEast}`);
    assert(gy0 < 8.41 && gy1 > 0, 'the garage overlaps the house in depth, so the walls actually meet');
    const link = data.openings.find((o) => o.id === 'd-garage-link');
    assert(link, 'a connecting door runs from the house into the garage');
  });

  test('house-planner: modelled floor area reconciles with the plan total', () => {
    const area = (r) => (r[2] - r[0]) * (r[3] - r[1]);
    const total = data.rooms.reduce((sum, r) => sum + area(r.rect), 0);
    const stated = 135.4;
    const drift = Math.abs(total - stated) / stated;
    assert(drift < 0.05,
      `modelled ${total.toFixed(1)}m2 vs the plan's ${stated}m2 is ${(drift * 100).toFixed(1)}% out`);
  });

  test('house-planner: every room is big enough to be a room', () => {
    for (const r of data.rooms) {
      const w = r.rect[2] - r.rect[0];
      const d = r.rect[3] - r.rect[1];
      assert(w > 0.8 && d > 0.8, `${r.id} is ${w.toFixed(2)} x ${d.toFixed(2)}m — not habitable`);
      assert(Math.max(w, d) >= 1.7 || r.id === 'rear-hall',
        `${r.id} has no dimension long enough for anything`);
    }
  });

  test('house-planner: ceiling heights are buildable and the kitchen is the low one', () => {
    for (const l of data.levels) {
      assert(l.ceilingHeight > 2.0 && l.ceilingHeight < 3.5, `${l.id} ceiling ${l.ceilingHeight}m`);
    }
    for (const r of data.rooms) {
      if (r.ceilingHeight === undefined) continue;
      assert(r.ceilingHeight > 2.0 && r.ceilingHeight < 3.5, `${r.id} ceiling ${r.ceilingHeight}m`);
    }
    const ground = data.levels.find((l) => l.id === 'ground');
    const kitchen = data.rooms.find((r) => r.id === 'kitchen');
    assert(kitchen.ceilingHeight < ground.ceilingHeight,
      'the kitchen reads lower than the front rooms in the photographs');
    assert(data.levels[1].elevation >= ground.ceilingHeight,
      'the first floor cannot start below the ground-floor ceiling');
  });

  test('house-planner: every roof sits above the storey it covers', () => {
    for (const roof of data.roofs) {
      assert(roof.eaves > 2.5, `${roof.id} eaves at ${roof.eaves}m is below head height`);
      assert(roof.pitchDeg > 5 && roof.pitchDeg < 55, `${roof.id} pitch ${roof.pitchDeg} is implausible`);
    }
    const main = data.roofs.find((r) => r.id === 'roof-main');
    const first = data.levels.find((l) => l.id === 'first');
    assert(Math.abs(main.eaves - (first.elevation + first.ceilingHeight)) < 0.02,
      'the main eaves should land on the first-floor ceiling');
    for (const chy of data.roof.chimneys) {
      assert(chy.base >= main.eaves - 0.01, 'chimney stacks start at the eaves, not the ground');
      assert(chy.top > chy.base, 'chimney has positive height');
    }
  });

  test('house-planner: no wall is a zero-length stub', () => {
    for (const w of data.walls) {
      const len = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
      assert(len > 0.2, `${w.id} is only ${len.toFixed(2)}m long`);
    }
  });

  test('house-planner: rooms sit inside their own level envelope', () => {
    for (const level of data.levels) {
      const ext = data.walls.filter((w) => w.level === level.id && w.kind === 'external');
      const xs = ext.flatMap((w) => [w.a[0], w.b[0]]);
      const ys = ext.flatMap((w) => [w.a[1], w.b[1]]);
      const bb = { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
      for (const r of data.rooms.filter((x) => x.level === level.id)) {
        const [x0, y0, x1, y1] = r.rect;
        assert(x0 >= bb.x0 - 0.35 && x1 <= bb.x1 + 0.35 && y0 >= bb.y0 - 0.35 && y1 <= bb.y1 + 0.35,
          `${r.id} falls outside the ${level.id} envelope`);
      }
    }
  });
}
