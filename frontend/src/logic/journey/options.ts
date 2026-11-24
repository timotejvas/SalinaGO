// The ways there that a search offers: the next few, whatever each of them is - a line that
// takes you there without a change, a way with changes, one that ends on foot - in the order
// they get you there. Not only the fastest one: you may want to leave a little later, or
// change less.
// The lines without a change come from direct.ts with their next rides, the others from the
// planner (plan.ts), asked again from just after the first way it found, so that it finds the
// next ones too. A way is left out when another one leaves no earlier, arrives no later and
// changes no more often: nobody would take it.
// To arrive by a time, the search starts as long before it as the fastest way takes, and steps
// further back until it has found enough ways that are there in time; it keeps the last of them.
// No React and no map here, only data in, data out.

import type { TransitData } from "../timetable/loadData.ts";
import type { Departure } from "../timetable/departures.ts";
import { DAY, type Now } from "../timetable/clock.ts";
import { directConnections, type DirectOption, type Ride } from "./direct.ts";
import { planJourney, type DoorWalk, type Journey, type Network } from "./plan.ts";

// ---------- settings ----------
const OFFERED = 5; // how many ways a search offers
const SEARCHES = 6; // the planner is asked at most this many times, one after another
const STEP_BACK_S = 20 * 60; // to arrive by a time: how far back each search starts from the last
const STEPS_BACK = 8; // and how many times at most (two hours and forty minutes)
// ------------------------------

export function waysThere(
  data: TransitData,
  network: Network,
  from: string,
  to: string,
  leaving: Now,
  offered = OFFERED,
): Journey[] {
  return worthTaking(collect(data, network, from, to, leaving, SEARCHES))
    .sort(
      (a, b) =>
        secondsOf(a.arrival) - secondsOf(b.arrival) ||
        a.legs.length - b.legs.length ||
        secondsOf(b.departure) - secondsOf(a.departure),
    )
    .slice(0, offered);
}

// The ways that get you there by a time: the last few that do, the earliest of them first.
export function waysArrivingBy(
  data: TransitData,
  network: Network,
  from: string,
  to: string,
  by: Now,
  offered = OFFERED,
): Journey[] {
  // how long the fastest way takes, found by asking well before
  const probe = planJourney(data, network, from, to, { ...by, seconds: by.seconds - 3 * 3600 });
  if (probe.length === 0) return [];
  const fastest = Math.min(...probe.map((way) => way.minutes)) * 60;
  let inTime: Journey[] = [];
  for (let step = 1; step <= STEPS_BACK && inTime.length < offered; step++) {
    const start = { ...by, seconds: by.seconds - fastest - step * STEP_BACK_S };
    const found = collect(data, network, from, to, start, SEARCHES).filter(
      (way) => secondsOf(way.arrival) <= by.seconds,
    );
    inTime = worthTaking([...inTime, ...found]);
  }
  return inTime
    .sort(
      (a, b) =>
        secondsOf(a.departure) - secondsOf(b.departure) ||
        secondsOf(a.arrival) - secondsOf(b.arrival),
    )
    .slice(-offered);
}

// Every way found from a moment on: the lines without a change with their next rides, and the
// planner asked again and again, each time from a minute after the first way it found leaves.
function collect(
  data: TransitData,
  network: Network,
  from: string,
  to: string,
  leaving: Now,
  searches: number,
): Journey[] {
  const found: Journey[] = [];
  for (const option of directConnections(data, from, to, leaving)) {
    for (const ride of option.rides) found.push(asJourney(option, ride));
  }
  let moment = leaving;
  for (let search = 0; search < searches; search++) {
    const ways = planJourney(data, network, from, to, moment);
    if (ways.length === 0) break;
    found.push(...ways);
    const first = Math.min(...ways.map((way) => secondsOf(way.departure)));
    moment = { ...moment, seconds: first + 60 };
  }
  return found;
}

// One end of a journey as the search sees it: a station, and - when the journey really starts
// or ends at an address - the walk between that address and the station.
export type End = { station: string; walk?: DoorWalk };

