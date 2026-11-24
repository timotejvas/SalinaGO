// The lines: what kind of vehicle each one is, which numbers the panel offers and which of
// them run now, the directions of a line and the routes its trips take, where the routes
// other than the shown one start, end and stop, and the routes of all of them together.
// No React and no map here, only data in, data out.
// Questions about time (now, next trips, when a route runs) are in departures.ts, and the stops
// of a route are in stations.ts.
// ui/lines/ shows the result show the result and hand it to the map.

// imports end with .ts, so that Node can run it without a build
import type { TransitData, Variant } from "./loadData.ts";
import type { RouteStop } from "./stations.ts";
import { isRunning } from "./departures.ts";
import type { Now } from "./clock.ts";

// ---------- settings ----------
// the main route is the longest one that at least this share of the trips of its direction take
const COMMON_SHARE = 0.2;
// ------------------------------

export type Kind = Variant["kind"];
type Point = [number, number]; // [lon, lat]

// One direction of a line. Only one route is shown on the map at a time: the main route,
// or one of the other routes the trips of this direction take (short-turns, depot trips).
export type Direction = {
  id: string; // routeId + direction
  label: string; // final destination of the main route
  main: Variant;
  others: Variant[]; // most trips first
};

// How many trips a variant has in the whole timetable.
export const tripCount = (variant: Variant) =>
  Object.values(variant.trips).reduce((sum, times) => sum + times.length / 2, 0);

// ---------- what the panel offers ----------

// The line numbers of one kind, sorted. `running` is false when nothing of the line runs soon.
export function lineNumbers(
  data: TransitData,
  kind: Kind,
  now: Now,
): [line: string, running: boolean][] {
  const lines = new Map<string, boolean>();
  for (const variant of data.variants) {
    if (variant.kind !== kind) continue;
    lines.set(variant.line, (lines.get(variant.line) ?? false) || isRunning(data, variant, now));
  }
  return [...lines].sort((a, b) => a[0].localeCompare(b[0], "cs", { numeric: true }));
}

// The directions of one line, each with its main route and its other routes.
// The main route is the longest route that at least COMMON_SHARE of the trips take:
// the whole line, not a short-turn, and not a rare trip to the depot.
export function directionsOf(data: TransitData, kind: Kind, line: string): Direction[] {
  const groups = new Map<string, Variant[]>();
  for (const variant of data.variants) {
    if (variant.kind !== kind || variant.line !== line) continue;
    const id = `${variant.routeId}|${variant.direction}`;
    groups.set(id, [...(groups.get(id) ?? []), variant]);
  }

  return [...groups].map(([id, variants]) => {
    const total = variants.reduce((sum, variant) => sum + tripCount(variant), 0);
    const isCommon = (variant: Variant) => tripCount(variant) >= COMMON_SHARE * total;

    // when trips are spread over many routes, none may reach the share; then all count
    const candidates = variants.some(isCommon) ? variants.filter(isCommon) : variants;
    const main = candidates.reduce((a, b) => (b.stops.length > a.stops.length ? b : a));

    const others = variants
      .filter((variant) => variant !== main)
      .sort((a, b) => tripCount(b) - tripCount(a));

    return { id, label: main.headsign, main, others };
  });
}

// The routes of all variants of a line, in all its directions: where its vehicles may go.
// Variants without a calculated route are left out.
export function routesOf(directions: Direction[]): [number, number][][] {
  return directions
    .flatMap((direction) => [direction.main, ...direction.others])
    .flatMap((variant) => (variant.path ? [variant.path] : []));
}

// A short name of a route for people: "Nemocnice Bohunice → Mendlovo náměstí".
export function routeName(data: TransitData, variant: Variant): string {
  return `${data.stations[variant.stops[0]].name} → ${destinationOf(data, variant)}`;
}

// The last station of a route in Brno: "Mendlovo náměstí".
export function destinationOf(data: TransitData, variant: Variant): string {
  return data.stations[variant.stops[variant.stops.length - 1]].name;
}

// Where the other routes of a direction start or end, when that differs from the main route:
// short-turns and trips to and from the depot. Each name only once, most trips first.
export function otherEnds(
  data: TransitData,
  direction: Direction,
): { starts: string[]; ends: string[] } {
  const mainStart = data.stations[direction.main.stops[0]].name;
  const mainEnd = destinationOf(data, direction.main);
  const starts = direction.others.map((variant) => data.stations[variant.stops[0]].name);
  const ends = direction.others.map((variant) => destinationOf(data, variant));
  return {
    starts: [...new Set(starts)].filter((name) => name !== mainStart),
    ends: [...new Set(ends)].filter((name) => name !== mainEnd),
  };
}

// The stations of the other routes of a line that the shown route does not pass,
// each station once: where the short-turns, depot trips and diversions stop.
export function otherStops(
  data: TransitData,
  directions: Direction[],
  shown: Variant | null,
): RouteStop[] {
  const seen = new Set(shown?.stops ?? []);
  const stops: RouteStop[] = [];
  for (const variant of directions.flatMap((direction) => [direction.main, ...direction.others])) {
    variant.stops.forEach((id, i) => {
      if (seen.has(id)) return;
      seen.add(id);
      const [lon, lat] = variant.positions[i];
      stops.push({ id, name: data.stations[id].name, lon, lat });
    });
  }
  return stops;
}

// line number -> kind of vehicle, e.g. "4" -> "tram"
export function kindsOfLines(data: TransitData): Map<string, Kind> {
  return new Map(data.variants.map((variant) => [variant.line, variant.kind]));
}

// The routes of all variants together: the network of all lines.
export function networkPaths(data: TransitData): Point[][] {
  return data.variants.flatMap((variant) => (variant.path ? [variant.path] : []));
}
