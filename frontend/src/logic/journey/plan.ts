// Journeys with changes, found with RAPTOR (Round-bAsed Public Transit Optimized Router,
// Delling, Pajor and Werneck, 2012). It works in rounds: after the first round every station
// holds the earliest time one trip can get you there, after the second the earliest with one
// change, and so on. Each round scans the routes that touch a station reached in the round
// before, boards the earliest trip that can still be caught, and writes down where it arrives.
//
// A route in that sense is one of our variants and a trip one of its runs. Changing at a
// station is changing in place, because a station here is the whole stop (Česká is all of its
// platforms), and is given a fixed time. Between two stations a round also walks, where the
// official timetable says you can (data.transfers), which is the foot-path step of RAPTOR.
// A journey may also end on foot, where the timetable says the station you asked for is a short
// walk from one a line takes you to - at night the last few hundred metres are often the way
// there, where a line to the station itself runs only in the morning.

import type { TransitData, Variant } from "../timetable/loadData.ts";
import { tripsOn, type Departure, type Trip } from "../timetable/departures.ts";
import { addDays, DAY, type Now } from "../timetable/clock.ts";
import type { Ride } from "./direct.ts";

// ---------- settings ----------
const ROUNDS = 3; // one trip, then one change, then two
const CHANGE_S = 120; // how long a change at a station is given, unless its platforms are far
// apart and the walk between them is known to take longer (data.changes)
const DAYS_AHEAD = 1; // the trips looked at: the rest of today and tomorrow
// ------------------------------

// One trip of a journey: which line, and the ride on it.
export type JourneyLeg = {
  line: string;
  kind: Variant["kind"];
  ride: Ride; // the same shape a direct connection has, so the map draws it the same way
  walk?: Walk; // when you walked to this line from another station before getting on
};

// Walking from one station to another before getting on.
export type Walk = { from: string; minutes: number };

// Walking from the last station a line takes you to, to the end of the journey.
export type WalkTo = { from: string; to: string; minutes: number };

// Walking between an address and a station: to the first line from where you start, or from
// the last one to where you are going (logic/walk finds the way).
export type DoorWalk = {
  name: string; // the address
  minutes: number;
  path: [number, number][]; // in the order you walk it
};

// One way of getting there, with as many changes as it has legs minus one.
export type Journey = {
  legs: JourneyLeg[];
  departure: Departure; // when you set off: the first leg leaves, or you leave the address
  arrival: Departure; // when you are there: the last leg arrives, or you reach the address
  minutes: number; // the whole journey, waiting and walking included
  walkAfter?: WalkTo; // when the last line does not go to the end itself
  walkFirst?: DoorWalk; // from the address you start at, to the first line
  walkLast?: DoorWalk; // from the last line, to the address you are going to
};

// What RAPTOR needs of the timetable, built once for a day: which routes pass a station, and
// the runs of each route in the days looked at, in seconds from the start of today.
export type Network = {
  at: Map<string, { variant: number; stop: number }[]>;
  runs: Map<number, Trip[]>; // sorted by the time they start
};

export function buildNetwork(data: TransitData, now: Now): Network {
  const at = new Map<string, { variant: number; stop: number }[]>();
  const runs = new Map<number, Trip[]>();
  for (const variant of data.variants) {
    variant.stops.forEach((station, stop) => {
      const here = at.get(station);
      if (here) here.push({ variant: variant.id, stop });
      else at.set(station, [{ variant: variant.id, stop }]);
    });
    const trips: Trip[] = [];
    // from yesterday, whose night trips run into today, to the end of tomorrow
    for (let day = -1; day <= DAYS_AHEAD; day++) {
      for (const trip of tripsOn(data, variant, addDays(now.date, day))) {
        trips.push({ start: day * DAY + trip.start, pattern: trip.pattern });
      }
    }
    runs.set(
      variant.id,
      trips.sort((a, b) => a.start - b.start),
    );
  }
  return { at, runs };
}

