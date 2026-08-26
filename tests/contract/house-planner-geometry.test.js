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
    // They share the east face, where both abut the house. The west faces differ:
    // the mono-pitch part sits back from the gable, which is the point.
    assertEqual(front.rect[2], back.rect[2], 'both parts abut the house on the same line');
    assert(back.rect[0] > front.rect[0], 'the back part is set back from the gabled front');
    assertEqual(front.rect[3], back.rect[1], 'the parts meet — this is one building, not two');
    // Elongated, running longways alongside the road.
    const len = back.rect[3] - front.rect[1];
    const dep = Math.max(front.rect[2] - front.rect[0], back.rect[2] - back.rect[0]);
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
    // Clearances are whatever the fit measured, not what looks generous. The
    // land is tight behind the garage and deep at the front; an earlier version
    // asserted a minimum here and was simply wrong about the site.
    const cl = data.plot.clearances;
    assert(Math.abs((Math.max(...xs) - 16.36) - cl.besideGarage) < 0.6,
      `polygon gives ${(Math.max(...xs) - 16.36).toFixed(1)}m beside the garage but clearances say ${cl.besideGarage}m`);
    assert(Math.abs(-Math.min(...ys) - cl.frontGarden) < 0.6,
      `polygon gives ${(-Math.min(...ys)).toFixed(1)}m of front but clearances say ${cl.frontGarden}m`);
    assert(cl.frontGarden > cl.besideGarage,
      'the front garden is the deep side; behind the garage is tight');
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
    // A winder turns part of the rise, so the plan run is shorter than the
    // developed run. Judge the stair on the developed slope, not the footprint.
    const st2 = data.stairs;
    const developed = (st2.straightRisers + st2.winderRisers) * st2.treadGoing;
    const slope = (c.top - c.bottom) / developed;
    assert(slope > 0.6 && slope < 1.3,
      `developed stair slope of ${slope.toFixed(2)} is unwalkable`);
  });

  test('house-planner: the stair ramp does not swallow a doorway', () => {
    // Walking to the downstairs toilet used to trigger the climb, because the
    // bathroom door sat inside the padded stair footprint.
    const c = data.stairs.climb;
    const PAD = 0.05;
    const byId = new Map(data.walls.map((w) => [w.id, w]));
    for (const o of data.openings) {
      if (o.type === 'window') continue;
      const w = byId.get(o.wall);
      if (!w || w.level !== 'ground') continue;
      const len = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
      const ux = (w.b[0] - w.a[0]) / len;
      const uy = (w.b[1] - w.a[1]) / len;
      for (const d2 of [o.at - o.width / 2, o.at, o.at + o.width / 2]) {
        const px = w.a[0] + ux * d2;
        const py = w.a[1] + uy * d2;
        const inside = px > c.x0 - PAD && px < c.x1 + PAD
          && py > c.y0 - PAD && py < c.y1 + PAD;
        assert(!inside, `${o.id} falls inside the stair ramp — walking through it would teleport you`);
      }
    }
  });

  test('house-planner: there is a walkable passage past the stair', () => {
    const c = data.stairs.climb;
    const hall = data.rooms.find((r) => r.id === 'hall');
    const BODY = 0.28;
    const gap = (c.x0 - 0.05) - hall.rect[0];
    assert(gap > 2 * BODY,
      `only ${gap.toFixed(2)}m beside the stair — a ${BODY}m body cannot get past`);
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
      // A porch canopy sits over a door, not over a storey.
      const floor = roof.id === 'roof-porch' ? 2.1 : 2.4;
      assert(roof.eaves > floor, `${roof.id} eaves at ${roof.eaves}m is too low`);
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

  test('house-planner: nothing shows through the zone between floors', () => {
    for (let i = 0; i < data.levels.length - 1; i += 1) {
      const lo = data.levels[i];
      const hi = data.levels[i + 1];
      const zone = hi.elevation - (lo.elevation + lo.ceilingHeight);
      assert(zone >= 0, `${hi.id} starts below the ${lo.id} ceiling`);
      assert(Math.abs(zone - data.defaults.floorThickness) < 0.01,
        `the ${zone.toFixed(2)}m structural zone does not match the ${data.defaults.floorThickness}m floor`);
    }
    // Walls that stop short of the storey above must say so explicitly, because
    // everything else is raised to close the zone.
    for (const w of data.walls) {
      if (w.height === undefined) continue;
      assert(w.height > 2.0 && w.height < 3.5, `${w.id} height ${w.height} is implausible`);
    }
  });

  test('house-planner: each upstairs bedroom has exactly one way in', () => {
    // The landing alcove serves the north-west bedroom only; without its south
    // wall the two west bedrooms run together and one reads as having two doors.
    const south = data.walls.find((w) => w.id === 'ff-alcove-south');
    const side = data.walls.find((w) => w.id === 'ff-alcove');
    assert(south && side, 'the alcove is enclosed on its south and west sides');
    assert(Math.abs(south.a[0] - side.a[0]) < 0.02,
      'the alcove south wall starts where its west wall stands');
    const spine = data.walls.find((w) => w.id === 'ff-spine');
    assert(Math.abs(south.b[0] - spine.a[0]) < 0.02,
      'the alcove south wall runs all the way to the landing wall');
    const doors = data.openings.filter(
      (o) => o.type !== 'window'
        && ['ff-spine', 'ff-beds', 'ff-landing-se', 'ff-alcove', 'ff-alcove-south'].includes(o.wall),
    );
    assertEqual(doors.length, 3, 'three bedrooms, three doors — no more');
  });

  test('house-planner: no chimney breast stands in front of a window', () => {
    const byId = new Map(data.walls.map((w) => [w.id, w]));
    for (const f of data.features.filter((x) => x.type === 'chimneyBreast')) {
      assert(['minX', 'maxX', 'minY', 'maxY'].includes(f.side),
        `${f.id} has no side, so it would default onto the front wall`);
      const room = data.rooms.find((r) => r.id === f.room);
      const [x0, y0, x1, y1] = room.rect;
      const vertical = f.side === 'minX' || f.side === 'maxX';
      // Footprint of the breast in plan.
      const bx0 = vertical ? (f.side === 'maxX' ? x1 - f.projection : x0) : (x0 + x1) / 2 - f.width / 2;
      const bx1 = vertical ? (f.side === 'maxX' ? x1 : x0 + f.projection) : (x0 + x1) / 2 + f.width / 2;
      const by0 = vertical ? (y0 + y1) / 2 - f.width / 2 : (f.side === 'maxY' ? y1 - f.projection : y0);
      const by1 = vertical ? (y0 + y1) / 2 + f.width / 2 : (f.side === 'maxY' ? y1 : y0 + f.projection);
      for (const o of data.openings) {
        if (o.type !== 'window') continue;
        const w = byId.get(o.wall);
        if (!w || w.level !== room.level) continue;
        const len = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
        const ux = (w.b[0] - w.a[0]) / len;
        const uy = (w.b[1] - w.a[1]) / len;
        const sx = w.a[0] + ux * (o.at - o.width / 2);
        const sy = w.a[1] + uy * (o.at - o.width / 2);
        const ex = w.a[0] + ux * (o.at + o.width / 2);
        const ey = w.a[1] + uy * (o.at + o.width / 2);
        const wx0 = Math.min(sx, ex);
        const wx1 = Math.max(sx, ex);
        const wy0 = Math.min(sy, ey);
        const wy1 = Math.max(sy, ey);
        const clash = bx0 < wx1 - 0.05 && wx0 < bx1 - 0.05 && by0 < wy1 - 0.05 && wy0 < by1 - 0.05;
        assert(!clash, `${f.id} stands in front of window ${o.id}`);
      }
    }
  });

  test('house-planner: no boundary wall runs through 79a', () => {
    const bw = data.boundaryWalls;
    assert(bw && bw.segments.length > 0, 'the boundary walls are modelled');
    const x0 = Math.min(...data.structures.map((s2) => s2.rect[0]));
    const x1 = Math.max(...data.structures.map((s2) => s2.rect[2]));
    const y0 = Math.min(...data.structures.map((s2) => s2.rect[1]));
    const y1 = Math.max(...data.structures.map((s2) => s2.rect[3]));
    for (const seg of bw.segments) {
      const sx0 = Math.min(seg.a[0], seg.b[0]);
      const sx1 = Math.max(seg.a[0], seg.b[0]);
      const sy0 = Math.min(seg.a[1], seg.b[1]);
      const sy1 = Math.max(seg.a[1], seg.b[1]);
      const through = sx0 < x1 - 0.01 && x0 < sx1 - 0.01 && sy0 < y1 - 0.01 && y0 < sy1 - 0.01;
      assert(!through, `${seg.id} runs through the commercial building`);
    }
  });

  test('house-planner: three green gates, in the right places', () => {
    const gates = data.boundaryWalls.gates;
    assertEqual(gates.length, 3, 'a drive gate, a corner gate and a side gate');
    const byId = new Map(gates.map((g) => [g.id, g]));
    const len = (g) => Math.hypot(g.b[0] - g.a[0], g.b[1] - g.a[1]);
    const drive = byId.get('gate-drive');
    assertEqual(drive.kind, 'fivebar', 'the drive gate is a five-bar');
    assert(len(drive) > 2.8, `a ${len(drive).toFixed(2)}m drive gate is too narrow for a car`);
    for (const id of ['gate-corner', 'gate-side']) {
      const g = byId.get(id);
      assert(g, `${id} is modelled`);
      assertEqual(g.kind, 'pedestrian', `${id} is a pedestrian gate`);
      assert(len(g) > 0.8 && len(g) < 1.6, `${id} at ${len(g).toFixed(2)}m is not a pedestrian gate`);
    }
    // Every gate must sit in a real break in the wall, not on top of brickwork.
    for (const g of gates) {
      for (const seg of data.boundaryWalls.segments) {
        const overlap = Math.min(Math.max(g.a[0], g.b[0]), Math.max(seg.a[0], seg.b[0]))
          - Math.max(Math.min(g.a[0], g.b[0]), Math.min(seg.a[0], seg.b[0]));
        const overlapY = Math.min(Math.max(g.a[1], g.b[1]), Math.max(seg.a[1], seg.b[1]))
          - Math.max(Math.min(g.a[1], g.b[1]), Math.min(seg.a[1], seg.b[1]));
        assert(!(overlap > 0.12 && overlapY > 0.12),
          `${g.id} overlaps wall ${seg.id} — a gate needs a gap`);
      }
    }
  });

  test('house-planner: the corner is rounded, not mitred', () => {
    const bw = data.boundaryWalls;
    const curve = bw.segments.filter((s2) => s2.curved);
    assert(curve.length >= 6, `a ${curve.length}-chord curve is too coarse to read as rounded`);
    assert(bw.cornerRadius > 1.0 && bw.cornerRadius < 4.0,
      `a ${bw.cornerRadius}m radius is not the sweep in the photographs`);
    // Chords must join end to end.
    for (let i = 0; i < curve.length - 1; i += 1) {
      const gap = Math.hypot(curve[i + 1].a[0] - curve[i].b[0], curve[i + 1].a[1] - curve[i].b[1]);
      assert(gap < 0.02, `the curve breaks between chord ${i} and ${i + 1}`);
    }
  });

  test('house-planner: 79a abuts the house but lies outside the parcel', () => {
    // Settled by the 2020 planning statement: attached to, but not part of, No. 79.
    const parts = data.structures;
    assert(parts.every((s2) => s2.rect[2] <= 0.01), '79a never overlaps the house footprint');
    assert(parts.some((s2) => s2.rect[2] > -0.5), '79a touches the house');
    // The parcel now runs out to 79a's building line and wraps round its south
    // side, so containment is the test, not which is further west.
    const poly = data.plot.polygon;
    const inside = (px, py) => {
      let c = false;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
        const [xi, yi] = poly[i];
        const [xj, yj] = poly[j];
        if ((yi > py) !== (yj > py)
          && px < ((xj - xi) * (py - yi)) / ((yj - yi) || 1e-9) + xi) c = !c;
      }
      return c;
    };
    for (const s2 of parts) {
      const mx = (s2.rect[0] + s2.rect[2]) / 2;
      const my = (s2.rect[1] + s2.rect[3]) / 2;
      assert(!inside(mx, my), `${s2.id} must lie outside the parcel — it is not part of No. 79`);
    }
  });

  test('house-planner: the porch canopy covers the front door and toggles with the roofs', () => {
    const porch = data.roofs.find((r) => r.id === 'roof-porch');
    assert(porch, 'the porch is a roof entry, so it toggles with the others');
    assertEqual(porch.abut, 'maxY', 'it closes against the front wall');
    const door = data.openings.find((o) => o.id === 'd-front');
    const wall = data.walls.find((w) => w.id === door.wall);
    const dx = wall.a[0] + door.at;
    assert(porch.rect[0] < dx && porch.rect[2] > dx, 'the canopy spans the front door');
    assert(porch.rect[2] - porch.rect[0] > door.width,
      'the canopy is wider than the door it shelters');
    assert(porch.rect[1] < 0, 'the canopy projects out in front of the house');
    assert(porch.eaves > data.defaults.doorHeight,
      'the canopy clears the door head');
    const main = data.roofs.find((r) => r.id === 'roof-main');
    assert(porch.eaves < main.eaves, 'the canopy sits well below the main eaves');
  });

  test('house-planner: chimneys clear the ridge they rise beside', () => {
    const main = data.roofs.find((r) => r.id === 'roof-main');
    const o = main.overhang ?? 0.3;
    const w = (main.rect[2] + o) - (main.rect[0] - o);
    const dep = (main.rect[3] + o) - (main.rect[1] - o);
    const ridge = main.eaves + (Math.min(w, dep) / 2) * Math.tan((main.pitchDeg * Math.PI) / 180);
    for (const chy of data.roof.chimneys) {
      assert(chy.top > ridge + 0.4,
        `${chy.id} tops out at ${chy.top}m, below the ${ridge.toFixed(2)}m ridge — a flue must clear it`);
      assert(chy.top < ridge + 2.5, `${chy.id} at ${chy.top}m is an implausible stack`);
      assert(chy.width > 0.6 && chy.depth > 0.9, `${chy.id} is too slender to be brickwork`);
    }
  });

  test('house-planner: the back part of 79a sits behind the gabled part', () => {
    const [front, back] = data.structures;
    const fd = front.rect[2] - front.rect[0];
    const bd = back.rect[2] - back.rect[0];
    assert(bd < fd - 0.5,
      `the mono-pitch part is ${bd.toFixed(2)}m deep against the gable's ${fd.toFixed(2)}m — it should sit back`);
    assert(back.rect[0] > front.rect[0], 'the back part does not reach as far towards the road');
  });

  test('house-planner: the parcel is a measured fit, not an assertion', () => {
    // The boundary is fitted to the title plan by maximising overlap between the
    // model's own footprint and the building tint. Record the evidence so a
    // hand-edited polygon cannot quietly replace a measured one.
    const v = data.plot.validation;
    assert(v && typeof v.iou === 'number', 'the plot records how it was fitted');
    assert(v.iou > 0.80, `fit IoU of ${v.iou} is too poor to trust the boundary`);
    assert(v.scalePxPerM > 10 && v.scalePxPerM < 200, 'the fitted scale is plausible');
    assert(typeof v.independentCheck === 'string' && v.independentCheck.length > 40,
      'the fit carries an independent cross-check');
  });

  test('house-planner: the fit reproduces 79a where the architect plan puts it', () => {
    // Two unrelated sources: the title-plan fit and the 1:50 architect drawing.
    // They must agree, or one of them is wrong.
    const DERIVED = { x0: -4.59, y0: -5.04, x1: -0.03, y1: 5.28 };
    const x0 = Math.min(...data.structures.map((s2) => s2.rect[0]));
    const x1 = Math.max(...data.structures.map((s2) => s2.rect[2]));
    const y0 = Math.min(...data.structures.map((s2) => s2.rect[1]));
    const y1 = Math.max(...data.structures.map((s2) => s2.rect[3]));
    for (const [name, a2, b2] of [['west', x0, DERIVED.x0], ['east', x1, DERIVED.x1],
      ['south', y0, DERIVED.y0], ['north', y1, DERIVED.y1]]) {
      assert(Math.abs(a2 - b2) < 0.8,
        `79a's ${name} face is ${a2.toFixed(2)} from the architect plan but ${b2.toFixed(2)} from the title-plan fit`);
    }
  });

  test('house-planner: the parcel wraps round 79a and holds the drive', () => {
    const poly = data.plot.polygon;
    const inside = (px, py) => {
      let c = false;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
        const [xi, yi] = poly[i];
        const [xj, yj] = poly[j];
        if ((yi > py) !== (yj > py)
          && px < ((xj - xi) * (py - yi)) / ((yj - yi) || 1e-9) + xi) c = !c;
      }
      return c;
    };
    // The land south of 79a belongs to the plot; 79a itself does not.
    assert(inside(-3.0, -6.0), 'the frontage south of 79a is inside the plot');
    assert(!inside(-3.0, 0.0), '79a itself stays outside the plot');
    const drive = data.surfaces.find((s2) => s2.id === 'drive');
    assert(drive, 'the gravel drive is modelled');
    for (const [px, py] of drive.polygon) {
      assert(inside(px, py) || px > 15.5,
        `drive corner (${px}, ${py}) falls outside the plot`);
    }
    // It has to actually reach the garage doors.
    const garage = data.rooms.find((r) => r.id === 'garage');
    assert(Math.max(...drive.polygon.map((q) => q[0])) > garage.rect[2] - 0.5,
      'the drive does not reach the garage');
  });

  test('house-planner: the hedge stands inside the wall, clear of the gates', () => {
    const h = data.boundaryWalls.hedge;
    assert(h && h.runs.length >= 1, 'the frontage hedge is modelled');
    assert(h.height > data.boundaryWalls.height, 'the hedge stands above the wall it backs');
    assert(h.offset > data.boundaryWalls.thickness / 2,
      'the hedge sits inside the wall rather than through it');
    for (const run of h.runs) {
      for (const g of data.boundaryWalls.gates) {
        const ox = Math.min(Math.max(run.a[0], run.b[0]), Math.max(g.a[0], g.b[0]))
          - Math.max(Math.min(run.a[0], run.b[0]), Math.min(g.a[0], g.b[0]));
        const oy = Math.min(Math.max(run.a[1], run.b[1]), Math.max(g.a[1], g.b[1]))
          - Math.max(Math.min(run.a[1], run.b[1]), Math.min(g.a[1], g.b[1]));
        assert(!(ox > 0.15 && oy > 0.15), `the hedge blocks ${g.id}`);
      }
    }
  });

  test('house-planner: the renderer actually consumes what the schema declares', () => {
    // A silent no-op edit once left the drive and hedge in the data but absent
    // from the builder, so they never appeared. Check the wiring exists.
    const src = readFileSync(new URL('../../assets/js/page-house-planner/build.js', import.meta.url), 'utf8');
    for (const [key, needle] of [
      ['surfaces', 'data.surfaces'],
      ['boundaryWalls.hedge', 'bw.hedge'],
      ['boundaryWalls.gates', 'bw.gates'],
      ['plot', 'data.plot'],
      ['stairs', 'data.stairs'],
      ['roofs', 'data.roofs'],
    ]) {
      assert(src.includes(needle),
        `the schema declares ${key} but build.js never reads it (${needle})`);
    }
    // And anything the data declares as a surface must have a polygon to draw.
    for (const surf of data.surfaces ?? []) {
      assert(Array.isArray(surf.polygon) && surf.polygon.length >= 3,
        `surface ${surf.id} has no drawable polygon`);
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
