// Builds public/transit.json: the one file with all timetable data the app needs.
//
//   input  ../data/gtfs/*.txt   official timetable (KORDIS JMK, CC BY 4.0)
//   output public/transit.json
//
// The script only selects, groups and renames what is in GTFS; the one thing it adds is the
// route of each variant on the map, which pfaedle calculates from OpenStreetMap (the timetable
// has none). The output has these parts:
//
//   published           when KORDIS published the GTFS (data/gtfs/SOURCE.json, written by
//                       update-data.mjs); left out when the files came some other way
//   validFrom, validTo  first and last day the timetable is valid
//   active              date -> services that run that day
//   lineColors          the official colour of every line
//   stations            every station in Brno with the lines that stop there
//   transfers           where you can walk from one station to another, and how long it takes
//   variants            sequences of stations of a line, with the times of their trips
//                       (when they start and how long they take to each station)
//
// Run from the frontend/ folder:  node scripts/build-data.mjs
// Run it again whenever the GTFS files change. See docs/DATA.md.

import fs from "node:fs";
import { readTable, toSeconds } from "./gtfs/read.mjs";
import { readStops, buildStations } from "./gtfs/stations.mjs";
import { buildTransfers } from "./gtfs/transfers.mjs";
import { buildVariants } from "./gtfs/variants.mjs";
import { readPaths } from "./gtfs/shapes.mjs";
import { calculateShapes, removeShapes } from "./gtfs/pfaedle.mjs";
import { buildCalendar } from "./gtfs/calendar.mjs";

// ---------- settings ----------
const OUTPUT = "public/transit.json";

// GTFS route_type -> kind; other types (trains) are left out
const KIND_OF_TYPE = { 0: "tram", 800: "trolleybus", 3: "bus" };
// a colour printed on white paper can be lost on a dark map: below this brightness we take
// the colour of the line's lettering instead (night buses are black with yellow letters)
const DARK = 60; // 0 - 255
// ------------------------------

// ---------- 1. stations (stops.txt) ----------
const { allStations, stationOfPlatform, platformPosition } = readStops();

// ---------- 2. routes and trips (routes.txt, trips.txt) ----------
const routes = new Map(); // route id -> row of routes.txt, with its kind
for (const route of readTable("routes.txt")) {
  const kind = KIND_OF_TYPE[route.route_type];
  if (kind) routes.set(route.route_id, { ...route, kind });
}

// the colour every line is drawn in, as the timetable gives it: "tram|4" -> "#EE7E1E"
const lineColors = {};
for (const route of routes.values()) {
  const color = onDark(route.route_color, route.route_text_color);
  if (color) lineColors[`${route.kind}|${route.route_short_name}`] = color;
}

const trips = new Map(); // trip id -> row of trips.txt
for (const trip of readTable("trips.txt")) {
  if (routes.has(trip.route_id)) trips.set(trip.trip_id, trip);
}

const lineOfTrip = new Map(); // trip id -> line number, e.g. "12"
for (const [tripId, trip] of trips) {
  lineOfTrip.set(tripId, routes.get(trip.route_id).route_short_name);
}

// ---------- 3. where every trip stops (stop_times.txt, the largest file) ----------
const stopsOfTrip = new Map(); // trip id -> [{ order, station, position, arrive, leave }]
for (const row of readTable("stop_times.txt")) {
  if (!trips.has(row.trip_id)) continue;
  if (!stopsOfTrip.has(row.trip_id)) stopsOfTrip.set(row.trip_id, []);
  stopsOfTrip.get(row.trip_id).push({
    order: Number(row.stop_sequence),
    station: stationOfPlatform.get(row.stop_id),
    position: platformPosition.get(row.stop_id), // of the platform, not of the whole station
    arrive: toSeconds(row.arrival_time),
    leave: toSeconds(row.departure_time),
  });
}

// ---------- 4. stations in Brno with their lines ----------
const stations = buildStations(allStations, stopsOfTrip, lineOfTrip);

// ---------- 5. variants of lines ----------
const { variants, samples } = buildVariants(routes, trips, stopsOfTrip, stations);

// ---------- 5b. routes on the map (calculated with pfaedle from OpenStreetMap) ----------
const paths = readPaths(samples, calculateShapes());
removeShapes();
variants.forEach((variant, id) => {
  if (paths[id]) variant.path = paths[id];
});

// ---------- 5c. walking between stations (transfers.txt) ----------
const transfers = buildTransfers(stationOfPlatform, stations);

// ---------- 6. days: which services run on which date ----------
const { validFrom, validTo, active } = buildCalendar();

// ---------- 7. check and save ----------
// a broken file would only show up later as an empty or wrong map, so stop here instead
if (Object.keys(stations).length === 0 || variants.length === 0) {
  throw new Error("No stations or variants found. Are the files in data/gtfs/ complete?");
}
for (const variant of variants) {
  const unknown = variant.stops.find((id) => !stations[id]);
  if (unknown)
    throw new Error(`Variant of line ${variant.line} uses an unknown station: ${unknown}`);
}

// when the GTFS was published, as KORDIS dates its file
const source = "../data/gtfs/SOURCE.json";
const lastModified = fs.existsSync(source)
  ? JSON.parse(fs.readFileSync(source, "utf8")).lastModified
  : null;
const published = lastModified ? new Date(lastModified).toISOString() : undefined;

writeWhole(
  OUTPUT,
  JSON.stringify({
    published,
    validFrom,
    validTo,
    active,
    lineColors,
    stations,
    transfers,
    variants,
  }),
);

// The colour of a line as it reads on a dark map: its own, or its lettering when its own is
// too dark to be seen. Returns nothing for a line the timetable gives no colour.
function onDark(color, lettering) {
  const pick = [color, lettering].find((value) => value && brightness(value) >= DARK);
  return pick ? `#${pick}` : undefined;
}

function brightness(hex) {
  const value = parseInt(hex, 16);
  return 0.2126 * ((value >> 16) & 0xff) + 0.7152 * ((value >> 8) & 0xff) + 0.0722 * (value & 0xff);
}

const lineCount = new Set(variants.map((v) => `${v.kind}|${v.line}`)).size;
console.log(`Stations in Brno: ${Object.keys(stations).length}`);
console.log(`Variants: ${variants.length} (${lineCount} lines)`);
console.log(`Stations you can walk from: ${Object.keys(transfers).length}`);
console.log(`Timetable published: ${published ?? "unknown"}, valid: ${validFrom} - ${validTo}`);
console.log(`File: ${OUTPUT} (${(fs.statSync(OUTPUT).size / 1e6).toFixed(2)} MB)`);

// Writes a file whole: into a temporary one first, then renamed over the old, so the app running
// meanwhile reads either the old file or the new, never half of one.
function writeWhole(file, content) {
  fs.writeFileSync(`${file}.tmp`, content);
  fs.renameSync(`${file}.tmp`, file);
}