// The ways of getting from one station to another, the one with the fewest changes first.
// A journey is only kept when it arrives earlier than every journey with fewer changes.
export function planJourney(
  data: TransitData,
  network: Network,
  from: string,
  to: string,
  now: Now,
): Journey[] {
  if (from === to) return [];
  const best = new Map<string, number>([[from, now.seconds]]); // earliest known, over all rounds
  let reached = new Map<string, number>([[from, now.seconds]]); // what the round before reached
  let walked = new Map<string, Walk>(); // how the round before got there on foot
  let arrivedAt = new Map<string, string>(); // and the platform it got there at, on board
  const taken: Map<string, JourneyLeg>[] = []; // per round: how each station was reached
  const journeys: Journey[] = [];

  for (let round = 0; round < ROUNDS && reached.size > 0; round++) {
    const legs = new Map<string, JourneyLeg>();
    const next = new Map<string, number>();
    for (const [variantId, first] of routesToScan(network, reached)) {
      scanRoute(
        data,
        network,
        variantId,
        first,
        round,
        reached,
        walked,
        arrivedAt,
        best,
        next,
        legs,
      );
    }
    const onFoot = walkToEnd(data, to, next);
    walked = walkOn(data, to, next, best);
    taken.push(legs);
    reached = next;
    arrivedAt = new Map(
      [...legs].map(([station, leg]) => [
        station,
        platformOf(data.variants[leg.ride.variant], leg.ride.at + leg.ride.stops),
      ]),
    );
    // the round got to the end earlier than any round before it, on foot or on board: another
    // way of getting there; when both, the earlier one
    if (onFoot && onFoot.arrives < (best.get(to) ?? Infinity)) {
      best.set(to, onFoot.arrives);
      const journey = journeyTo(data, network, taken, from, onFoot.from, round);
      if (journey) journeys.push(endOnFoot(journey, onFoot.from, to, onFoot.seconds));
    } else if (legs.has(to)) {
      const journey = journeyTo(data, network, taken, from, to, round);
      if (journey) journeys.push(journey);
    }
  }
  return journeys;
}

// The earliest a round gets you to the end on foot: from a station a line took you to, where
// the timetable says you can walk to the end from there. Null when none of them is.
function walkToEnd(data: TransitData, to: string, next: Map<string, number>) {
  let earliest: { from: string; arrives: number; seconds: number } | null = null;
  for (const [station, arrives] of next) {
    if (station === to) continue;
    const seconds = data.transfers[station]?.find(([other]) => other === to)?.[1];
    if (seconds === undefined) continue;
    if (!earliest || arrives + seconds < earliest.arrives) {
      earliest = { from: station, arrives: arrives + seconds, seconds };
    }
  }
  return earliest;
}

// A journey that gets off one station before the end and walks the rest.
function endOnFoot(journey: Journey, from: string, to: string, seconds: number): Journey {
  const arrival = secondsOf(journey.arrival) + seconds;
  return {
    ...journey,
    arrival: asDeparture(arrival),
    minutes: Math.round((arrival - secondsOf(journey.departure)) / 60),
    walkAfter: { from, to, minutes: Math.round(seconds / 60) },
  };
}

// Walking at the end of a round: from every station it reached, to the stations the timetable
// says you can walk to, when that gets you there sooner than anything known. The stations
// walked to join the round, so that the next one can leave from them. Walking to the end of
// the journey is left out, and so is walking on from a station just walked to - one walk is
// a change, two in a row are a different journey.
function walkOn(
  data: TransitData,
  to: string,
  next: Map<string, number>,
  best: Map<string, number>,
): Map<string, Walk> {
  const walked = new Map<string, Walk>();
  for (const [station, arrives] of [...next]) {
    for (const [other, seconds] of data.transfers[station] ?? []) {
      if (other === to) continue;
      const onFoot = arrives + seconds;
      if (onFoot >= (best.get(other) ?? Infinity)) continue;
      best.set(other, onFoot);
      next.set(other, onFoot);
      walked.set(other, { from: station, minutes: Math.round(seconds / 60) });
    }
  }
  return walked;
}

// The routes a round looks at: every route that passes a station the round before reached,
// each from the earliest such station on it, because nothing before it can be boarded.
function routesToScan(network: Network, reached: Map<string, number>): Map<number, number> {
  const routes = new Map<number, number>();
  for (const station of reached.keys()) {
    for (const { variant, stop } of network.at.get(station) ?? []) {
      const first = routes.get(variant);
      if (first === undefined || stop < first) routes.set(variant, stop);
    }
  }
  return routes;
}

