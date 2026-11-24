// The ways from one end of a journey to the other, once Search is pressed: the next few, found
// again as the clock ticks, and the one that is picked - kept, while you are on it, even when
// it has left and is not found any more. An end can be an address: then the ways start or end
// with a walk to one of the stations near it (logic/walk/places.ts), found once the paths to
// walk along are downloaded.
// The search itself is logic/journey/options.ts; this keeps what was asked and what is picked.

import { useMemo, useState } from "react";
import type { TransitData } from "../logic/timetable/loadData";
import { daysBetween, type Now } from "../logic/timetable/clock";
import { secondsUntil, type Departure } from "../logic/timetable/departures";
import type { MapStation } from "../logic/timetable/stations";
import type { Ride } from "../logic/journey/direct";
import { buildNetwork, type Journey } from "../logic/journey/plan";
import { waysBetween, wayKey, type End } from "../logic/journey/options";
import {
  aroundAddress,
  isStation,
  walksFrom,
  walksToPlatforms,
  type Around,
  type Place,
} from "../logic/walk/places";
import type { Walking } from "../logic/walk/load";
import { useWalking } from "./useWalking";

// ---------- settings ----------
const ARRIVED_S = 120; // the way you are on stays this long after you are there
// ------------------------------

type Ask = {
  data: TransitData;
  now: Now; // the real clock
  stations: MapStation[];
  from: Place | null;
  to: Place | null;
  later: Now | null; // when you are leaving, if not now
  arriving: boolean; // and whether that is when you arrive instead
};

export function useWays({ data, now, stations, from, to, later, arriving }: Ask) {
  // the two ends Search was last pressed for: the ways are shown only while they are still the
  // ones in the fields, and anything you change takes them away until you search again
  const [searched, setSearched] = useState<string | null>(null);
  const asked = from && to ? `${from.id}>${to.id}` : null;
  const shown = asked !== null && searched === asked;
  // the way that is picked, by what tells it from the others: the list is found again every
  // minute, and the one you picked keeps its place in it only until the first one leaves
  const [way, setWay] = useState<string | null>(null);
  // and the way itself: once it has left it is not found any more, but you are on it, so it
  // stays - open, at the top of the list - until you are there
  const [kept, setKept] = useState<Journey | null>(null);

  // an end that is an address is one of the stations near it, after a walk; the walks are
  // found once for each address, and only when the paths have been downloaded
  const walking = useWalking(Boolean((from && !isStation(from)) || (to && !isStation(to))));
  const aroundFrom = useMemo(() => around(from, stations, walking), [from, stations, walking]);
  const aroundTo = useMemo(() => around(to, stations, walking), [to, stations, walking]);
  const starts = useMemo(() => endsOf(from, aroundFrom, stations, false), [from, aroundFrom]);
  const ends = useMemo(() => endsOf(to, aroundTo, stations, true), [to, aroundTo]);
  const ready = starts !== null && ends !== null; // the walks are known, where there are any

  // The ways are looked for from the moment you are leaving. What is found counts its days
  // from that day, and everything that shows it counts them from today: a trip found for
  // tomorrow at "day 0" is tomorrow's.
  const leaving = later ?? now;
  const ahead = daysBetween(now.date, leaving.date);
  // what the rounds of the planner need of the timetable; it only changes with the day
  const network = useMemo(() => buildNetwork(data, leaving), [data, leaving.date]);
  const found = useMemo(
    () =>
      shown && starts && ends
        ? waysBetween(data, network, starts, ends, leaving, Boolean(later && arriving)).map((one) =>
            fromToday(walksToPlatforms(data, one, aroundFrom ?? null, aroundTo ?? null), ahead),
          )
        : [],
    [data, network, starts, ends, aroundFrom, aroundTo, leaving, later, arriving, shown, ahead],
  );
  // and the one you are on, when it has left and you are not there yet
  const ways = useMemo(() => {
    if (!kept || found.some((other) => wayKey(other) === wayKey(kept))) return found;
    if (secondsUntil(kept.arrival, now) < -ARRIVED_S) return found;
    return [kept, ...found];
  }, [found, kept, now]);
  const picked = ways.find((one) => wayKey(one) === way);

  return {
    asked, // the two ends, as one key, when both are there
    shown, // Search was pressed for them: the ways are shown
    ready,
    ways,
    way, // the key of the one picked
    picked,
    // Search: the ways for what is in the fields now, none of them picked
    search() {
      setWay(null);
      setKept(null);
      setSearched(asked);
    },
    // what was found no longer fits what is asked
    forget() {
      setWay(null);
      setKept(null);
      setSearched(null);
    },
    // picks a way, or takes it off again when it was the one picked; says which it did
    pick(one: Journey): boolean {
      const key = wayKey(one);
      if (key === way) {
        setWay(null);
        setKept(null);
        return false;
      }
      setWay(key);
      setKept(one);
      return true;
    },
  };
}

// One end of the journey as the search wants it: a station as it is, an address as the
// stations near it with the walks there - from the address at the start, to it at the end.
// Null while the paths to walk along are not there yet.
function endsOf(
  place: Place | null,
  near: Around | null | undefined,
  stations: MapStation[],
  last: boolean,
): End[] | null {
  if (!place) return null;
  if (isStation(place)) return [{ station: place.id }];
  if (near === undefined) return null;
  if (near === null) return []; // the address is far from every path: nothing to walk to
  return walksFrom(near, stations).map((foot) => ({
    station: foot.station,
    walk: {
      name: place.name,
      minutes: foot.minutes,
      path: last ? [...foot.path].reverse() : foot.path,
    },
  }));
}

// What is within walking distance of an address; undefined while the paths are not there yet,
// and null for a station, an address far from every path, or when the paths could not be
// downloaded.
function around(place: Place | null, stations: MapStation[], walking: Walking | null | false) {
  if (!place || isStation(place)) return null;
  if (walking === null) return undefined;
  if (walking === false) return null;
  return aroundAddress(walking.graph, stations, place);
}

// A way counted from a day some days earlier.
const fromToday = (way: Journey, days: number): Journey => ({
  ...way,
  departure: daysLater(way.departure, days),
  arrival: daysLater(way.arrival, days),
  legs: way.legs.map((leg) => ({ ...leg, ride: rideLater(leg.ride, days) })),
});

// The same departure (or ride) counted from a day some days earlier.
const daysLater = (departure: Departure, days: number): Departure => ({
  ...departure,
  day: departure.day + days,
});
const rideLater = (ride: Ride, days: number): Ride => ({
  ...ride,
  departure: daysLater(ride.departure, days),
});
