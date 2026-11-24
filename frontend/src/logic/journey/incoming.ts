// The vehicle that is coming to pick you up: on the route of the ride, before your stop and
// still driving past it. The stream does not say which trip a vehicle runs (its trip ids do
// not match the timetable), so a vehicle is never tied to a departure; this only answers
// "something of this line is two stops away and runs three minutes late".

import { WORDS, type Words } from "../words.ts";
import type { TransitData, Variant } from "../timetable/loadData.ts";
import {
  describeDelay,
  stationNumber,
  vehiclesAlong,
  vehiclesOfLine,
  type Vehicle,
} from "../live/vehicles.ts";
import { secondsUntil } from "../timetable/departures.ts";
import type { Now } from "../timetable/clock.ts";
import type { Ride } from "./direct.ts";
import { alongStops, metersBetween, type Point } from "../live/track.ts";

// ---------- settings ----------
// a vehicle is only looked for when the ride leaves this soon: the stream does not say which
// trip a vehicle runs, so one driving now says nothing about a ride hours from now
const SOON_MIN = 30;
// and only this far before your stop, in driving time: further back the vehicle may as well
// be the trip after yours, or one that stopped telling the truth about itself long ago. A ride
// that leaves later is looked for as far back as its vehicle has to drive by then.
export const LEAD_S = 600;
const BEYOND_S = 300; // that far, and this much further
// how far off the time it is at your stop may be from when your ride leaves, for it to be yours:
// the stream gives delays in whole minutes, so a little over a minute either way. More, and the
// trip after yours - a few minutes behind and running a little late - was taken for it.
const MATCH_S = 90;
// a vehicle at the first stop of its route waits there until its trip starts: it is taken for
// yours when your trip starts from there within this long
const LAYOVER_S = 600;
const AT_STOP_M = 40; // this near the platform a vehicle is at your stop
// ------------------------------

// A vehicle on its way to your stop.
export type Incoming = {
  vehicle: Vehicle;
  stopsAway: number; // how many stops before yours it is, at least one
  minutes?: number; // how long it drives from the stop it passed last to yours, when known
  seconds?: number; // the same, exactly
  soonest?: number; // how long it still drives at least: from the stop after the one it passed
};

// The vehicle coming for a ride, of all the live ones, or null when the ride leaves too far
// from now for a vehicle to mean anything or when none of them is on the way. The stream does
// not say which trip a vehicle runs, so the nearest one behind your stop is only taken for
// yours when it gets there about when your ride leaves - its delay included - and not when it
// is the trip before yours, there long before, or one that only comes long after.
export function incomingSoon(
  data: TransitData,
  vehicles: Vehicle[],
  ride: Ride,
  now: Now,
): Incoming | null {
  if (secondsUntil(ride.departure, now) > SOON_MIN * 60) return null;
  const variant = data.variants[ride.variant];
  const ofLine = vehiclesOfLine(vehicles, variant.line);
  const lead = Math.max(LEAD_S, secondsUntil(ride.departure, now) + BEYOND_S);
  const coming = incomingAll(ofLine, variant, ride.at, ride.at + ride.stops, ride.pattern, lead);
  // the nearest is not always yours - it may be the trip before, running late - so each of them
  // is tried, the nearest first, and the first whose time fits is the one
  return coming.find((found) => fits(found, ride, now)) ?? null;
}

// Whether a vehicle coming gets to your stop about when your ride leaves. It is there some
// time between the drive from the stop after the one it passed and the drive from the stop it
// passed; your ride must leave about then, its delay counted. Still at the first stop of the
// route it is not driving yet: it leaves when the trip starts, however long until then, so only
// that its trip starts soon is asked.
function fits(found: Incoming, ride: Ride, now: Now): boolean {
  if (found.seconds === undefined) return true; // without the times of the trip, nearest is best
  const leaves = secondsUntil(ride.departure, now) + believable(found.vehicle.delay) * 60;
  const soonest = found.soonest ?? 0;
  const atStart = found.stopsAway === ride.at;
  const latest = atStart ? found.seconds + LAYOVER_S : found.seconds;
  return leaves >= soonest - MATCH_S && leaves <= latest + MATCH_S;
}

