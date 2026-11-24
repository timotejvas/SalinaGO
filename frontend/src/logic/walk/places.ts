// The ends of a journey: a station, or an address. From an address the journey starts with a
// walk to one of the stations near it, and to one it ends with a walk from one; which ones,
// and how long the walks take, along the paths of the town (graph.ts).
// No React and no map here, only data in, data out.

import type { MapStation } from "../timetable/stations.ts";
import type { TransitData } from "../timetable/loadData.ts";
import { DAY } from "../timetable/clock.ts";
import type { Journey } from "../journey/plan.ts";
import type { Address } from "./addresses.ts";
import {
  metresBetween,
  nearestPoint,
  walkAround,
  wayTo,
  type Point,
  type Reach,
  type WalkGraph,
} from "./graph.ts";

// ---------- settings ----------
const WALK_M = 1200; // the stations an address is walked to are at most this far along the paths
const FURTHER_M = 2500; // or, when none is, this far
const STATIONS = 4; // and this many of them, the nearest first
const SPEED = 1.3; // metres a second: an ordinary walk, a little under 5 km/h
// ------------------------------

export type Place = MapStation | Address;

export const isStation = (place: Place): place is MapStation => "lines" in place;

// Everything within walking distance of an address, along the paths: worked out once for an
// address, and asked for the way to any place near it.
export type Around = {
  graph: WalkGraph;
  address: Address;
  start: { point: number; metres: number }; // the point of the paths nearest to the address
  reach: Reach;
};

// A walk between an address and a station, either way: the paths are the same both ways.
export type Foot = {
  station: string; // the id of the station
  minutes: number;
  path: Point[]; // from the address to the station
};

// What is within walking distance of an address: as far as the nearest stations, at least.
// Null when the address is far from every path.
export function aroundAddress(
  graph: WalkGraph,
  stations: MapStation[],
  address: Address,
): Around | null {
  const start = nearestPoint(graph, [address.lon, address.lat]);
  if (!start) return null;
  let reach = walkAround(graph, start.point, WALK_M);
  const around = { graph, address, start, reach };
  if (walksFrom(around, stations).length === 0) {
    reach = walkAround(graph, start.point, FURTHER_M);
  }
  return { ...around, reach };
}

// The stations near an address and the walks to them, the nearest first.
export function walksFrom(around: Around, stations: MapStation[]): Foot[] {
  const here: Point = [around.address.lon, around.address.lat];
  const walks: (Foot & { metres: number })[] = [];
  for (const station of stations) {
    if (metresBetween(here, [station.lon, station.lat]) > FURTHER_M) continue;
    const walk = walkTo(around, [station.lon, station.lat]);
    if (walk) walks.push({ station: station.id, ...walk });
  }
  return walks
    .sort((a, b) => a.metres - b.metres)
    .slice(0, STATIONS)
    .map(({ station, minutes, path }) => ({ station, minutes, path }));
}

// The walk from the address to a place near it, or null when it is out of reach.
export function walkTo(around: Around, there: Point) {
  const end = nearestPoint(around.graph, there);
  const along = end ? around.reach.metres.get(end.point) : undefined;
  if (!end || along === undefined) return null;
  const metres = around.start.metres + along + end.metres;
  const here: Point = [around.address.lon, around.address.lat];
  const path = straightEnds([here, ...wayTo(around.graph, around.reach, end.point), there]);
  return { metres, minutes: minutesOf(metres), path };
}

// The way on foot between two places near each other - two platforms - along the paths, or null
// when either is far from them or the walk is longer than a change would ever be.
export function walkBetween(graph: WalkGraph, from: Point, to: Point): Point[] | null {
  const [start, end] = [nearestPoint(graph, from), nearestPoint(graph, to)];
  if (!start || !end) return null;
  const reach = walkAround(graph, start.point, FURTHER_M);
  if (!reach.metres.has(end.point)) return null;
  return straightEnds([from, ...wayTo(graph, reach, end.point), to]);
}

// A walk does not go to a corner of the paths first and come back: from the place it goes
// straight onto the path it is beside. The point of the paths nearest to a place can lie a little
// beyond it, and the way to it and back drew a hook at either end.
function straightEnds(path: Point[]): Point[] {
  const way = [...path];
  // [from, a, b, ...]: a is a detour when from is nearer to b than a is
  while (way.length > 3 && metresBetween(way[0], way[2]) <= metresBetween(way[1], way[2])) {
    way.splice(1, 1);
  }
  while (
    way.length > 3 &&
    metresBetween(way[way.length - 1], way[way.length - 3]) <=
      metresBetween(way[way.length - 2], way[way.length - 3])
  ) {
    way.splice(way.length - 2, 1);
  }
  return way;
}

// A way with its walks to and from the addresses ending at the platform itself - where the
// first line leaves and where the last one lets you off - rather than at the middle of the
// station, which can be a hundred metres down the street. You set off and arrive as much
// earlier or later as that changes the walk.
export function walksToPlatforms(
  data: TransitData,
  way: Journey,
  first: Around | null,
  last: Around | null,
): Journey {
  let { walkFirst, walkLast } = way;
  let [before, after] = [0, 0]; // minutes more on foot than the search counted with
  const ride = way.legs[0]?.ride;
  if (walkFirst && first && ride) {
    const walk = walkTo(first, data.variants[ride.variant].positions[ride.at]);
    if (walk) {
      before = walk.minutes - walkFirst.minutes;
      walkFirst = { ...walkFirst, minutes: walk.minutes, path: walk.path };
    }
  }
  const lastRide = way.legs[way.legs.length - 1]?.ride;
  if (walkLast && last && lastRide) {
    const platform = data.variants[lastRide.variant].positions[lastRide.at + lastRide.stops];
    const walk = walkTo(last, platform);
    if (walk) {
      after = walk.minutes - walkLast.minutes;
      walkLast = { ...walkLast, minutes: walk.minutes, path: [...walk.path].reverse() };
    }
  }
  if (before === 0 && after === 0 && walkFirst === way.walkFirst && walkLast === way.walkLast) {
    return way;
  }
  return {
    ...way,
    walkFirst,
    walkLast,
    departure: later(way.departure, -before * 60),
    arrival: later(way.arrival, after * 60),
    minutes: way.minutes + before + after,
  };
}

// Whole minutes on foot, at least one.
const minutesOf = (metres: number) => Math.max(1, Math.round(metres / SPEED / 60));

function later(departure: Journey["departure"], seconds: number): Journey["departure"] {
  const at = departure.day * DAY + departure.seconds + seconds;
  return { day: Math.floor(at / DAY), seconds: ((at % DAY) + DAY) % DAY };
}
