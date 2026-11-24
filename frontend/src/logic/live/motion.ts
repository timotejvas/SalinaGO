// Where a live vehicle most likely is now, rather than where it was when it was last seen.
// The stream sends a position of every vehicle about every ten seconds, measured some two
// seconds before it arrives. A vehicle does not stop between two of them, so we keep it going
// along its route, evenly, at the speed it drove between its last two positions, for as long
// as the next position takes to come. Only when it is late do we start to doubt the guess and
// let it slow down, because then something is holding the vehicle up.
// Two things about stops are certain, and the guess keeps to them: a vehicle is never shown
// beyond the next stop before it - it will stop there, and it brakes for it over the last few
// metres rather than stopping dead - and one that stands at a stop is shown on the platform
// itself, not wherever its GPS puts it a few metres beside.
// Pure: points and times in, points out. The map draws what this works out.

// imports end with .ts, so that Node can run it without a build
import { distanceOn, metersBetween, placeOn, pointAt, routeAhead, type Point } from "./track.ts";

// ---------- settings ----------
// For this long after a position the vehicle is trusted to drive on at its speed: a new
// position comes every 10.1 s, measured, so this is the time it takes plus a little.
const TRUST_S = 11;
// When the next position is late, the guess slows down: from then on it covers at most this
// many seconds' worth more, two thirds of that in the first of them.
const DOUBT_S = 3;
const BRAKE_M = 30; // a vehicle brakes for its stop over this last stretch before it
const MAX_SPEED = 25; // m/s (90 km/h): faster than this between two positions is a jump
const MAX_GAP_S = 40; // two positions further apart than this say nothing about a speed
const AHEAD_M = 400; // how much of the route beyond the last position is kept to drive on
const STILL_M = 8; // less than this between two positions is standing: GPS wanders that much
const STOP_M = 25; // a platform this close to a vehicle, or to its route, is where it stops
const PASSED_M = 2; // a stop this little ahead is the one it is at, and does not hold it back
// ------------------------------

// What we know of how a vehicle moves.
export type Motion = {
  point: Point; // where it was last seen
  time: number; // when that was measured, ms since 1970 (the stream's TimeUpdated)
  speed: number; // metres a second along its route; 0 when standing or not on a route
  // the stretch of its route from the position before the last one to a little beyond the
  // last one, and how far along it the last position lies; null when it is on no route
  route: Point[] | null;
  at: number;
  stop: number; // how far along the route the next stop is: the guess goes no further
  platform: boolean; // it was last seen standing on a platform of its line
};

// A vehicle seen for the first time: it is where it is, and we know nothing of its speed.
export function standing(point: Point, time: number): Motion {
  return { point, time, speed: 0, route: null, at: 0, stop: 0, platform: false };
}

// What a new position says about a vehicle we already know: the route it is on, and how fast
// it drove along it since the position before.
// `stops` are the platforms of its line (track.ts, stopsByLine).
export function moved(
  before: Motion,
  point: Point,
  time: number,
  routes: Point[][],
  stops: Point[],
): Motion {
  const seconds = (time - before.time) / 1000;
  if (seconds <= 0) return before; // the same position again, or an older one
  if (seconds > MAX_GAP_S) return standing(point, time);
  if (metersBetween(before.point, point) < STILL_M) {
    // standing: on the platform when it is at one, and on the route it was on
    const platform = platformNear(point, stops);
    const here = platform ?? point;
    const at = before.route ? distanceOn(before.route, here) : 0;
    return { ...before, point: here, time, speed: 0, at, stop: at, platform: platform !== null };
  }
  const found = routeAhead(before.point, point, routes, AHEAD_M);
  if (!found) return standing(point, time);
  const speed = found.at / seconds;
  if (speed > MAX_SPEED) return standing(point, time);
  const stop = nextStop(found.route, found.at, stops);
  return { point, time, speed, route: found.route, at: found.at, stop, platform: false };
}

// Whether a vehicle drawn this far along its route is at a stop: it was seen standing on a
// platform, or it is driving and the guess has brought it to the next stop, where it waits.
// Standing anywhere else - at the lights, in a jam - is not being at a stop.
export function atStop(motion: Motion, distance: number): boolean {
  if (motion.speed === 0) return motion.platform;
  return Number.isFinite(motion.stop) && distance >= motion.stop - 1;
}

// The platform of its line a vehicle stands at, when one is close enough.
function platformNear(point: Point, stops: Point[]): Point | null {
  let best: Point | null = null;
  let nearest = STOP_M;
  for (const stop of stops) {
    const meters = metersBetween(point, stop);
    if (meters < nearest) [best, nearest] = [stop, meters];
  }
  return best;
}

// How far along a route the first stop ahead of a distance lies; the end of what we have of
// the route when no stop is on it.
function nextStop(route: Point[], at: number, stops: Point[]): number {
  let next = Infinity;
  for (const stop of stops) {
    const { along, meters } = placeOn(route, stop);
    if (meters <= STOP_M && along > at + PASSED_M && along < next) next = along;
  }
  return next;
}

// How far along its route a vehicle most likely is at the given time.
export function expectedAt(motion: Motion, now: number): number {
  const seconds = Math.max(0, (now - motion.time) / 1000);
  const trusted = Math.min(seconds, TRUST_S);
  const doubted = Math.max(0, seconds - TRUST_S);
  const free = motion.speed * (trusted + DOUBT_S * (1 - Math.exp(-doubted / DOUBT_S)));
  return motion.at + braked(free, motion.stop - motion.at);
}

// How far a vehicle gets, when it would get `free` metres on an open route but its stop is
// `gap` metres ahead: the same at first, then slowing over the last BRAKE_M so that it comes
// to the stop without ever passing it - smoothly, with no change of speed at the moment it
// starts to brake.
function braked(free: number, gap: number): number {
  if (gap <= 0) return 0;
  const brake = Math.min(BRAKE_M, gap);
  const from = gap - brake; // where the braking starts
  if (free <= from) return free;
  return from + brake * (1 - Math.exp(-(free - from) / brake));
}

// The point a distance along the route of a vehicle; where it was last seen when it is on no
// route.
export function pointOn(motion: Motion, distance: number): Point {
  return motion.route ? pointAt(motion.route, distance) : motion.point;
}

// How far along the route of a vehicle a place lies: where a vehicle that was already drawn
// somewhere carries on from, when its route changes under it.
export function distanceOf(motion: Motion, place: Point): number {
  return motion.route ? distanceOn(motion.route, place) : 0;
}
