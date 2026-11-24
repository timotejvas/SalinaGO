// Puts live vehicles on the routes of their line. A GPS position can be metres off the track,
// and between two positions (about 10 s apart) a vehicle does not drive in a straight line,
// so we "snap" each position onto the nearest route of its line and find the way along that
// route from the previous position to the new one.
// Pure geometry: [lon, lat] points in, points out.

// imports end with .ts, so that Node can run it without a build
import type { TransitData } from "../timetable/loadData.ts";

// ---------- settings ----------
const SNAP_M = 40; // a position this close to a route of its line is moved onto it
const MAX_DETOUR = 3; // the way along a route may be at most this many times the straight line
const DETOUR_EXTRA_M = 300; // … plus this (short moves around a corner)
const MAX_JUMP_M = 1500; // a longer move without a route is a jump: no way in between
// ------------------------------

export type Point = [number, number]; // [lon, lat]

// The routes of each line: line number -> the routes of all its variants (both directions).
export function routesByLine(data: TransitData): Map<string, Point[][]> {
  const routes = new Map<string, Point[][]>();
  for (const variant of data.variants) {
    if (!variant.path) continue;
    routes.set(variant.line, [...(routes.get(variant.line) ?? []), variant.path]);
  }
  return routes;
}

// The platforms of each line: line number -> where its vehicles stop, in every direction.
export function stopsByLine(data: TransitData): Map<string, Point[]> {
  const stops = new Map<string, Point[]>();
  for (const variant of data.variants) {
    stops.set(variant.line, [...(stops.get(variant.line) ?? []), ...variant.positions]);
  }
  return stops;
}

// The point moved onto the nearest route, when one is closer than SNAP_M; otherwise the point.
export function snap(point: Point, routes: Point[][]): Point {
  let best: Projection | null = null;
  for (const route of routes) {
    const projection = project(point, route);
    if (projection.meters <= SNAP_M && (!best || projection.meters < best.meters)) {
      best = projection;
    }
  }
  return best ? best.point : point;
}

// The way a vehicle went from `from` to `to`, as points from `from` to `to`:
//   - along a route of its line, when both lie on it and the way goes forward and is not
//     much longer than the straight line,
//   - otherwise the straight line, or only `to` when it is too far away (a jump).
export function wayBetween(from: Point, to: Point, routes: Point[][]): Point[] {
  const straight = metersBetween(from, to);
  if (straight < 1) return [to];
  const best = routeBetween(from, to, routes);
  if (best) return slice(best.route, best.start, best.end);
  return straight > MAX_JUMP_M ? [to] : [from, to];
}

// The route a vehicle drives along, judged from two of its positions: the stretch of it from
// `from` to `beyond` metres past `to`, and how far along that stretch `to` lies. Null when
// the two do not lie on one route of the line in driving order.
export function routeAhead(
  from: Point,
  to: Point,
  routes: Point[][],
  beyond: number,
): { route: Point[]; at: number } | null {
  if (metersBetween(from, to) < 1) return null;
  const best = routeBetween(from, to, routes);
  if (!best) return null;
  const route = slice(best.route, best.start, best.end + beyond);
  return { route, at: best.end - best.start };
}

// The route of the line on which `to` comes after `from`, and where both lie on it; the
// shortest such way, and only when it is not a long detour compared with the straight line.
function routeBetween(from: Point, to: Point, routes: Point[][]) {
  const straight = metersBetween(from, to);
  let best: { route: Point[]; start: number; end: number } | null = null;
  for (const route of routes) {
    const a = project(from, route);
    const b = project(to, route);
    if (a.meters > SNAP_M || b.meters > SNAP_M) continue;
    const along = b.along - a.along; // negative: the route goes the other way
    if (along < 0 || along > straight * MAX_DETOUR + DETOUR_EXTRA_M) continue;
    if (!best || along < best.end - best.start) best = { route, start: a.along, end: b.along };
  }
  return best;
}

// How far along a route a place lies, where the route comes closest to it.
export function distanceOn(route: Point[], place: Point): number {
  return project(place, route).along;
}