// One route in one round: ride along it from the first station that can be boarded, writing
// down every station it reaches earlier than anything known, and hopping onto an earlier trip
// wherever the round before got here in time for one.
function scanRoute(
  data: TransitData,
  network: Network,
  variantId: number,
  first: number,
  round: number,
  reached: Map<string, number>,
  walked: Map<string, Walk>,
  arrivedAt: Map<string, string>,
  best: Map<string, number>,
  next: Map<string, number>,
  legs: Map<string, JourneyLeg>,
) {
  const variant = data.variants[variantId];
  const trips = network.runs.get(variantId) ?? [];
  let trip: Trip | null = null;
  let boardedAt = -1;
  let boardedWalk: Walk | undefined; // set when the stop it was boarded at was walked to

  for (let stop = first; stop < variant.stops.length; stop++) {
    const station = variant.stops[stop];
    if (trip) {
      const arrives = trip.start + trip.pattern[stop];
      if (arrives < (best.get(station) ?? Infinity)) {
        best.set(station, arrives);
        next.set(station, arrives);
        legs.set(station, legOf(variant, trip, boardedAt, stop, boardedWalk));
      }
    }
    // the round before may have got here early enough for a trip this one cannot catch
    const here = reached.get(station);
    if (here === undefined) continue;
    const ready =
      here +
      (round === 0
        ? 0
        : changeSeconds(data, station, arrivedAt.get(station), platformOf(variant, stop)));
    if (trip && ready > trip.start + trip.pattern[stop]) continue;
    const earlier = earliestTrip(trips, stop, ready);
    if (earlier && (!trip || earlier.start < trip.start)) {
      trip = earlier;
      boardedAt = stop;
      boardedWalk = walked.get(station);
    }
  }
}

// The first trip of a route that leaves a stop at or after a time. The trips are sorted by
// when they start and all runs of a route take about as long, so they leave each stop in the
// same order, which is what this search rests on.
function earliestTrip(trips: Trip[], stop: number, ready: number): Trip | null {
  let low = 0;
  let high = trips.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (trips[middle].start + trips[middle].pattern[stop] < ready) low = middle + 1;
    else high = middle;
  }
  return trips[low] ?? null;
}

function legOf(variant: Variant, trip: Trip, at: number, off: number, walk?: Walk): JourneyLeg {
  const leaves = trip.start + trip.pattern[at];
  return {
    line: variant.line,
    kind: variant.kind,
    walk,
    ride: {
      variant: variant.id,
      at,
      departure: asDeparture(leaves),
      minutes: Math.round((trip.pattern[off] - trip.pattern[at]) / 60),
      stops: off - at,
      pattern: trip.pattern,
    },
  };
}

// The journey that reached the end in a round, read back leg by leg. A station may have been
// reached in an earlier round than the one before this leg, so the rounds are walked down
// until the leg that reached it is found. Null when the way back does not lead to the start.
function journeyTo(
  data: TransitData,
  network: Network,
  taken: Map<string, JourneyLeg>[],
  from: string,
  to: string,
  round: number,
): Journey | null {
  const legs: JourneyLeg[] = [];
  let station = to;
  for (let i = round; i >= 0 && station !== from; i--) {
    const leg = taken[i].get(station);
    if (!leg) continue;
    // a copy, because the same leg may be part of another journey too and rideFurther changes it
    legs.unshift({ ...leg });
    // when the line was boarded after a walk, the journey came from where that walk started
    station = leg.walk ? leg.walk.from : data.variants[leg.ride.variant].stops[leg.ride.at];
  }
  if (station !== from || legs.length === 0) return null;
  leaveLater(data, network, legs);
  rideFurther(data, legs);
  const first = legs[0].ride.departure;
  const last = legs[legs.length - 1].ride;
  const arrival = secondsOf(last.departure) + last.minutes * 60;
  return {
    legs,
    departure: first,
    arrival: asDeparture(arrival),
    minutes: Math.round((arrival - secondsOf(first)) / 60),
  };
}