// Where your vehicle is, with respect to the stop you get on at: still coming - and in about
// how long it is there, the timetable and its delay counted - standing at it, or gone from it.
// What the card says rests on this, not on the clock alone: a vehicle running late is still
// coming when the timetable says it has left.
export type RideNow =
  { state: "coming"; seconds: number } | { state: "atStop" } | { state: "gone" };

export function rideNow(data: TransitData, ride: Ride, vehicle: Vehicle, now: Now): RideNow {
  const positions = data.variants[ride.variant].positions;
  const point: Point = [vehicle.lon, vehicle.lat];
  const expected = secondsUntil(ride.departure, now) + believable(vehicle.delay) * 60;
  if (metersBetween(point, positions[ride.at]) < AT_STOP_M) return { state: "atStop" };
  // which stretch of the route it is on: the one to your stop, or one after it
  const from = Math.max(0, ride.at - 1);
  const found = alongStops(point, positions.slice(from, ride.at + 2));
  const before = ride.at === 0 ? expected > 0 : !found || from + found.index < ride.at;
  return before ? { state: "coming", seconds: Math.max(0, expected) } : { state: "gone" };
}

// A delay as far as it can be believed: the stream now and then reports one hours off.
const believable = (delay: number) => (delay > 90 || delay < -10 ? 0 : delay);

// The nearest vehicle behind your stop that takes you the whole way, from where you get on
// (`at`) to where you get off (`off`), or null when none of them is on the way. Given the
// running times of the trip (`pattern`), it looks only LEAD_S of driving back from your stop,
// and says how long the vehicle still drives to it.
export function incomingTo(
  vehicles: Vehicle[],
  variant: Variant,
  at: number,
  off: number,
  pattern?: number[],
  lead = LEAD_S,
): Incoming | null {
  return incomingAll(vehicles, variant, at, off, pattern, lead)[0] ?? null;
}

// Every vehicle behind your stop that takes you the whole way, the nearest first.
function incomingAll(
  vehicles: Vehicle[],
  variant: Variant,
  at: number,
  off: number,
  pattern?: number[],
  lead = LEAD_S,
): Incoming[] {
  const found: Incoming[] = [];
  const stops = variant.stops.map((id) => ({ id }));
  const numbers = variant.stops.map(stationNumber);
  const along = vehiclesAlong(vehicles, stops);
  // a vehicle is placed after the stop it passed last, so one at your stop has already left
  // it; the search starts at the stop before yours and goes back along the route
  for (let i = at - 1; i >= 0; i--) {
    const driving = pattern ? pattern[at] - pattern[i] : undefined;
    if (driving !== undefined && driving > lead) break;
    for (const vehicle of along[i]) {
      // a vehicle whose trip ends before you get off is of no use, even on the right route
      if (numbers.lastIndexOf(vehicle.finalStop) < off) continue;
      found.push({
        vehicle,
        stopsAway: at - i,
        minutes: driving === undefined ? undefined : Math.round(driving / 60),
        seconds: driving,
        soonest: pattern ? pattern[at] - pattern[i + 1] : undefined,
      });
    }
  }
  return found;
}

// ---------- in words ----------

// Whether a vehicle runs to the timetable, as far as its delay can be believed: under a minute
// either way.
export function onTime(vehicle: Vehicle): boolean {
  return Math.abs(Math.round(believable(vehicle.delay))) < 1;
}

// How soon a vehicle that is coming gets there, as the panel says it: "arriving" within the
// last moments, otherwise in how many minutes - in small letters, to stand inside a sentence.
export function describeComing(seconds: number, w: Words = WORDS.en): string {
  return seconds < ARRIVING_S ? w.arriving.toLowerCase() : w.inMinutes(Math.round(seconds / 60));
}
const ARRIVING_S = 45; // closer than this, a vehicle is arriving rather than minutes away

// What the strip says beside a live vehicle: how late it runs - "on time", "2 min late" - as
// far as that can be believed.
export function describeRunning(vehicle: Vehicle, w: Words = WORDS.en): string {
  return describeDelay(believable(vehicle.delay), w);
}
