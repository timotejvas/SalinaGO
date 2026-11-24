// Questions about the timetable. No React and no map here, only data in, data out:
//   - whether a route runs now and when its next trips leave, from its start or any station,
//   - when it runs today and how often it runs now,
//   - the same in words, as the panel shows them.
// What time it is in Brno, and how a date or a time is written, is in clock.ts.
// The questions about trips take a list of routes: one route, or all routes of a direction
// (the main route with its short-turns and depot trips).

import { WORDS, type Words } from "../words.ts";
import type { TransitData, Variant } from "./loadData.ts";
import { addDays, DAY, formatDate, formatTime, type Now } from "./clock.ts";

// ---------- settings ----------
// a trip counts as "running" if it is on the way or starts within this many minutes
const WINDOW_MIN = 60;
const LOOK_AHEAD_DAYS = 7; // how far ahead the next trip is searched
// "every N min" is the usual gap between the trips from this long before now to this long after
const FREQUENCY_WINDOW_MIN = 60;
// the next trips are listed with their time up to this far ahead, later ones with their day
const SOON_HOURS = 6;
// trips after midnight before this hour belong to tonight, later ones to tomorrow morning
const NIGHT_ENDS_HOUR = 3;
// ------------------------------

// One trip of a variant on a service day: when it leaves its first station (seconds after
// midnight of that day, can exceed 24:00) and how long it takes to reach each of its stations.
export type Trip = {
  start: number;
  pattern: number[]; // seconds from the start to each station, in the order of variant.stops
};

// A trip leaving the first station of its route.
export type Departure = {
  day: number; // 0 = today, 1 = tomorrow, ...
  seconds: number; // seconds after midnight of that day
};

// Whether today is inside the period the timetable is valid for.
export function isTimetableCurrent(data: TransitData, now: Now): boolean {
  return Boolean(data.active[now.date]);
}

// ---------- when a route runs ----------

// The start times of the trips of the variants on one service day (seconds, can exceed 24:00).
function startsOn(data: TransitData, variants: Variant[], date: string): number[] {
  const starts: number[] = [];
  for (const service of data.active[date] ?? []) {
    for (const variant of variants) {
      const times = variant.trips[service] ?? [];
      for (let i = 0; i < times.length; i += 2) starts.push(times[i]);
    }
  }
  return starts.sort((a, b) => a - b);
}

// Every trip a variant makes on one service day: when it starts, and its running times
// (seconds from the start to each of its stations, see scripts/gtfs/variants.mjs).
export function tripsOn(data: TransitData, variant: Variant, date: string): Trip[] {
  const trips: Trip[] = [];
  for (const service of data.active[date] ?? []) {
    const times = variant.trips[service] ?? [];
    const patterns = variant.tripPatterns[service] ?? [];
    for (let i = 0; i < patterns.length; i++) {
      trips.push({ start: times[2 * i], pattern: variant.patterns[patterns[i]] });
    }
  }
  return trips;
}

// When the trips of the variants leave a station on one service day: the start of each trip
// plus its running time to that station.
function timesAt(data: TransitData, variants: Variant[], station: string, date: string): number[] {
  const times: number[] = [];
  for (const variant of variants) {
    const at = variant.stops.indexOf(station);
    if (at < 0) continue;
    for (const trip of tripsOn(data, variant, date)) times.push(trip.start + trip.pattern[at]);
  }
  return times.sort((a, b) => a - b);
}

// The trips of a variant that are on the way now or start within WINDOW_MIN minutes,
// as their start times in seconds after today's midnight, earliest first.
function currentTrips(data: TransitData, variant: Variant, now: Now): number[] {
  const until = now.seconds + WINDOW_MIN * 60;
  const starts: number[] = [];
  for (const [service, times] of Object.entries(variant.trips)) {
    // a trip of yesterday's service day may run after midnight (its times are above 24:00)
    for (const [date, shift] of [
      [now.date, 0],
      [now.yesterday, -DAY],
    ] as const) {
      if (!data.active[date]?.includes(service)) continue;
      for (let i = 0; i < times.length; i += 2) {
        const start = times[i] + shift;
        const end = times[i + 1] + shift;
        if (start <= until && end >= now.seconds) starts.push(start);
      }
    }
  }
  return starts.sort((a, b) => a - b);
}

// Whether the variant has a trip that is on the way now or starts within WINDOW_MIN minutes.
export function isRunning(data: TransitData, variant: Variant, now: Now): boolean {
  return currentTrips(data, variant, now).length > 0;
}

// The next trips of the variants that leave their first station from now on, at most `count`,
// searched up to LOOK_AHEAD_DAYS ahead. Empty when nothing leaves in that time.
export function nextDepartures(
  data: TransitData,
  variants: Variant[],
  now: Now,
  count: number,
): Departure[] {
  return nextTimes(now, count, (date) => startsOn(data, variants, date));
}

// The next times a trip of the variants leaves the given station, at most `count`,
// searched up to LOOK_AHEAD_DAYS ahead. Variants that do not stop there are left out.
export function nextAtStation(
  data: TransitData,
  variants: Variant[],
  station: string,
  now: Now,
  count: number,
): Departure[] {
  return nextTimes(now, count, (date) => timesAt(data, variants, station, date));
}

