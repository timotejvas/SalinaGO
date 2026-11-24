// Live vehicles from the stream of the city of Brno (data of KORDIS JMK, data.brno.cz).
// The stream sends the whole fleet about every 10 s over a WebSocket, one message per vehicle.
// We keep the latest message of each vehicle, only for the lines of transit.json.

// imports end with .ts, so that Node can run it without a build
import { WORDS, type Words } from "../words.ts";
import type { TransitData, Variant } from "../timetable/loadData.ts";
import { kindsOfLines } from "../timetable/lines.ts";
import { routesByLine, snap, stopsByLine } from "./track.ts";
import { moved, standing, type Motion } from "./motion.ts";

// ---------- settings ----------
const STREAM_URL =
  "wss://gis.brno.cz/geoevent/ws/services/Kordis_stream/StreamServer/subscribe?outSR=4326";
const MAX_AGE_MS = 2 * 60_000; // a vehicle not heard of for this long is removed
const PUBLISH_MS = 2_000; // how often the new positions are handed over
// the first ones are handed over sooner: the fleet arrives as a burst of messages, and the
// page is waiting for them, so it is worth not sitting on them for a whole interval
const FIRST_MS = 400;
const RECONNECT_MS = 5_000; // wait after the connection drops
// ------------------------------

// A vehicle on the map.
export type Vehicle = {
  id: number; // number of the vehicle, e.g. 1768
  line: string; // "4", "N89"
  kind: Variant["kind"];
  lon: number;
  lat: number;
  bearing: number; // degrees clockwise from north, -1 when unknown
  delay: number; // minutes, negative when early
  destination: string; // name of the final station, empty when unknown
  lastStop: number; // the station it passed last, as a KORDIS number (see stationNumber)
  finalStop: number; // the station where its trip ends, as a KORDIS number
  // how it moves: where it was last seen and when, and how fast along which route - the map
  // works out from this where it most likely is now (see motion.ts)
  motion: Motion;
};

export type LiveStatus = "connecting" | "live" | "offline";

// One message of the stream (only the fields we use).
type Message = {
  attributes?: {
    ID: number;
    LineName: string;
    Lat: number;
    Lng: number;
    Bearing: number;
    Delay: number;
    LastStopID: number;
    FinalStopID: number;
    IsInactive: string; // "true" / "false"
    TimeUpdated?: number; // when the position was measured, ms since 1970
  };
};

// Returns a function that reads one message of the stream. It gives null for lines that are not
// in transit.json, for inactive vehicles and for anything that is not a vehicle.
export function vehicleReader(data: TransitData) {
  const kinds = kindsOfLines(data);
  const routes = routesByLine(data);
  // number of a station ("U1062N..." -> 1062) -> its name; the stream uses these numbers
  const stationNames = new Map<number, string>();
  for (const [id, station] of Object.entries(data.stations)) {
    const number = stationNumber(id);
    if (number !== null) stationNames.set(number, station.name);
  }

  return (text: string): Vehicle | null => {
    let message: Message;
    try {
      message = JSON.parse(text);
    } catch {
      return null;
    }
    const a = message?.attributes;
    if (!a || a.IsInactive === "true") return null;
    const kind = kinds.get(a.LineName);
    if (!kind || !Number.isFinite(a.Lat) || !Number.isFinite(a.Lng)) return null;
    // on the track of its line, not metres beside it as GPS may say
    const [lon, lat] = snap([a.Lng, a.Lat], routes.get(a.LineName) ?? []);
    return {
      id: a.ID,
      line: a.LineName,
      kind,
      lon,
      lat,
      bearing: a.Bearing,
      delay: a.Delay,
      destination: stationNames.get(a.FinalStopID) ?? "",
      lastStop: a.LastStopID,
      finalStop: a.FinalStopID,
      motion: standing([lon, lat], a.TimeUpdated ?? Date.now()),
    };
  };
}

// The KORDIS number of a station, which the stream uses: "U1062N5" -> 1062 (null for other ids).
export function stationNumber(id: string): number | null {
  const number = /^U(\d+)N/.exec(id)?.[1];
  return number ? Number(number) : null;
}

