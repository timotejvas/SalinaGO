// The days of the timetable: on which date which services run.
//
// A "service" is a pattern of days, e.g. "Monday to Friday". Every trip belongs to
// one service. calendar.txt describes the regular pattern, calendar_dates.txt the
// single days that differ from it (holidays and the like).

import { readTable } from "./read.mjs";

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

// exception_type values of calendar_dates.txt
const SERVICE_ADDED = "1";
const SERVICE_REMOVED = "2";

// Dates are handled in UTC, so that the time zone of the computer cannot shift a day.
//   formatDate: Date -> "20261107"      parseDate: "20261107" -> Date
const pad = (n) => String(n).padStart(2, "0");
const formatDate = (date) =>
  `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}`;
const parseDate = (text) =>
  new Date(Date.UTC(+text.slice(0, 4), +text.slice(4, 6) - 1, +text.slice(6, 8)));

// Finds out which services run on each day of the timetable.
// Returns:
//   validFrom, validTo  first and last day of the timetable ("20261106")
//   active              date -> ids of the services that run that day,
//                       e.g. { "20261107": ["1", "5"] }
export function buildCalendar() {
  const calendar = readTable("calendar.txt");
  const exceptions = readTable("calendar_dates.txt");

  const validFrom = calendar.map((c) => c.start_date).reduce((a, b) => (b < a ? b : a));
  const validTo = calendar.map((c) => c.end_date).reduce((a, b) => (b > a ? b : a));

  const active = {};
  for (
    let day = parseDate(validFrom);
    formatDate(day) <= validTo;
    day.setUTCDate(day.getUTCDate() + 1)
  ) {
    const date = formatDate(day);

    // regular services: valid in this period and on this weekday
    const services = new Set(
      calendar
        .filter(
          (c) => c.start_date <= date && date <= c.end_date && c[WEEKDAYS[day.getUTCDay()]] === "1",
        )
        .map((c) => c.service_id),
    );

    // single-day exceptions
    for (const exception of exceptions) {
      if (exception.date !== date) continue;
      if (exception.exception_type === SERVICE_ADDED) services.add(exception.service_id);
      if (exception.exception_type === SERVICE_REMOVED) services.delete(exception.service_id);
    }

    active[date] = [...services];
  }

  return { validFrom, validTo, active };
}
