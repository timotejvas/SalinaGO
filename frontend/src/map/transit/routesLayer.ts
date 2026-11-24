// The routes grown out of something on the map, under the stations: every route through a
// station that is opened (stationsLayer.ts), growing out of it both ways at once; or the route
// still ahead of a live vehicle that is opened (ui/VehicleCard.tsx), growing out of it, with its
// stops, and then cut where the vehicle is drawn as it drives on. One at a time: each takes the
// place of the one before.

import type { GeoJSONSource, Map as MapLibreMap } from "maplibre-gl";
import { metersBetween } from "../../logic/live/track";
import { lessMotion } from "../../screen";
import { labelFont } from "../labelFont";

// ---------- settings ----------
const ROUTES_OPACITY = 0.85;
const GROW_MS = 1500; // the routes grow out of where they start as slowly as a journey draws itself
const FOLLOW_MS = 50; // the route ahead of a vehicle is cut where it is this often
const LOOK_AHEAD_M = 800; // how far on along its route a vehicle is looked for each time
const NEAR_M = 80; // further than this from its route, a vehicle is not on it
// ------------------------------

const ROUTES_ID = "station-routes";

type Point = [number, number];
export type Route = { path: Point[]; color: string };
type Stop = { name: string; lon: number; lat: number };

// The app has one map, and one set of routes grown on it at most.
let growing: number | undefined; // the routes growing
let following: number | undefined; // the route ahead of a vehicle, kept cut where it is
// This file keeps what is on the map in variables of its own; a change to it reloads the page
// while the app is developed (see vehiclesLayer.ts).
import.meta.hot?.accept(() => location.reload());

// Adds the (empty) layers of the routes: under the stations, so call it before them.
export function addRoutes(map: MapLibreMap) {
  // under the stations: the routes through the one that is open
  map.addSource(ROUTES_ID, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
  map.addLayer({
    id: ROUTES_ID,
    type: "line",
    source: ROUTES_ID,
    filter: ["==", ["geometry-type"], "LineString"],
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": ["get", "color"],
      "line-opacity": ROUTES_OPACITY,
      "line-width": ["interpolate", ["linear"], ["zoom"], 11, 2, 16, 5],
    },
  });

  // and the stops on it, when there are (the stops ahead of a vehicle): as a journey draws them
  map.addLayer({
    id: `${ROUTES_ID}-stops`,
    type: "circle",
    source: ROUTES_ID,
    filter: ["==", ["geometry-type"], "Point"],
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 3, 16, 7],
      "circle-color": ["get", "color"],
      "circle-stroke-color": "#ffffff",
      "circle-stroke-width": 2,
    },
  });
  map.addLayer({
    id: `${ROUTES_ID}-names`,
    type: "symbol",
    source: ROUTES_ID,
    filter: ["==", ["geometry-type"], "Point"],
    minzoom: 13,
    layout: {
      "text-field": ["get", "name"],
      "text-font": labelFont(map),
      "text-size": 12,
      "text-offset": [0, 1.1],
      "text-anchor": "top",
      "text-optional": true,
    },
    paint: { "text-color": "#ffffff", "text-halo-color": "#000000", "text-halo-width": 1.5 },
  });
}

// Every route through a station, growing out of it both ways at once. Takes the place of what
// was grown before.
export function growRoutesFrom(map: MapLibreMap, at: Point, routes: Route[]) {
  stop();
  grow(map, at, routes);
}

// Takes the routes off the map, growing or not.
export function clearRoutes(map: MapLibreMap) {
  stop();
  drawRoutes(map, []);
}

// The route still ahead of a live vehicle, growing out of it the same way, with its stops - a
// dot and a name each, there from the start. Null takes it off.
export function showRouteAhead(
  map: MapLibreMap,
  at: Point,
  route: Route | null,
  stops: Stop[] = [],
) {
  stop();
  if (!route) return drawRoutes(map, []);
  grow(
    map,
    at,
    [route],
    true,
    stops.map((one) => ({ ...one, color: route.color })),
  );
}

// The same route ahead, kept cut where the vehicle is drawn as it drives on (`where`, asked
// every frame): the line starts right at its mark, never a stretch behind it or ahead of it,
// and the stops it has passed go with the line. It only ever goes forward - a vehicle drawn a
// little back by a late position does not grow the line again. It starts once the
// route has grown (showRouteAhead); anything else drawn here stops it.
export function followRouteAhead(
  map: MapLibreMap,
  route: Route,
  stops: Stop[],
  where: () => Point | null,
) {
  if (following !== undefined) cancelAnimationFrame(following);
  const line = measured(route.path);
  const placed = stops.map((stop) => ({
    ...stop,
    color: route.color,
    along: placeAlong(line, [stop.lon, stop.lat], 0)?.along ?? 0,
  }));
  let reached = 0; // how far along the route the vehicle has got, in metres
  let drawn = -1;
  let last = 0;
  const step = (time: number) => {
    following = requestAnimationFrame(step);
    if (growing !== undefined || time - last < FOLLOW_MS) return;
    last = time;
    const at = where();
    const found = at ? placeAlong(line, at, reached) : null;
    if (!found) return;
    reached = Math.max(reached, found.along);
    if (Math.abs(reached - drawn) < 0.5) return;
    drawn = reached;
    drawRoutes(
      map,
      [{ path: from(line, reached), color: route.color }],
      placed.filter((stop) => stop.along >= reached),
    );
  };
  following = requestAnimationFrame(step);
}

