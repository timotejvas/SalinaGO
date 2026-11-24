// The time in Brno, the way the timetable counts it, and dates and times in words.
// No React and no map here, only data in, data out.

import { WORDS, type Words } from "../words.ts";

// ---------- settings ----------
export const TIME_ZONE = "Europe/Prague"; // the timetable is in local time of Brno
// ------------------------------

// A service day is 24 hours, but its trips can leave after midnight ("25:10"), so a time in
// the timetable can be larger than this.
export const DAY = 86400;

// A moment in Brno, counted the way the timetable counts it.
export type Now = {
  date: string; // today in Brno, "20261107"
  yesterday: string; // trips after midnight belong to the service day before
  seconds: number; // seconds after midnight in Brno
};

// Current date and time in Brno, whatever the time zone of the computer is.
export function brnoNow(ms = Date.now()): Now {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(ms)
      .map((p) => [p.type, p.value]),
  );
  const today = `${parts.year}${parts.month}${parts.day}`;
  return {
    date: today,
    yesterday: addDays(today, -1),
    seconds: +parts.hour * 3600 + +parts.minute * 60 + +parts.second,
  };
}

// A moment somebody chose, counted the way the timetable counts it. The planner is given
// this instead of now when you say you are leaving later.
export function momentAt(ymd: string, seconds: number): Now {
  return { date: ymd, yesterday: addDays(ymd, -1), seconds };
}

// A time as people type it, in seconds after midnight: "22:45", "22.45", "2245", "9:05",
// "905" or "9" (= 9:00). Undefined when it is not a time of day.
export function readClock(text: string): number | undefined {
  const typed = text.trim().match(/^(\d{1,2})(?:[:.,\s]?(\d{2}))?$/);
  if (!typed) return undefined;
  const [hour, minute] = [+typed[1], typed[2] === undefined ? 0 : +typed[2]];
  if (hour > 23 || minute > 59) return undefined;
  return hour * 3600 + minute * 60;
}

// Some quarters of an hour later or earlier, landing on a whole quarter: 22:43 + 1 -> 22:45,
// 22:43 - 1 -> 22:30. Past midnight it is the next day, before it the day before.
export function stepQuarter(moment: Now, quarters: number): Now {
  const QUARTER = 900;
  const seconds =
    quarters > 0
      ? (Math.floor(moment.seconds / QUARTER) + quarters) * QUARTER
      : (Math.ceil(moment.seconds / QUARTER) + quarters) * QUARTER;
  const days = Math.floor(seconds / DAY);
  return momentAt(addDays(moment.date, days), seconds - days * DAY);
}

// The days the timetable can plan for, from today on, at most `count` of them.
export function daysAhead(today: string, validFrom: string, validTo: string, count = 14) {
  const days: string[] = [];
  for (let day = today > validFrom ? today : validFrom; day <= validTo; day = addDays(day, 1)) {
    if (days.length === count) break;
    days.push(day);
  }
  return days;
}

// A day as people say it: "Today", "Tomorrow", or "Tue 24 Nov".
export function dayName(ymd: string, today: string, w: Words = WORDS.en): string {
  if (ymd === today) return w.Today;
  if (ymd === addDays(today, 1)) return w.Tomorrow;
  const weekday = new Date(Date.UTC(+ymd.slice(0, 4), +ymd.slice(4, 6) - 1, +ymd.slice(6, 8)));
  return `${w.weekdays[weekday.getUTCDay()]} ${formatDate(ymd, false, w)}`;
}

// A timetable date some days later (or earlier): addDays("20261231", 1) -> "20270101".
export function addDays(ymd: string, days: number): string {
  const date = new Date(Date.UTC(+ymd.slice(0, 4), +ymd.slice(4, 6) - 1, +ymd.slice(6, 8) + days));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}`;
}

// How many days one timetable date is after another: daysBetween("20261231", "20270102") -> 2.
export function daysBetween(from: string, to: string): number {
  const utc = (ymd: string) => Date.UTC(+ymd.slice(0, 4), +ymd.slice(4, 6) - 1, +ymd.slice(6, 8));
  return Math.round((utc(to) - utc(from)) / (DAY * 1000));
}

// Formats a timetable date for people: "20261213" -> "13 Dec 2026", or "13 Dec" without the
// year (in Czech "13. 12. 2026").
export function formatDate(ymd: string, withYear = true, w: Words = WORDS.en): string {
  const [year, month, day] = [+ymd.slice(0, 4), +ymd.slice(4, 6), +ymd.slice(6, 8)];
  return w.date(day, month, withYear ? year : null, w.months);
}

// Formats seconds after midnight for people: 17580 -> "4:53". Times after midnight of the
// service day (above 24:00) are shown as the clock shows them: 88200 -> "0:30".
export function formatTime(seconds: number): string {
  const minutes = Math.floor((seconds % DAY) / 60);
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`;
}
