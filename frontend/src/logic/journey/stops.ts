// A journey as a list of stops, the way the board inside a tram shows them: every stop you
// pass with the time you are there, and at a change the time your next vehicle leaves.
// ui/journey/JourneyStrip.tsx turns it into rows for the strip; nothing here knows
// about React or the map.

import type { TransitData } from "../timetable/loadData.ts";
import type { Departure } from "../timetable/departures.ts";
import { DAY } from "../timetable/clock.ts";
import type { DoorWalk, JourneyLeg, WalkTo } from "./plan.ts";

// One stop of a journey.
export type JourneyStop = {
  id: string;
  name: string;
  lon: number;
  lat: number;
  variant: number; // which route you are on from here, and which stop of it this is:
  index: number; //   the live vehicles of the journey are placed along it
  kind: JourneyLeg["kind"]; // of the vehicle you are on from here; the last stop keeps the last
  time: Departure; // when you are there
  line?: string; // the line you get on here: at the start and at every change
  leaves?: Departure; // when it leaves, when that is later than you arrive
  change?: boolean; // you get off one vehicle here and wait for another
  walk?: number; // minutes on foot from here to the next stop, where your next line leaves
};

// Every stop of a journey in order, the station where you change only once, and the end of
// the journey after the walk to it when the last line does not go there. A journey from an
// address starts there, and one to an address ends there, with the walk to or from the line.
export function journeyStops(
  data: TransitData,
  legs: JourneyLeg[],
  walkAfter?: WalkTo,
  doors: { first?: DoorWalk; last?: DoorWalk } = {},
): JourneyStop[] {
  const stops: JourneyStop[] = [];
  for (const leg of legs) {
    const { variant, at, stops: count, departure, pattern } = leg.ride;
    const route = data.variants[variant];
    for (let step = 0; step <= count; step++) {
      const id = route.stops[at + step];
      const [lon, lat] = route.positions[at + step];
      const time = plus(departure, pattern[at + step] - pattern[at]);
      const before = stops[stops.length - 1];
      // the station where the legs meet is one stop, where you arrive on one and leave on another
      if (step === 0 && before && before.id === id) {
        before.kind = leg.kind;
        before.line = leg.line;
        before.leaves = time;
        before.change = true;
        before.variant = variant; // from here on you are on the next line
        before.index = at;
        continue;
      }
      // after a walk the two stations are different, so the stop you walked from says so
      if (step === 0 && before && leg.walk) before.walk = leg.walk.minutes;
      stops.push({
        id,
        name: data.stations[id].name,
        lon,
        lat,
        variant,
        index: at + step,
        kind: leg.kind,
        time,
        line: step === 0 ? leg.line : undefined,
      });
    }
  }
  const start = stops[0];
  if (doors.first && start) {
    const [lon, lat] = doors.first.path[0];
    stops.unshift({
      ...start,
      id: "address-first",
      name: doors.first.name,
      lon,
      lat,
      index: -1, // on no route, so no vehicle is shown at it
      time: plus(start.time, -doors.first.minutes * 60),
      line: undefined,
      leaves: undefined,
      change: undefined,
      walk: doors.first.minutes,
    });
  }
  const last = stops[stops.length - 1];
  if (doors.last && last) {
    last.walk = doors.last.minutes;
    const [lon, lat] = doors.last.path[doors.last.path.length - 1];
    stops.push({
      ...last,
      id: "address-last",
      name: doors.last.name,
      lon,
      lat,
      index: -1,
      time: plus(last.time, doors.last.minutes * 60),
      line: undefined,
      leaves: undefined,
      change: undefined,
      walk: undefined,
    });
  } else if (walkAfter && last) {
    last.walk = walkAfter.minutes;
    const end = data.stations[walkAfter.to];
    stops.push({
      ...last,
      id: walkAfter.to,
      name: end.name,
      lon: end.lon,
      lat: end.lat,
      index: -1, // on no route, so no vehicle is shown at it
      time: plus(last.time, walkAfter.minutes * 60),
      line: undefined,
      leaves: undefined,
      change: undefined,
      walk: undefined,
    });
  }
  return stops;
}

// A time that many seconds later.
function plus(departure: Departure, seconds: number): Departure {
  const later = departure.day * DAY + departure.seconds + seconds;
  return { day: Math.floor(later / DAY), seconds: later % DAY };
}