// Leaving as late as you can. A round boards the first trip that can be caught, so a journey
// whose last line runs rarely (the first tram in the morning) took the very next trip of every
// line before it and then had you wait hours at a stop. The arrival is what counts, and it
// stays the same: from the last leg back, each one takes the latest trip of its line that
// still gets you to the next one in time.
function leaveLater(data: TransitData, network: Network, legs: JourneyLeg[]) {
  for (let i = legs.length - 2; i >= 0; i--) {
    const leg = legs[i];
    const next = legs[i + 1];
    const off = leg.ride.at + leg.ride.stops;
    // the time the change takes: a walk to the next line's station, or the change in place
    const walk = next.walk
      ? (data.transfers[next.walk.from] ?? []).find(
          ([station]) => station === data.variants[next.ride.variant].stops[next.ride.at],
        )?.[1]
      : undefined;
    const change = changeSeconds(
      data,
      data.variants[leg.ride.variant].stops[off],
      platformOf(data.variants[leg.ride.variant], off),
      platformOf(data.variants[next.ride.variant], next.ride.at),
    );
    const deadline = secondsOf(next.ride.departure) - (walk ?? change);
    const trip = latestTrip(network.runs.get(leg.ride.variant) ?? [], off, deadline);
    if (!trip) continue;
    const leaves = trip.start + trip.pattern[leg.ride.at];
    if (leaves <= secondsOf(leg.ride.departure)) continue; // it already was the latest
    legs[i] = {
      ...leg,
      ride: {
        ...leg.ride,
        departure: asDeparture(leaves),
        minutes: Math.round((trip.pattern[off] - trip.pattern[leg.ride.at]) / 60),
        pattern: trip.pattern,
      },
    };
  }
}

// The last trip of a route that is at a stop at or before a time; see earliestTrip.
function latestTrip(trips: Trip[], stop: number, by: number): Trip | null {
  let low = 0;
  let high = trips.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (trips[middle].start + trips[middle].pattern[stop] <= by) low = middle + 1;
    else high = middle;
  }
  return trips[low - 1] ?? null;
}

// Changing as late as you can. A round takes the earliest arrival at every station, so it
// gets off at the first station where the next line can be caught - true, but it leaves you
// standing at a stop while the tram you were on drives the same way. The trips and the arrival
// stay the same, so riding the one you are on as far as it still meets the next one costs
// nothing and waits less. A change that is a walk between two stations is left alone.
function rideFurther(data: TransitData, legs: JourneyLeg[]) {
  for (let i = 1; i < legs.length; i++) {
    const before = legs[i - 1].ride;
    const leg = legs[i];
    if (leg.walk) continue;
    const beforeStops = data.variants[before.variant].stops;
    const stops = data.variants[leg.ride.variant].stops;
    const off = leg.ride.at + leg.ride.stops;
    let later: { rideOn: number; at: number } | null = null;

    for (let k = before.at + before.stops + 1; k < beforeStops.length; k++) {
      const at = stops.indexOf(beforeStops[k], leg.ride.at + 1);
      if (at < 0 || at >= off) continue; // not on the way, or you would be there already
      const arrives = secondsOf(before.departure) + before.pattern[k] - before.pattern[before.at];
      const leaves =
        secondsOf(leg.ride.departure) + leg.ride.pattern[at] - leg.ride.pattern[leg.ride.at];
      // riding on only makes you later, so once the next trip is gone it is gone
      const change = changeSeconds(
        data,
        beforeStops[k],
        platformOf(data.variants[before.variant], k),
        platformOf(data.variants[leg.ride.variant], at),
      );
      if (arrives + change > leaves) break;
      later = { rideOn: k, at };
    }
    if (!later) continue;

    legs[i - 1] = { ...legs[i - 1], ride: cutRide(before, before.at, later.rideOn) };
    legs[i] = { ...leg, ride: cutRide(leg.ride, later.at, off) };
  }
}

// The same ride, got on and off somewhere else on the same trip.
function cutRide(ride: Ride, at: number, off: number): Ride {
  const start = secondsOf(ride.departure) - ride.pattern[ride.at];
  return {
    ...ride,
    at,
    stops: off - at,
    departure: asDeparture(start + ride.pattern[at]),
    minutes: Math.round((ride.pattern[off] - ride.pattern[at]) / 60),
  };
}

// How long a change at a station takes, from the platform you got off at to the one you get on
// at: two minutes, or the walk between them where they are far apart.
function changeSeconds(data: TransitData, station: string, from: string | undefined, to: string) {
  if (from === undefined) return CHANGE_S;
  return data.changes?.[station]?.[`${from}>${to}`] ?? CHANGE_S;
}

// Where a route stops at one of its stations, as data.changes knows the platforms.
function platformOf(variant: Variant, stop: number): string {
  return variant.positions[stop].join(",");
}

// Seconds from the start of today, and back again.
function secondsOf(departure: Departure): number {
  return departure.day * DAY + departure.seconds;
}

function asDeparture(seconds: number): Departure {
  return { day: Math.floor(seconds / DAY), seconds: seconds % DAY };
}