// Stops whatever moves the routes: growing, following a vehicle.
function stop() {
  if (growing !== undefined) cancelAnimationFrame(growing);
  if (following !== undefined) cancelAnimationFrame(following);
  growing = following = undefined;
}

// The routes through a station, growing out of it both ways at once - each the same share of
// its length in every frame, so that they all reach their ends together.
// Only onwards, when `ahead`: from a vehicle, which has already driven the part behind it.
function grow(
  map: MapLibreMap,
  at: Point,
  routes: Route[],
  ahead = false,
  stops: (Stop & { color: string })[] = [],
) {
  const halves = routes.flatMap(({ path, color }) => {
    // ahead of a vehicle: from the place on the route nearest it, as followRouteAhead goes on
    if (ahead) {
      const line = measured(path);
      const found = placeAlong(line, at, 0);
      if (found) return [{ color, ...measured(from(line, found.along)) }];
    }
    const k = nearestIndex(path, at);
    const onwards = { color, ...measured([at, ...path.slice(k + 1)]) };
    if (ahead) return [onwards];
    return [{ color, ...measured([at, ...path.slice(0, k + 1).reverse()]) }, onwards];
  });
  if (lessMotion()) {
    drawRoutes(
      map,
      halves.map(({ path, color }) => ({ path, color })),
      stops,
    );
    return;
  }
  const started = performance.now();
  const step = () => {
    const done = Math.min(1, (performance.now() - started) / GROW_MS);
    const share = 1 - (1 - done) ** 3; // slowing towards the end
    drawRoutes(
      map,
      halves.map(({ path, steps, length, color }) => ({
        path: cut(path, steps, share * length),
        color,
      })),
      stops,
    );
    growing = done < 1 ? requestAnimationFrame(step) : undefined;
  };
  step();
}

function drawRoutes(map: MapLibreMap, routes: Route[], stops: (Stop & { color: string })[] = []) {
  map.getSource<GeoJSONSource>(ROUTES_ID)?.setData({
    type: "FeatureCollection",
    features: [
      ...routes
        .filter(({ path }) => path.length > 1)
        .map(({ path, color }) => ({
          type: "Feature" as const,
          properties: { color },
          geometry: { type: "LineString" as const, coordinates: path },
        })),
      ...stops.map(({ name, lon, lat, color }) => ({
        type: "Feature" as const,
        properties: { name, color },
        geometry: { type: "Point" as const, coordinates: [lon, lat] },
      })),
    ],
  });
}

// The point of a path nearest to a place.
function nearestIndex(path: Point[], at: Point): number {
  let best = 0;
  path.forEach((point, i) => {
    if (metersBetween(point, at) < metersBetween(path[best], at)) best = i;
  });
  return best;
}

// Where a point lies along a measured path, as metres from its start: the nearest place on it,
// looked for from `after` on and a stretch beyond - so that a route that comes back near
// itself is not jumped along. Null when the point is not near the path there.
function placeAlong(
  line: ReturnType<typeof measured>,
  at: Point,
  after: number,
): { along: number } | null {
  const { path, steps } = line;
  let best: { along: number; meters: number } | null = null;
  for (let i = 0; i + 1 < path.length; i++) {
    if (steps[i + 1] < after - 1) continue;
    if (steps[i] > after + LOOK_AHEAD_M) break;
    const [a, b] = [path[i], path[i + 1]];
    const length = steps[i + 1] - steps[i] || 1;
    // the share of the way from a to b, on a map this small enough as if it were flat
    const scale = Math.cos((a[1] * Math.PI) / 180);
    const [dx, dy] = [(b[0] - a[0]) * scale, b[1] - a[1]];
    const [px, py] = [(at[0] - a[0]) * scale, at[1] - a[1]];
    const share = Math.max(0, Math.min(1, (px * dx + py * dy) / (dx * dx + dy * dy || 1)));
    const on: Point = [a[0] + (b[0] - a[0]) * share, a[1] + (b[1] - a[1]) * share];
    const meters = metersBetween(on, at);
    if (!best || meters < best.meters) best = { along: steps[i] + share * length, meters };
  }
  return best && best.meters < NEAR_M ? best : null;
}

// The rest of a measured path from `reach` metres along it, starting between two of its points.
function from(line: ReturnType<typeof measured>, reach: number): Point[] {
  const { path, steps } = line;
  const next = steps.findIndex((step) => step > reach);
  if (next === -1) return [path[path.length - 1]];
  if (next === 0) return path;
  const over = (reach - steps[next - 1]) / (steps[next] - steps[next - 1] || 1);
  const [a, b] = [path[next - 1], path[next]];
  return [[a[0] + (b[0] - a[0]) * over, a[1] + (b[1] - a[1]) * over], ...path.slice(next)];
}

// A path with how far along it each of its points lies.
function measured(path: Point[]) {
  const steps = [0];
  for (let i = 1; i < path.length; i++)
    steps.push(steps[i - 1] + metersBetween(path[i - 1], path[i]));
  return { path, steps, length: steps[steps.length - 1] };
}

// The first `reach` metres of a path, ending between two of its points.
function cut(path: Point[], steps: number[], reach: number): Point[] {
  const next = steps.findIndex((step) => step > reach);
  if (next === -1) return path;
  if (next === 0) return [path[0]];
  const over = (reach - steps[next - 1]) / (steps[next] - steps[next - 1] || 1);
  const [a, b] = [path[next - 1], path[next]];
  return [...path.slice(0, next), [a[0] + (b[0] - a[0]) * over, a[1] + (b[1] - a[1]) * over]];
}
