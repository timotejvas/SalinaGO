// Where you are on a way you picked: on which of its rides, whether that ride is over - you
// change - and whether you near the stop where you change, when the vehicle of the next ride
// is worth showing too. What the live vehicles say decides; without them, the timetable.
// Pure: the ride, the vehicle and the time in, a yes or a number out. The panel keeps track of
// it as the vehicles move (hooks/useJourneyProgress.ts).

// imports end with .ts, so that Node can run it without a build
import type { TransitData } from "../timetable/loadData.ts";
import type { Now } from "../timetable/clock.ts";
import { secondsUntil } from "../timetable/departures.ts";
import type { Vehicle } from "../live/vehicles.ts";
import { alongStops } from "../live/track.ts";
import { arrivalOf, type Ride } from "./direct.ts";
import { rideNow, type RideNow } from "./incoming.ts";

// ---------- settings ----------
// with no live vehicle, a ride is over this long after the timetable has you there
const OVER_S = 60;
// this many stops before the one where you change, the vehicle of your next ride is shown too -
// or, with no live vehicle, this long before the timetable has you there
export const NEXT_STOPS = 3;
const NEXT_S = 6 * 60;
const NEAR_ROUTE_M = 150; // further than this from its route, a vehicle is not where it says
// ------------------------------

// Whether the ride you are on is over: its vehicle has come to where you get off, or beyond;
// with none live, the timetable has had you there for a minute.
export function rideOver(
  data: TransitData,
  ride: Ride,
  vehicle: Vehicle | undefined,
  now: Now,
): boolean {
  return vehicle
    ? reachedOff(data, ride, vehicle, now)
    : secondsUntil(arrivalTime(ride), now) < -OVER_S;
}

// Whether you near the stop where you change, on the ride you are on: a few stops before it -
// or, with no live vehicle, a few minutes before the timetable has you there. Only once its
// vehicle has picked you up (`state`, rideNow's).
export function nearingChange(
  data: TransitData,
  ride: Ride,
  vehicle: Vehicle | undefined,
  state: RideNow["state"],
  now: Now,
): boolean {
  if (state !== "gone") return false;
  const left = vehicle ? stopsToOff(data, ride, vehicle) : null;
  return left !== null ? left <= NEXT_STOPS : secondsUntil(arrivalTime(ride), now) < NEXT_S;
}

// Whether a vehicle has come to where you get off a ride, or beyond it: you change there, and
// from then on it is the vehicle of your next ride that matters.
export function reachedOff(data: TransitData, ride: Ride, vehicle: Vehicle, now: Now): boolean {
  const off = {
    ...ride,
    at: ride.at + ride.stops,
    departure: arrivalTime(ride),
  };
  return rideNow(data, off, vehicle, now).state !== "coming";
}

// How many stops a vehicle you are on still has to go to where you get off a ride: 0 when it
// is at that stop or between it and the one before. Null when it is not on that part of the
// route - before you got on, or off it.
export function stopsToOff(data: TransitData, ride: Ride, vehicle: Vehicle): number | null {
  const positions = data.variants[ride.variant].positions;
  const off = ride.at + ride.stops;
  const found = alongStops([vehicle.lon, vehicle.lat], positions.slice(ride.at, off + 1));
  if (!found || found.meters > NEAR_ROUTE_M) return null;
  return off - (ride.at + found.index) - 1;
}

// When a ride gets to where you get off, as a departure is counted: the day it leaves.
const arrivalTime = (ride: Ride) => ({ ...ride.departure, seconds: arrivalOf(ride) });
