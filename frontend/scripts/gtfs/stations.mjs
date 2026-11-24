// Stations: every station in Brno that a tram, trolleybus or bus stops at,
// together with the numbers of the lines that stop there.

import { readTable } from "./read.mjs";

// ---------- settings ----------
// stations outside of this rectangle are left out
const BRNO = { west: 16.4, east: 16.8, south: 49.08, north: 49.32 };
// ------------------------------

function isInBrno({ lon, lat }) {
  return lon >= BRNO.west && lon <= BRNO.east && lat >= BRNO.south && lat <= BRNO.north;
}

// Orders line numbers: 1, 2, 10 first, then names such as "N95".
function compareLines(a, b) {
  return (parseInt(a) || 1e9) - (parseInt(b) || 1e9) || a.localeCompare(b);
}

// Reads stops.txt. GTFS keeps two kinds of points in it:
//   - station  (location_type 1): the whole stop, e.g. "Česká". This is what we show.
//   - platform (location_type 0): the place where a vehicle really stops. It belongs to
//     a station (parent_station). Timetables refer to platforms, so we need the mapping.
// Returns:
//   allStations        station id  -> { name, lon, lat }
//   stationOfPlatform  platform id -> station id
//   platformPosition   platform id -> [lon, lat], where vehicles really stop
export function readStops() {
  const stops = readTable("stops.txt");

  const allStations = new Map();
  for (const stop of stops) {
    if (stop.location_type !== "1") continue;
    allStations.set(stop.stop_id, {
      name: stop.stop_name,
      lon: Number(stop.stop_lon),
      lat: Number(stop.stop_lat),
    });
  }

  const stationOfPlatform = new Map();
  const platformPosition = new Map();
  for (const stop of stops) {
    stationOfPlatform.set(stop.stop_id, stop.parent_station || stop.stop_id);
    platformPosition.set(stop.stop_id, [Number(stop.stop_lon), Number(stop.stop_lat)]);
  }

  return { allStations, stationOfPlatform, platformPosition };
}

// Keeps the stations in Brno that at least one line stops at and adds those lines.
//   stopsOfTrip  trip id -> where the trip stops
//   lineOfTrip   trip id -> line number, e.g. "12"
// Returns: station id -> { name, lon, lat, lines: ["1", "3", ...] }
export function buildStations(allStations, stopsOfTrip, lineOfTrip) {
  const linesOfStation = new Map(); // station id -> set of line numbers
  for (const [tripId, stopTimes] of stopsOfTrip) {
    const line = lineOfTrip.get(tripId);
    for (const { station } of stopTimes) {
      if (!linesOfStation.has(station)) linesOfStation.set(station, new Set());
      linesOfStation.get(station).add(line);
    }
  }

  const stations = {};
  for (const [id, station] of allStations) {
    const lines = linesOfStation.get(id);
    if (!lines || !isInBrno(station)) continue;
    stations[id] = { ...station, lines: [...lines].sort(compareLines) };
  }
  return stations;
}