// The ways between two ends that may each be one of several stations: an address has a few
// near it, each a walk away. Every pair of them is searched, the walks put before and after,
// and the best of all of them offered - by when you are there, as waysThere and waysArrivingBy
// offer them. When you walk to the end from a station anyway, the walks between stations that
// the timetable knows of are left out: the walk from the address is the one that counts.
export function waysBetween(
  data: TransitData,
  network: Network,
  starts: End[],
  ends: End[],
  moment: Now,
  arriving: boolean,
  offered = OFFERED,
): Journey[] {
  const found: Journey[] = [];
  for (const start of starts) {
    for (const end of ends) {
      if (start.station === end.station) continue;
      const before = (start.walk?.minutes ?? 0) * 60;
      const after = (end.walk?.minutes ?? 0) * 60;
      const ways = arriving
        ? waysArrivingBy(
            data,
            network,
            start.station,
            end.station,
            shifted(moment, -after),
            offered,
          )
        : waysThere(data, network, start.station, end.station, shifted(moment, before), offered);
      for (const way of ways) {
        if (end.walk && way.walkAfter) continue;
        found.push(withWalks(way, start.walk, end.walk));
      }
    }
  }
  const kept = worthTaking(found);
  if (arriving) {
    return kept
      .sort(
        (a, b) =>
          secondsOf(a.departure) - secondsOf(b.departure) ||
          secondsOf(a.arrival) - secondsOf(b.arrival),
      )
      .slice(-offered);
  }
  return kept
    .sort(
      (a, b) =>
        secondsOf(a.arrival) - secondsOf(b.arrival) ||
        a.legs.length - b.legs.length ||
        secondsOf(b.departure) - secondsOf(a.departure),
    )
    .slice(0, offered);
}

// A way with the walks from and to the addresses: you set off that much earlier and are there
// that much later.
function withWalks(way: Journey, first?: DoorWalk, last?: DoorWalk): Journey {
  if (!first && !last) return way;
  const departure = secondsOf(way.departure) - (first?.minutes ?? 0) * 60;
  const arrival = secondsOf(way.arrival) + (last?.minutes ?? 0) * 60;
  return {
    ...way,
    departure: asDeparture(departure),
    arrival: asDeparture(arrival),
    minutes: Math.round((arrival - departure) / 60),
    walkFirst: first,
    walkLast: last,
  };
}

const shifted = (moment: Now, seconds: number): Now => ({
  ...moment,
  seconds: moment.seconds + seconds,
});

const asDeparture = (seconds: number): Departure => ({
  day: Math.floor(seconds / DAY),
  seconds: ((seconds % DAY) + DAY) % DAY,
});

// One ride of a line without a change, as a way there.
function asJourney(option: DirectOption, ride: Ride): Journey {
  const arrival = secondsOf(ride.departure) + ride.minutes * 60;
  return {
    legs: [{ line: option.line, kind: option.kind, ride }],
    departure: ride.departure,
    arrival: { day: Math.floor(arrival / DAY), seconds: arrival % DAY },
    minutes: ride.minutes,
  };
}

// Each way once, and only the ones no other way is better than in everything.
function worthTaking(ways: Journey[]): Journey[] {
  const once = new Map(ways.map((way) => [wayKey(way), way]));
  const all = [...once.values()];
  return all.filter((way) => !all.some((other) => other !== way && better(other, way)));
}

// Leaves no earlier, arrives no later, changes no more often - and is not just the same.
function better(other: Journey, way: Journey): boolean {
  const [leaves, arrives] = [secondsOf(other.departure), secondsOf(other.arrival)];
  const [wayLeaves, wayArrives] = [secondsOf(way.departure), secondsOf(way.arrival)];
  if (leaves < wayLeaves || arrives > wayArrives || other.legs.length > way.legs.length) {
    return false;
  }
  return leaves > wayLeaves || arrives < wayArrives || other.legs.length < way.legs.length;
}

// What tells one way from another: its rides, and where it walks at the end.
export function wayKey(way: Journey): string {
  const rides = way.legs.map(
    ({ ride }) => `${ride.variant}:${ride.at}:${ride.stops}:${secondsOf(ride.departure)}`,
  );
  return `${rides.join(" ")} ${way.walkAfter?.from ?? ""}`;
}

const secondsOf = (departure: Departure) => departure.day * DAY + departure.seconds;
