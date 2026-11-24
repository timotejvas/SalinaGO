// Walking from one station to another, as the official timetable gives it (transfers.txt).
//
// GTFS writes a transfer between two platforms. Almost all of them are platforms of the same
// station - Česká tram 1 to Česká tram 4 - which we do not need: a station here is the whole
// stop, so changing there is changing in place and the planner gives it a fixed time. What is
// left is walking between two different stations, such as Česká to Komenského náměstí: about
// a hundred pairs in Brno, which the planner can offer as a leg on foot.

import { readTable } from "./read.mjs";

// Returns: station id -> [[other station id, seconds], ...], the shortest time for each pair.
export function buildTransfers(stationOfPlatform, stations) {
  const shortest = new Map(); // "from>to" -> seconds
  for (const row of readTable("transfers.txt")) {
    const from = stationOfPlatform.get(row.from_stop_id);
    const to = stationOfPlatform.get(row.to_stop_id);
    if (!from || !to || from === to) continue; // the same station: not a walk
    if (!stations[from] || !stations[to]) continue; // outside Brno, or nothing stops there
    const seconds = Number(row.min_transfer_time);
    if (!Number.isFinite(seconds) || seconds <= 0) continue;
    const pair = `${from}>${to}`;
    shortest.set(pair, Math.min(shortest.get(pair) ?? Infinity, seconds));
  }

  const transfers = {};
  for (const [pair, seconds] of shortest) {
    const [from, to] = pair.split(">");
    (transfers[from] ??= []).push([to, seconds]);
  }
  return transfers;
}