// The lines that leave a station, each with when it leaves next - only the routes of a line
// that stop there count, and a line with no trip from there in the days looked ahead is left
// out: a line can be listed at a station for a few diversions a year.
export function linesLeaving(
  data: TransitData,
  station: string,
  lines: { line: string; kind: Variant["kind"] }[],
  now: Now,
): { line: string; kind: Variant["kind"]; next: Departure }[] {
  return lines.flatMap(({ line, kind }) => {
    const routes = data.variants.filter(
      (variant) =>
        variant.line === line && variant.kind === kind && variant.stops.includes(station),
    );
    const [next] = nextAtStation(data, routes, station, now, 1);
    return next ? [{ line, kind, next }] : [];
  });
}

// The next `count` of the times that `timesOn` gives for each service day (seconds after the
// start of that day, can exceed 24:00), from now on.
function nextTimes(now: Now, count: number, timesOn: (date: string) => number[]): Departure[] {
  const found: number[] = []; // seconds from the start of today
  // from yesterday, because its trips after midnight leave today
  for (let day = -1; day <= LOOK_AHEAD_DAYS && found.length < count; day++) {
    for (const time of timesOn(addDays(now.date, day))) {
      const fromToday = day * DAY + time;
      if (fromToday >= now.seconds) found.push(fromToday);
    }
    found.sort((a, b) => a - b);
  }
  return found
    .slice(0, count)
    .map((fromToday) => ({ day: Math.floor(fromToday / DAY), seconds: fromToday % DAY }));
}

// The first and the last trip of the variants today, "4:52–22:22", or null without trips today.
export function todayHours(data: TransitData, variants: Variant[], now: Now): string | null {
  const starts = startsOn(data, variants, now.date);
  return starts.length > 0 ? describeSpan(starts) : null;
}

// How often the variants run now: the usual gap between their trips around this time, in
// minutes, or null when fewer than three trips leave in that time.
export function frequencyNow(data: TransitData, variants: Variant[], now: Now): number | null {
  const window = FREQUENCY_WINDOW_MIN * 60;
  const starts = [
    ...startsOn(data, variants, now.yesterday).map((start) => start - DAY), // after midnight
    ...startsOn(data, variants, now.date),
  ]
    .filter((start) => Math.abs(start - now.seconds) <= window)
    .sort((a, b) => a - b);
  if (starts.length < 3) return null;
  const gaps = starts.slice(1).map((start, i) => start - starts[i]);
  return Math.round(gaps.sort((a, b) => a - b)[Math.floor(gaps.length / 2)] / 60); // the median
}

// The first and the last trip of the day, "4:52–23:36", or "6:35" for a single time.
// The day is taken to begin after the longest pause between trips, so that a night line
// reads "23:03–4:33" and not "0:03–23:33".
function describeSpan(starts: number[]): string {
  const times = [...new Set(starts.map((start) => start % DAY))].sort((a, b) => a - b);
  let first = 0; // index of the first trip after the longest pause
  let longestPause = times[0] + DAY - times[times.length - 1]; // the pause over midnight
  for (let i = 1; i < times.length; i++) {
    if (times[i] - times[i - 1] > longestPause) {
      longestPause = times[i] - times[i - 1];
      first = i;
    }
  }
  const last = (first + times.length - 1) % times.length;
  if (first === last) return formatTime(times[first]);
  return `${formatTime(times[first])}–${formatTime(times[last])}`;
}

// ---------- in words ----------

// How long it is until a departure, in seconds (negative once it has left).
export function secondsUntil(departure: Departure, now: Now): number {
  return departure.day * DAY + departure.seconds - now.seconds;
}

// When a trip leaves, as the panel shows it: "now" and "in 4 min" while it is close,
// later ones by their time, with the day when they are not today ("tomorrow 4:52").
export function describeWhen(departure: Departure, now: Now, w: Words = WORDS.en): string {
  const minutes = Math.round(secondsUntil(departure, now) / 60);
  if (minutes <= 0) return w.now;
  if (minutes < 60) return w.inMinutes(minutes);
  const { day, seconds } = departure;
  const when =
    day === 0
      ? ""
      : day === 1
        ? `${w.tomorrow} `
        : `${formatDate(addDays(now.date, day), false, w)} `;
  return `${when}${formatTime(seconds)}`;
}

// The next trips as short labels: the times within SOON_HOURS (night trips after midnight
// included), otherwise only the next trip with its day ("tomorrow 4:52", "14 Nov 4:52").
// "none this week" when there is no trip within LOOK_AHEAD_DAYS.
export function describeDepartures(next: Departure[], now: Now, w: Words = WORDS.en): string[] {
  if (next.length === 0) return [w.noneThisWeek];
  const fromNow = (departure: Departure) => departure.day * DAY + departure.seconds - now.seconds;
  const soon = next.filter(
    (departure) =>
      fromNow(departure) <= SOON_HOURS * 3600 &&
      (departure.day === 0 || departure.seconds < NIGHT_ENDS_HOUR * 3600),
  );
  if (soon.length > 0) return soon.map((departure) => formatTime(departure.seconds));
  const { day, seconds } = next[0];
  const when =
    day === 0 ? w.today : day === 1 ? w.tomorrow : formatDate(addDays(now.date, day), false, w);
  return [`${when} ${formatTime(seconds)}`];
}

// How a route serves today: "every 7 min · today 4:52–22:22", or less when it does not run
// often enough for a gap to mean anything, or not at all today.
export function describeService(
  frequency: number | null,
  hours: string | null,
  w: Words = WORDS.en,
): string {
  const today = hours ? w.todayHours(hours) : w.noTripsToday;
  return frequency ? `${w.every(frequency)} · ${today}` : today;
}
