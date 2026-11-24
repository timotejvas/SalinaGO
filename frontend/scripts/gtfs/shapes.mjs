// The route of every variant on the map: the line between its stations along the tracks
// and streets. It comes from the output of pfaedle (see pfaedle.mjs), so it is calculated
// from OpenStreetMap, not official.

import { readTable } from "./read.mjs";

// ---------- settings ----------
const SIMPLIFY_M = 2; // points closer than this to a straight line are left out (smaller file)
const DECIMALS = 5; // about 1 m
// ------------------------------

// Finds the route of every variant from one sample trip of it.
//   samples[id] = { tripId, from, to }: the trip and its first and last stop in Brno
//                 (stop_sequence), see buildVariants
//   folder      = the output of pfaedle (the timetable with shapes.txt)
// Returns paths[id] = [[lon, lat], ...], only the part in Brno, or null for a variant
// whose trip pfaedle could not place.
export function readPaths(samples, folder) {
  const sampleTrips = new Set(samples.map((sample) => sample.tripId));

  // which shape each sample trip follows
  const shapeOfTrip = new Map();
  for (const trip of readTable("trips.txt", folder)) {
    if (sampleTrips.has(trip.trip_id) && trip.shape_id)
      shapeOfTrip.set(trip.trip_id, trip.shape_id);
  }

  // where on its shape each stop of a sample trip lies (metres from the start)
  const distanceAt = new Map(); // "tripId|stop_sequence" -> metres
  for (const row of readTable("stop_times.txt", folder)) {
    if (!sampleTrips.has(row.trip_id)) continue;
    distanceAt.set(`${row.trip_id}|${row.stop_sequence}`, Number(row.shape_dist_traveled));
  }

  // the points of the shapes we need
  const neededShapes = new Set(shapeOfTrip.values());
  const pointsOf = new Map(); // shape id -> [{ lon, lat, distance }]
  for (const row of readTable("shapes.txt", folder)) {
    if (!neededShapes.has(row.shape_id)) continue;
    if (!pointsOf.has(row.shape_id)) pointsOf.set(row.shape_id, []);
    pointsOf.get(row.shape_id).push({
      order: Number(row.shape_pt_sequence),
      lon: Number(row.shape_pt_lon),
      lat: Number(row.shape_pt_lat),
      distance: Number(row.shape_dist_traveled),
    });
  }
  for (const points of pointsOf.values()) points.sort((a, b) => a.order - b.order);

  return samples.map(({ tripId, from, to }) => {
    const points = pointsOf.get(shapeOfTrip.get(tripId));
    const start = distanceAt.get(`${tripId}|${from}`);
    const end = distanceAt.get(`${tripId}|${to}`);
    if (!points || start === undefined || end === undefined) return null;
    return simplify(cut(points, start, end)).map(([lon, lat]) => [round(lon), round(lat)]);
  });
}

const round = (value) => Number(value.toFixed(DECIMALS));

// The part of a shape between two distances from its start, as [lon, lat] points.
function cut(points, start, end) {
  const inside = points.filter((p) => p.distance > start && p.distance < end);
  return [pointAt(points, start), ...inside.map((p) => [p.lon, p.lat]), pointAt(points, end)];
}

// The position at a distance along the shape, between its two nearest points.
function pointAt(points, distance) {
  const next = points.findIndex((p) => p.distance >= distance);
  if (next <= 0)
    return next === 0 ? [points[0].lon, points[0].lat] : [points.at(-1).lon, points.at(-1).lat];
  const a = points[next - 1];
  const b = points[next];
  const share = (distance - a.distance) / (b.distance - a.distance || 1);
  return [a.lon + (b.lon - a.lon) * share, a.lat + (b.lat - a.lat) * share];
}

// Leaves out points that lie almost on a straight line (Douglas-Peucker).
function simplify(line) {
  if (line.length < 3) return line;
  const metresPerDegree = 111320;
  const cos = Math.cos((line[0][1] * Math.PI) / 180);
  const toMetres = ([lon, lat]) => [lon * metresPerDegree * cos, lat * metresPerDegree];

  const keep = new Array(line.length).fill(false);
  keep[0] = keep[line.length - 1] = true;
  const stack = [[0, line.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop();
    const [ax, ay] = toMetres(line[first]);
    const [bx, by] = toMetres(line[last]);
    let farthest = -1;
    let farthestDistance = SIMPLIFY_M;
    for (let i = first + 1; i < last; i++) {
      const distance = distanceToSegment(toMetres(line[i]), [ax, ay], [bx, by]);
      if (distance > farthestDistance) {
        farthest = i;
        farthestDistance = distance;
      }
    }
    if (farthest !== -1) {
      keep[farthest] = true;
      stack.push([first, farthest], [farthest, last]);
    }
  }
  return line.filter((_, i) => keep[i]);
}

function distanceToSegment([px, py], [ax, ay], [bx, by]) {
  const dx = bx - ax;
  const dy = by - ay;
  const share = Math.max(
    0,
    Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)),
  );
  return Math.hypot(px - (ax + share * dx), py - (ay + share * dy));
}