// Where along a route a place lies and how far from the route it is, in metres.
export function placeOn(route: Point[], place: Point): { along: number; meters: number } {
  const { along, meters } = project(place, route);
  return { along, meters };
}

// ---------- geometry ----------
// Distances in metres on a flat map around Brno: exact enough for a few kilometres.

const M_PER_DEG = 111_320;
const LON_SCALE = Math.cos((49.2 * Math.PI) / 180); // a degree of longitude is shorter here

// The distance between two points in metres.
export function metersBetween(a: Point, b: Point) {
  return Math.hypot((b[0] - a[0]) * M_PER_DEG * LON_SCALE, (b[1] - a[1]) * M_PER_DEG);
}

// The nearest point of a route: the point, how far it is, how far along the route it lies
// and on which of its parts (the index of the point the part ends at).
type Projection = { point: Point; meters: number; along: number; part: number };

// Where a route comes closest to a place: used to cut a route exactly at a platform, so that
// a drawn piece of it ends on the stop and not at the nearest corner of the line.
export function nearestOn(route: Point[], place: Point): { point: Point; part: number } {
  const { point, part } = project(place, route);
  return { point, part };
}

function project(p: Point, route: Point[]): Projection {
  let best: Projection = { point: route[0], meters: Infinity, along: 0, part: 0 };
  let along = 0;
  for (let i = 1; i < route.length; i++) {
    const a = route[i - 1];
    const b = route[i];
    const length = metersBetween(a, b);
    // where on the segment a-b the point p is closest, 0 = at a, 1 = at b
    const dx = (b[0] - a[0]) * LON_SCALE;
    const dy = b[1] - a[1];
    const lengthSq = dx * dx + dy * dy;
    const t =
      lengthSq === 0
        ? 0
        : Math.max(
            0,
            Math.min(1, ((p[0] - a[0]) * LON_SCALE * dx + (p[1] - a[1]) * dy) / lengthSq),
          );
    const point: Point = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    const meters = metersBetween(p, point);
    if (meters < best.meters) best = { point, meters, along: along + length * t, part: i };
    along += length;
  }
  return best;
}

// The part of a route between two distances along it, as points.
function slice(route: Point[], start: number, end: number): Point[] {
  const points: Point[] = [pointAt(route, start)];
  let along = 0;
  for (let i = 1; i < route.length; i++) {
    along += metersBetween(route[i - 1], route[i]);
    if (along > start && along < end) points.push(route[i]);
  }
  points.push(pointAt(route, end));
  return points;
}

// The point at a distance along a route.
// How far a point lies from one place towards another, 0 at the first and 1 at the second:
// where a vehicle is between the stop it passed last and the next one.
export function shareBetween(point: Point, from: Point, to: Point): number {
  const whole = metersBetween(from, to);
  if (whole === 0) return 0;
  const done = metersBetween(from, point);
  const left = metersBetween(point, to);
  return Math.max(
    0,
    Math.min(1, (done * done - left * left + whole * whole) / (2 * whole * whole)),
  );
}

// Where a point is along a line of stops: after which of them (`index`), how far towards the
// next one (`share`, 0 - 1), and how far from that line it is (`meters`). Null for fewer than
// two stops.
export function alongStops(point: Point, stops: Point[]) {
  let best: { index: number; share: number; meters: number } | null = null;
  for (let i = 0; i + 1 < stops.length; i++) {
    const share = shareBetween(point, stops[i], stops[i + 1]);
    const [[fromLon, fromLat], [toLon, toLat]] = [stops[i], stops[i + 1]];
    const at: Point = [fromLon + (toLon - fromLon) * share, fromLat + (toLat - fromLat) * share];
    const meters = metersBetween(point, at);
    if (!best || meters < best.meters) best = { index: i, share, meters };
  }
  return best;
}

export function pointAt(route: Point[], distance: number): Point {
  let along = 0;
  for (let i = 1; i < route.length; i++) {
    const a = route[i - 1];
    const b = route[i];
    const length = metersBetween(a, b);
    if (along + length >= distance) {
      const t = length === 0 ? 0 : (distance - along) / length;
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    }
    along += length;
  }
  return route[route.length - 1];
}
