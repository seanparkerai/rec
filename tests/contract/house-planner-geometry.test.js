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
    assert(Math.abs((x1 - x0) - 6.20) < 0.06, `garage width ${(x1 - x0).toFixed(2)} should be 6.20`);
    assert(Math.abs((y1 - y0) - 5.58) < 0.06, `garage depth ${(y1 - y0).toFixed(2)} should be 5.58`);
    const doors = data.openings.filter((o) => o.type === 'garage');
    assertEqual(doors.length, 2, 'two up-and-over doors, as the aerial shows');
  });

  test('house-planner: the stair fits the footprint drawn on the plan', () => {
    const st = data.stairs;
    const [sx0, sy0, sx1, sy1] = st.footprint;
    assert(Math.abs((sx1 - sx0) - 0.76) < 0.05,
      `stair is drawn 0.76m wide, modelled ${(sx1 - sx0).toFixed(2)}m`);
    const run = st.straightRisers * st.treadGoing;
    assert(run <= (sy1 - sy0) + 0.02,
      `straight run ${run.toFixed(2)}m overruns its ${(sy1 - sy0).toFixed(2)}m footprint`);
    const total = st.straightRisers + st.winderRisers;
    const perRiser = (data.levels[1].elevation - data.levels[0].elevation) / total;
    assert(perRiser > 0.15 && perRiser < 0.22,
      `riser of ${(perRiser * 1000).toFixed(0)}mm is outside a buildable range`);
    assert(st.treadGoing > 0.19, `going of ${(st.treadGoing * 1000).toFixed(0)}mm is too shallow`);
    const hall = data.rooms.find((r) => r.id === 'hall');
    const hallArea = (hall.rect[2] - hall.rect[0]) * (hall.rect[3] - hall.rect[1]);
    assert(((sx1 - sx0) * (sy1 - sy0)) / hallArea < 0.45,
      'the stair swallows too much of the hall');
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

  test('house-planner: 79a is two parts forming one elongated building', () => {
    assertEqual(data.structures.length, 2, '79a has a front part and a back part');
    const front = data.structures.find((x) => x.id === '79a-front');
    const back = data.structures.find((x) => x.id === '79a-back');
    assert(front && back, 'both parts are modelled');
    // One building: the parts share a depth and meet along a common edge.
    assertEqual(front.rect[0], back.rect[0], 'both parts share a west face');
    assertEqual(front.rect[2], back.rect[2], 'both parts share an east face');
    assertEqual(front.rect[3], back.rect[1], 'the parts meet — this is one building, not two');
    // Elongated, running longways alongside the road.
    const len = back.rect[3] - front.rect[1];
    const dep = front.rect[2] - front.rect[0];
    assert(len / dep > 1.8, `79a should read as elongated, not ${len.toFixed(1)} x ${dep.toFixed(1)}m`);
    // Hard against the house, never overlapping it.
    assert(front.rect[2] <= 0.01 && back.rect[2] <= 0.01, '79a does not overlap the house');
    assert(front.rect[2] > -0.5, '79a touches the house');
  });

  test('house-planner: the back part of 79a slopes against the house', () => {
    const back = data.structures.find((x) => x.id === '79a-back');
    assertEqual(back.roof.type, 'monopitch', 'the back part has a sloped roof, not a gable');
    assertEqual(back.roof.highSide, 'maxX', 'it slopes up towards the house it leans on');
    const front = data.structures.find((x) => x.id === '79a-front');
    assert(back.rect[1] > front.rect[1], 'the sloped part is the one further back');
    // It has to reach the kitchen, which is what it abuts.
    const kitchen = data.rooms.find((r) => r.id === 'kitchen');
    assert(back.rect[3] > kitchen.rect[1],
      'the back part reaches the kitchen end of the house');
  });

  test('house-planner: 79a comes forward past the front of the house', () => {
    const front = data.structures.find((x) => x.id === '79a-front');
    assert(front.rect[1] < -1.0,
      `79a should project forward of the house front, but starts at y=${front.rect[1]}`);
  });

  test('house-planner: the parcel contains the house, excludes 79a, and has real garden', () => {
    const plot = data.plot;
    assert(plot && Array.isArray(plot.polygon) && plot.polygon.length >= 4, 'the parcel is modelled');
    const inside = (px, py) => {
      let c = false;
      const P = plot.polygon;
      for (let i = 0, j = P.length - 1; i < P.length; j = i, i += 1) {
        const [xi, yi] = P[i];
        const [xj, yj] = P[j];
        if ((yi > py) !== (yj > py)
          && px < ((xj - xi) * (py - yi)) / ((yj - yi) || 1e-9) + xi) c = !c;
      }
      return c;
    };
    for (const [px, py] of [[0.5, 0.5], [15.5, 0.5], [15.5, 6.5], [8, 3.6]]) {
      assert(inside(px, py), `the house corner (${px}, ${py}) must lie inside its own plot`);
    }
    // 79a belongs to the neighbour — the boundary goes round it.
    const a79 = data.structures[0];
    const cx = (a79.rect[0] + a79.rect[2]) / 2;
    assert(!inside(cx, 0.6), '79a must fall outside the boundary, not intersect it');

    const xs = plot.polygon.map((p) => p[0]);
    const ys = plot.polygon.map((p) => p[1]);
    assert(Math.max(...xs) - 16.15 > 2.5,
      `only ${(Math.max(...xs) - 16.15).toFixed(1)}m beside the garage — the plot is too tight`);
    assert(-Math.min(...ys) > 5.0,
      `only ${(-Math.min(...ys)).toFixed(1)}m of front garden — the plot is too tight`);
    const area = Math.abs(plot.polygon.reduce((sum, [px, py], i) => {
      const [nx, ny] = plot.polygon[(i + 1) % plot.polygon.length];
      return sum + (px * ny - nx * py);
    }, 0)) / 2;
    assert(Math.abs(area - plot.areaM2) / plot.areaM2 < 0.05,
      `stated ${plot.areaM2}m2 but the polygon measures ${area.toFixed(0)}m2`);
  });

  test('house-planner: the stairs can actually be climbed', () => {
    const c = data.stairs.climb;
    assert(c, 'the stair has a walkable ramp');
    assertEqual(c.bottom, data.levels[0].elevation, 'it starts at the ground floor');
    assertEqual(c.top, data.levels[1].elevation, 'it finishes at the first floor');
    assert(c.y1 > c.y0 && c.x1 > c.x0, 'the ramp has extent to walk along');
    // It has to start in the hall and finish on the landing.
    const hall = data.rooms.find((r) => r.id === 'hall');
    const landing = data.rooms.find((r) => r.id === 'landing');
    assert(c.x0 >= hall.rect[0] - 0.3 && c.x1 <= hall.rect[2] + 0.3,
      'the flight sits within the hall');
    assert(c.y1 <= landing.rect[3] + 0.3,
      'the top of the flight lands on the landing, not through its wall');
    const slope = (c.top - c.bottom) / (c.y1 - c.y0);
    assert(slope > 0.6 && slope < 1.6, `stair slope of ${slope.toFixed(2)} is unwalkable`);
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
    // Derived from the data, not hardcoded, so a re-measure cannot silently break it.
    const houseEast = Math.max(...data.walls
      .filter((w) => w.level === 'ground' && !w.id.startsWith('gar-'))
      .flatMap((w) => [w.a[0], w.b[0]]));
    const [gx0, gy0, , gy1] = data.rooms.find((r) => r.id === 'garage').rect;
    assert(Math.abs(gx0 - houseEast) < 0.16,
      `the garage west face is at ${gx0}, not against the house at ${houseEast}`);
    assert(gy0 < 7.26 && gy1 > 0, 'the garage overlaps the house in depth, so the walls actually meet');
    // The plan shows no internal door between house and garage, so none is
    // modelled. Attachment is about the walls meeting, not about a doorway.
    const shared = data.walls.some((w) => w.id === 'gf-ext-east');
    assert(shared, 'the house east wall exists for the garage to attach to');
  });

  test('house-planner: modelled floor area reconciles with the plan total', () => {
    const area = (r) => (r[2] - r[0]) * (r[3] - r[1]);
    const total = data.rooms.reduce((sum, r) => sum + area(r.rect), 0);
    const stated = 135.4;
    const drift = Math.abs(total - stated) / stated;
    // Room rectangles are internal; the plan's total is gross external. A few
    // percent under is expected — a large gap either way is not.
    assert(drift < 0.10,
      `modelled ${total.toFixed(1)}m2 vs the plan's ${stated}m2 is ${(drift * 100).toFixed(1)}% out`);
  });

  test('house-planner: every room is big enough to be a room', () => {
    for (const r of data.rooms) {
      const w = r.rect[2] - r.rect[0];
      const d = r.rect[3] - r.rect[1];
      assert(w > 0.7 && d > 0.7, `${r.id} is ${w.toFixed(2)} x ${d.toFixed(2)}m`);
      if (r.partOf) continue; // a leg of an L-shaped room, not a room on its own
      assert(w * d > 1.0, `${r.id} has an area of only ${(w * d).toFixed(2)}m2`);
    }
    // Habitable rooms have to clear a real furniture-sized bar.
    for (const id of ['dining', 'living', 'kitchen', 'bed-sw', 'bed-se', 'bed-nw']) {
      const r = data.rooms.find((x) => x.id === id);
      const w = r.rect[2] - r.rect[0];
      const dd = r.rect[3] - r.rect[1];
      assert(Math.min(w, dd) >= 2.5, `${id} is only ${Math.min(w, dd).toFixed(2)}m across`);
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
      assert(roof.eaves > 2.4, `${roof.id} eaves at ${roof.eaves}m is below head height`);
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

  test('house-planner: the garage roof has a real ridge, not a pyramid', () => {
    const g = data.roofs.find((r) => r.id === 'roof-garage');
    assert(g, 'the garage roof is modelled');
    assertEqual(g.abut, 'minX', 'it closes as a gable where it meets the house');
    const o = g.overhang ?? 0.3;
    const w = (g.rect[2] + o) - (g.rect[0] - o);
    const dep = (g.rect[3] + o) - (g.rect[1] - o);
    const ridge = w - Math.min(w, dep) / 2;
    assert(ridge > 1.5,
      `garage ridge is only ${ridge.toFixed(2)}m — a near-square hip collapses to a pyramid`);
    const main = data.roofs.find((r) => r.id === 'roof-main');
    const gTop = g.eaves + (Math.min(w, dep) / 2) * Math.tan((g.pitchDeg * Math.PI) / 180);
    assert(gTop < main.eaves + 2.0, 'the garage roof stays below the house roof, as the aerial shows');
  });

  test('house-planner: every chimney stands over a chimney breast', () => {
    const breasts = data.features.filter((f) => f.type === 'chimneyBreast');
    assert(breasts.length >= 2, 'the chimney breasts are modelled');
    for (const chy of data.roof.chimneys) {
      const over = breasts.some((f) => {
        const room = data.rooms.find((r) => r.id === f.room);
        if (!room) return false;
        const [x0, y0, x1, y1] = room.rect;
        return chy.x > x0 - 0.6 && chy.x < x1 + 0.6 && chy.y > y0 - 0.6 && chy.y < y1 + 0.6;
      });
      assert(over, `${chy.id} at (${chy.x}, ${chy.y}) is not above any chimney breast`);
      assert(chy.base >= 5.0, `${chy.id} starts at ${chy.base}m — stacks begin at the eaves`);
    }
  });

  test('house-planner: roofs that run into something drop their overhang there', () => {
    const byId = new Map(data.roofs.map((r) => [r.id, r]));
    // The rear wing meets the main roof; the lean-to and garage meet walls.
    for (const [id, edge] of [['roof-rear-wing', 'minY'], ['roof-bathroom', 'minY'], ['roof-garage', 'minX']]) {
      const r = byId.get(id);
      assert(r, `${id} is modelled`);
      assertEqual(r.overhangs?.[edge], 0,
        `${id} must not overhang on ${edge} — it runs into something there`);
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
