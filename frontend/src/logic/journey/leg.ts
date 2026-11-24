// The part of a route you are actually on: the stops from where you get on to where you get
// off, and the piece of the route between them. The panel hands this to the highlight layer,
// which draws it; nothing here knows about the map.

import type { TransitData, Variant } from "../timetable/loadData.ts";
import type { RouteStop } from "../timetable/stations.ts";
import { nearestOn } from "../live/track.ts";
import type { Ride } from "./direct.ts";

type Point = [number, number]; // [lon, lat]

export type Leg = {
  stops: RouteStop[]; // where you get on, every stop on the way, and where you get off
  path: Point[]; // the route between them, empty for the few routes that have none
};

// The legs of a journey as one thing to draw: every stop of every leg, a station where you
// change only once, and the pieces of route one after another.
export function legsOf(data: TransitData, rides: Ride[]): Leg {
  const stops: RouteStop[] = [];
  const path: Point[] = [];
  for (const ride of rides) {
    const leg = legOf(data, ride);
    for (const stop of leg.stops) if (!stops.some((had) => had.id === stop.id)) stops.push(stop);
    path.push(...leg.path);
  }
  return { stops, path };
}

// The leg of a ride: what to show of the route once a line has been chosen.
export function legOf(data: TransitData, ride: Ride): Leg {
  const variant = data.variants[ride.variant];
  const off = ride.at + ride.stops;
  const stops = variant.stops.slice(ride.at, off + 1).map((id, i): RouteStop => {
    const [lon, lat] = variant.positions[ride.at + i];
    return { id, name: data.stations[id].name, lon, lat };
  });
  return { stops, path: pathBetween(variant, ride.at, off) };
}

// The points of the route between two of its stops. A route is one line of points for the
// whole trip, so the piece is cut where the route passes the two platforms - at the exact
// point, not at the nearest corner, so that the drawn piece ends on the stop. The second cut
// is looked for after the first, so that a route passing a place twice is cut where the ride
// goes, and never backwards.
function pathBetween(variant: Variant, at: number, off: number): Point[] {
  const path = variant.path;
  if (!path) return [];
  const start = nearestOn(path, variant.positions[at]);
  // the route from the cut on - from the cut itself: on a route of few points both stops can
  // lie on one of its pieces, and the second cut must find them there, not at the next corner
  const rest = [start.point, ...path.slice(start.part)];
  const end = nearestOn(rest, variant.positions[off]);
  return withoutRepeats([...rest.slice(0, end.part), end.point]);
}

// A cut that lands exactly on a corner of the route repeats that corner; drawing a point
// twice in a row is of no use.
function withoutRepeats(points: Point[]): Point[] {
  return points.filter(
    (point, i) => i === 0 || point[0] !== points[i - 1][0] || point[1] !== points[i - 1][1],
  );
}
