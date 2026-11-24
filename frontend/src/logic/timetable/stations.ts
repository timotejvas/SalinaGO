// The stations, as everything outside the timetable wants them: every station with the lines
// that stop there, finding one by its name, and the stops of one route with the platform each
// of them stops at. What a line is and where its routes run is in lines.ts.
// The map layers draw these; they do not read transit.json themselves.

// imports end with .ts, so that Node can run it without a build
import type { TransitData, Variant } from "./loadData.ts";
import { kindsOfLines } from "./lines.ts";
import type { Kind } from "./lines.ts";

// A station as the map and the panel show it.
export type MapStation = {
  id: string; // as in transit.json, e.g. "U1703N27"
  name: string;
  lon: number;
  lat: number;
  lines: { line: string; kind: Kind }[]; // the lines that stop here, in the order of transit.json
};

// Every station with the lines that stop there and their kinds.
export function mapStations(data: TransitData): MapStation[] {
  const kinds = kindsOfLines(data);
  return Object.entries(data.stations).map(([id, station]) => ({
    id,
    name: station.name,
    lon: station.lon,
    lat: station.lat,
    lines: station.lines.map((line) => ({ line, kind: kinds.get(line) ?? "bus" })),
  }));
}

// Stations whose name matches what was typed, the best first: a station whose name begins with
// the text comes before one where a later word does, and that before one that only contains it.
// Accents and upper case are ignored ("ceska" finds "Česká"). Empty text finds nothing.
export function searchStations(stations: MapStation[], text: string, limit = 8): MapStation[] {
  const wanted = plain(text);
  if (!wanted) return [];
  const found: { station: MapStation; rank: number }[] = [];
  for (const station of stations) {
    const name = plain(station.name);
    const at = name.indexOf(wanted);
    if (at < 0) continue;
    const rank = at === 0 ? 0 : /[\s,.-]/.test(name[at - 1]) ? 1 : 2;
    found.push({ station, rank });
  }
  found.sort((a, b) => a.rank - b.rank || a.station.name.localeCompare(b.station.name, "cs"));
  return found.slice(0, limit).map((item) => item.station);
}

// A name without accents and in lower case, to compare what people type with what we have.
function plain(text: string) {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase();
}

// One stop of a route: the name of the station and the position of the platform where the
// vehicle stops (closer to the route than the middle of the station).
export type RouteStop = { id: string; name: string; lon: number; lat: number };

// The stops of a route in driving order, each station only once
// (a route that runs in a loop passes some stations twice).
export function stationsOf(data: TransitData, variant: Variant): RouteStop[] {
  const seen = new Set<string>();
  const stops: RouteStop[] = [];
  variant.stops.forEach((id, i) => {
    if (seen.has(id)) return;
    seen.add(id);
    const [lon, lat] = variant.positions[i];
    stops.push({ id, name: data.stations[id].name, lon, lat });
  });
  return stops;
}
