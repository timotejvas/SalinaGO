// Loads public/transit.json (made by scripts/build-data.mjs) and describes what is in it.
// The data itself is only in that file; the types below tell TypeScript its shape.

// One sequence of stations of one line in one direction (the full route, a short-turn, a branch).
export type Variant = {
  id: number; // position in TransitData.variants
  line: string; // "1", "26", "N95"
  kind: "tram" | "trolleybus" | "bus";
  routeId: string;
  direction: number; // GTFS direction_id (0 or 1)
  headsign: string; // final destination, from GTFS
  stops: string[]; // station ids in order (look them up in TransitData.stations)
  positions: [number, number][]; // [lon, lat] of the platform at each station, where it stops
  trips: Record<string, number[]>; // service id -> [start, end, start, end, ...] in seconds
  // running times: for each pattern, seconds from the start of a trip to each station
  patterns: number[][];
  tripPatterns: Record<string, number[]>; // service id -> the pattern of each trip in `trips`
  // the route between the stations as [lon, lat] points, calculated from OpenStreetMap;
  // missing for the few trips pfaedle could not place
  path?: [number, number][];
};

// A station: the whole stop, e.g. "Česká" (not one platform).
export type Station = {
  name: string;
  lon: number;
  lat: number;
  lines: string[]; // numbers of the lines that stop here, e.g. ["12", "40", "N95"]
};

// The content of transit.json.
export type TransitData = {
  published?: string; // when KORDIS published the timetable, ISO time; unknown for older files
  validFrom: string; // "20261106": first and last day the timetable is valid
  validTo: string;
  active: Record<string, string[]>; // "20261107" -> service ids that run that day
  // the colour of every line, as the official timetable gives it: "tram|4" -> "#EE7E1E".
  // Lines the timetable gives no colour are not in it (see src/colors.ts).
  lineColors: Record<string, string>;
  stations: Record<string, Station>; // every station in Brno, by id
  // where you can walk from one station to another: station id -> [other station, seconds],
  // from the official timetable (transfers.txt) and, more exactly, along the paths of the town
  // (transfers.json). Stations you cannot walk from are not in it.
  transfers: Record<string, [string, number][]>;
  // the changes within one station that take longer than the two minutes a change is given,
  // its platforms being far apart: station id -> "lon,lat>lon,lat" -> seconds (transfers.json)
  changes?: Record<string, Record<string, number>>;
  variants: Variant[];
};

// What scripts/build-walk.mjs finds along the paths of the town.
type Walks = {
  transfers: Record<string, [string, number][]>;
  changes: Record<string, Record<string, number>>;
};

// Downloads the data and fails with a clear message when it is missing. The paths are relative
// to the page, so that the app works wherever it is served from: a domain of its own, or a
// folder of one (github.io/SalinaGO/). The walks along the
// paths are added when they are there; without them the times of the timetable are used.
export async function loadTransit(): Promise<TransitData> {
  const [response, walks] = await Promise.all([
    fetch("transit.json"),
    fetch("transfers.json")
      .then((found) => (found.ok ? (found.json() as Promise<Walks>) : null))
      .catch(() => null),
  ]);
  if (!response.ok) throw new Error(`Could not load transit.json (${response.status})`);
  const data: TransitData = await response.json();
  return walks ? withWalks(data, walks) : data;
}

// The walks between stations along the paths, where they are known, and the ones of the
// timetable that are longer than the paths were measured for.
export function withWalks(data: TransitData, walks: Walks): TransitData {
  const transfers: TransitData["transfers"] = {};
  for (const [station, others] of Object.entries(walks.transfers)) transfers[station] = [...others];
  for (const [station, others] of Object.entries(data.transfers)) {
    const known = (transfers[station] ??= []);
    for (const [other, seconds] of others) {
      if (!known.some(([id]) => id === other)) known.push([other, seconds]);
    }
  }
  return { ...data, transfers, changes: walks.changes };
}
