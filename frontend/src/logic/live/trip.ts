// The trip a live vehicle is on, as far as the timetable and the stream tell it: the route it
// drives (the one of its line that has the stop it passed last and, later, the stop its trip
// ends at), where on it the vehicle is, and how long it still takes to each stop ahead - from
// the running times of the route, starting from where the vehicle is now, so its delay is in it.
// No React and no map here, only data in, data out.

import type { TransitData, Variant } from "../timetable/loadData.ts";
import { tripCount } from "../timetable/lines.ts";
import { shareBetween, type Point } from "./track.ts";
import { stationNumber, type Vehicle } from "./vehicles.ts";

export type TripStop = { id: string; name: string; lon: number; lat: number; seconds: number };

export type VehicleTrip = {
  variant: Variant;
  passed: number; // the stop of the route it passed last
  share: number; // how far it is from there to the next one, 0 - 1
  ahead: TripStop[]; // the stops still to come, each with the seconds until it is there
};

export function vehicleTrip(data: TransitData, vehicle: Vehicle): VehicleTrip | null {
  let best: { variant: Variant; passed: number; score: number } | null = null;
  for (const variant of data.variants) {
    if (variant.line !== vehicle.line || variant.kind !== vehicle.kind) continue;
    const numbers = variant.stops.map(stationNumber);
    const passed = numbers.indexOf(vehicle.lastStop);
    const ends = numbers.lastIndexOf(vehicle.finalStop);
    if (passed < 0 || ends <= passed) continue;
    // a route that ends where the trip ends, and is run most often, is the likeliest one
    const score = (ends === numbers.length - 1 ? 1e6 : 0) + tripCount(variant);
    if (!best || score > best.score) best = { variant, passed, score };
  }
  if (!best) return null;
  const { variant, passed } = best;
  const pattern = variant.patterns[0] ?? variant.stops.map(() => 0);
  const point: Point = [vehicle.lon, vehicle.lat];
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
