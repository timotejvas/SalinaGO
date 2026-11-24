// Rides from one station to another without changing: which lines go there, and when.
// Data in, data out, as everywhere in logic/ — no React and no map.
//
// A line can serve the same pair with several routes (the full route and a short-turn, say),
// and each route can have several running times during the day. Both are looked at, and the
// rides are grouped by line, because that is the choice a passenger makes: which one to take.

import type { TransitData, Variant } from "../timetable/loadData.ts";
import { secondsUntil, tripsOn, type Departure } from "../timetable/departures.ts";
import { addDays, DAY, type Now } from "../timetable/clock.ts";

// ---------- settings ----------
const DAYS_AHEAD = 1; // how far ahead a ride is looked for: the rest of today and tomorrow
const RIDES_PER_LINE = 4; // how many of the next rides of one line are kept
// ------------------------------

// One ride of one trip: get on at A, get off at B.
export type Ride = {
  variant: number; // which route it runs, as an index into TransitData.variants
  at: number; // where you get on, as a position in that route's stops
  departure: Departure; // when it leaves A
  minutes: number; // how long it takes to B
  stops: number; // how many stops to stay on for (so you get off at `at + stops`)
  // the running times of the trip you are on, from its start to each stop of the route; it is
  // the array the timetable already holds, so carrying it costs nothing and tells the times
  // along the way: the difference between two of its numbers
  pattern: number[];
};

// When a ride gets to B, in seconds after midnight of the day it leaves.
export const arrivalOf = (ride: Ride) => ride.departure.seconds + ride.minutes * 60;

// One line that goes from A to B without a change, with its next rides.
export type DirectOption = {
  line: string; // "1", "N95"
  kind: Variant["kind"];
  headsign: string; // where that line is heading, from the next ride
  rides: Ride[]; // the next rides, the soonest first
};

// The lines that go from `from` to `to` without a change, the one leaving soonest first.
// Empty when there is no such line, or none runs in the time looked at.
export function directConnections(
  data: TransitData,
  from: string,
  to: string,
  now: Now,
): DirectOption[] {
  if (from === to) return [];
  const byLine = new Map<string, Ride[]>();
  for (const variant of data.variants) {
    const at = variant.stops.indexOf(from);
    if (at < 0) continue;
    // after `at`, so that the ride goes the way the vehicle drives, and so that a route
    // passing a station twice is taken as the leg that actually leads to `to`
    const off = variant.stops.indexOf(to, at + 1);
    if (off < 0) continue;
    const rides = byLine.get(variant.line) ?? [];
    rides.push(...ridesOf(data, variant, at, off, now));
    byLine.set(variant.line, rides);
  }

  const options: DirectOption[] = [];
  for (const [line, rides] of byLine) {
    if (rides.length === 0) continue;
    rides.sort((a, b) => secondsUntil(a.departure, now) - secondsUntil(b.departure, now));
    const next = rides.slice(0, RIDES_PER_LINE);
    const variant = data.variants[next[0].variant];
    options.push({ line, kind: variant.kind, headsign: variant.headsign, rides: next });
  }
  return options.sort(
    (a, b) => secondsUntil(a.rides[0].departure, now) - secondsUntil(b.rides[0].departure, now),
  );
}

// The rides one route offers from now on: every trip it makes in the days looked at,
// from yesterday on, because a night trip of yesterday's service day leaves after midnight.
function ridesOf(data: TransitData, variant: Variant, at: number, off: number, now: Now): Ride[] {
  const rides: Ride[] = [];
  for (let day = -1; day <= DAYS_AHEAD; day++) {
    for (const trip of tripsOn(data, variant, addDays(now.date, day))) {
      const leaves = day * DAY + trip.start + trip.pattern[at];
      if (leaves < now.seconds) continue;
      rides.push({
        variant: variant.id,
        at,
        departure: { day: Math.floor(leaves / DAY), seconds: leaves % DAY },
        minutes: Math.round((trip.pattern[off] - trip.pattern[at]) / 60),
        stops: off - at,
        pattern: trip.pattern,
      });
    }
  }
  return rides;
}