// Where the vehicles are on a route: for each stop of the route, the vehicles that passed it
// last and still drive on along this route - their trip ends at a later stop of it. Vehicles
// of the other direction, and those whose stops are not on the route, are left out, and so is
// one whose trip ends at the stop it just passed: the stream keeps sending it while it drives
// on empty, often back the way it came, and it is not going anywhere you can go.
export function vehiclesAlong(vehicles: Vehicle[], stops: { id: string }[]): Vehicle[][] {
  const numbers = stops.map((stop) => stationNumber(stop.id));
  const along: Vehicle[][] = stops.map(() => []);
  for (const vehicle of vehicles) {
    const last = numbers.indexOf(vehicle.lastStop);
    const final = numbers.lastIndexOf(vehicle.finalStop);
    if (last < 0 || final <= last) continue; // nothing of the route is left for it to drive
    along[last].push(vehicle);
  }
  return along;
}

// The vehicles to show: all of them, or only those of the chosen line (both directions).
export function vehiclesOfLine(vehicles: Vehicle[], line: string | null): Vehicle[] {
  return line === null ? vehicles : vehicles.filter((vehicle) => vehicle.line === line);
}

// Connects to the stream and hands over all current vehicles every PUBLISH_MS (when something
// changed). Reconnects when the connection drops. Returns a function that stops it.
export function watchVehicles(
  data: TransitData,
  onVehicles: (vehicles: Vehicle[]) => void,
  onStatus: (status: LiveStatus) => void,
): () => void {
  const read = vehicleReader(data);
  const routes = routesByLine(data);
  const stops = stopsByLine(data);
  // vehicle id -> the vehicle and when we last heard of it
  const vehicles = new Map<number, { vehicle: Vehicle; heard: number }>();
  let changed = false;
  let published = false;
  let socket: WebSocket | null = null;
  let reconnect: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  let status: LiveStatus | null = null;

  // tells the status only when it changes
  function report(next: LiveStatus) {
    if (next !== status) onStatus(next);
    status = next;
  }

  function connect() {
    report("connecting");
    socket = new WebSocket(STREAM_URL);
    socket.onmessage = (event) => {
      const vehicle = read(String(event.data));
      if (!vehicle) return;
      const previous = vehicles.get(vehicle.id)?.vehicle;
      if (previous) {
        const { point, time } = vehicle.motion;
        const line = vehicle.line;
        vehicle.motion = moved(
          previous.motion,
          point,
          time,
          routes.get(line) ?? [],
          stops.get(line) ?? [],
        );
      }
      vehicles.set(vehicle.id, { vehicle, heard: Date.now() });
      changed = true;
      report("live");
      if (!published) {
        published = true;
        setTimeout(publish, FIRST_MS); // the rest of the burst is here by then
      }
    };
    socket.onclose = () => {
      if (stopped) return;
      report("offline"); // the known vehicles stay until they are too old
      reconnect = setTimeout(connect, RECONNECT_MS);
    };
  }

  // hands over what we have now, and forgets the vehicles we have not heard of for too long
  function publish() {
    const oldest = Date.now() - MAX_AGE_MS;
    for (const [id, { heard }] of vehicles) {
      if (heard < oldest) {
        vehicles.delete(id);
        changed = true;
      }
    }
    if (!changed) return;
    changed = false;
    onVehicles([...vehicles.values()].map(({ vehicle }) => vehicle));
  }

  const publishing = setInterval(publish, PUBLISH_MS);

  connect();
  return () => {
    stopped = true;
    clearInterval(publishing);
    clearTimeout(reconnect);
    socket?.close();
  };
}

// ---------- in words ----------

// How late a vehicle is: "on time", "2 min late", "1 min early".
export function describeDelay(minutes: number, w: Words = WORDS.en): string {
  if (minutes >= 1) return w.late(Math.round(minutes));
  if (minutes <= -1) return w.early(Math.round(-minutes));
  return w.onTime;
}

// How many vehicles of a line are on the way, as the panel says it before the rest of the
// line: "9 live", a note when the stream does not answer, nothing while connecting.
export function describeLive(status: LiveStatus, count: number, w: Words = WORDS.en): string {
  if (status === "offline") return w.liveUnavailable;
  return count > 0 ? w.liveCount(count) : "";
}
