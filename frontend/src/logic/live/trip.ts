// The trip a live vehicle is on, as far as the timetable and the stream tell it: the route it
// drives (the one of its line that has the stop it passed last and, later, the stop its trip
// ends at), where on it the vehicle is, and how long it still takes to each stop ahead - from
// the running times of the route, starting from where the vehicle is now, so its delay is in it.
// No React and no map here, only data in, data out.

import type { TransitData, Variant } from "../timetable/loadData.ts";
import { tripCount } from "../timetable/lines.ts";
import { metersBetween, shareBetween, type Point } from "./track.ts";
import { stationNumber, type Vehicle } from "./vehicles.ts";

// ---------- settings ----------
const ON_ROUTE_M = 150; // further than this from a stretch of a route, a vehicle is not on it
// ------------------------------

export type TripStop = { id: string; name: string; lon: number; lat: number; seconds: number };

export type VehicleTrip = {
  variant: Variant;
  passed: number; // the stop of the route it passed last
  share: number; // how far it is from there to the next one, 0 - 1
  ahead: TripStop[]; // the stops still to come, each with the seconds until it is there
};

// The trip of a vehicle, or null when it has none any more - its trip is over (it waits at the
// end, or drives to the depot), or it is where our routes are not (outside Brno). Such a
// vehicle still sends its position, but there is nothing on the map for it to ride along, and
// the app does not show it (inService).
export function vehicleTrip(data: TransitData, vehicle: Vehicle): VehicleTrip | null {
  if (vehicle.lastStop === vehicle.finalStop) return null; // there: the trip is over
  const variants = routesOfLine(data, vehicle.kind, vehicle.line);
  const point: Point = [vehicle.lon, vehicle.lat];
  let best: { variant: Variant; passed: number; score: number } | null = null;
  for (const variant of variants) {
    const numbers = variant.stops.map(stationNumber);
    const passed = numbers.indexOf(vehicle.lastStop);
    const ends = numbers.lastIndexOf(vehicle.finalStop);
    if (passed < 0 || ends <= passed) continue;
    // a route that ends where the trip ends, and is run most often, is the likeliest one
    const score = (ends === numbers.length - 1 ? 1e6 : 0) + tripCount(variant);
    if (!best || score > best.score) best = { variant, passed, score };
  }
  // a trip that ends outside Brno, where our routes stop short of it: its final stop is on none
  // of them. Its route is then the one whose next stretch the vehicle is on - the other
  // direction passes the same stop going the other way.
  if (!best && !isOurs(data, vehicle.finalStop)) {
    let meters = ON_ROUTE_M;
    for (const variant of variants) {
      const passed = variant.stops.findIndex((id) => stationNumber(id) === vehicle.lastStop);
      if (passed < 0 || passed >= variant.stops.length - 1) continue;
      const [a, b] = [variant.positions[passed], variant.positions[passed + 1]];
      const share = shareBetween(point, a, b);
      const on: Point = [a[0] + (b[0] - a[0]) * share, a[1] + (b[1] - a[1]) * share];
      const off = metersBetween(point, on);
      if (off < meters) [meters, best] = [off, { variant, passed, score: 0 }];
    }
  }
  if (!best) return null;
  const { variant, passed } = best;
  const pattern = variant.patterns[0] ?? variant.stops.map(() => 0);
  const next = Math.min(passed + 1, variant.stops.length - 1);
  const share = shareBetween(point, variant.positions[passed], variant.positions[next]);
  // where it is now, in the running times of the route
  const at = pattern[passed] + share * (pattern[next] - pattern[passed]);
  const end = variant.stops.lastIndexOf(
    variant.stops.find((id) => stationNumber(id) === vehicle.finalStop) ?? "",
  );
  const last = end > passed ? end : variant.stops.length - 1;
  const ahead: TripStop[] = [];
  for (let i = passed + 1; i <= last; i++) {
    const [lon, lat] = variant.positions[i];
    const id = variant.stops[i];
    ahead.push({ id, name: data.stations[id].name, lon, lat, seconds: pattern[i] - at });
  }
  return { variant, passed, share, ahead };
}

// Whether a vehicle is in service as far as the app can tell: on a trip of ours, with a route
// to ride along. The others are not shown, though they still send where they are.
export function inService(data: TransitData, vehicle: Vehicle): boolean {
  return vehicleTrip(data, vehicle) !== null;
}

// The routes of a line, looked up once for each timetable rather than for every vehicle.
const linesOf = new WeakMap<TransitData, Map<string, Variant[]>>();
function routesOfLine(data: TransitData, kind: Variant["kind"], line: string): Variant[] {
  let lines = linesOf.get(data);
  if (!lines) {
    lines = new Map();
    for (const variant of data.variants) {
      const key = `${variant.kind} ${variant.line}`;
      lines.set(key, [...(lines.get(key) ?? []), variant]);
    }
    linesOf.set(data, lines);
  }
  return lines.get(`${kind} ${line}`) ?? [];
}

// Whether a station number of the stream is one of our stations (in Brno).
const numbersOf = new WeakMap<TransitData, Set<number>>();
function isOurs(data: TransitData, number: number): boolean {
  let numbers = numbersOf.get(data);
  if (!numbers) {
    numbers = new Set();
    for (const id of Object.keys(data.stations)) {
      const found = stationNumber(id);
      if (found !== null) numbers.add(found);
    }
    numbersOf.set(data, numbers);
  }
  return numbers.has(number);
}
