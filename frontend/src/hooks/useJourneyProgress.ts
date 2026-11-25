// Where you are on the way you picked, as the live vehicles move: which of its rides you are
// on or waiting for, the vehicle of that ride (yours), where it is - coming for you, at your
// stop, on the way - and, nearing the stop where you change, the vehicle coming for the next
// ride. The rules are logic/journey/progress.ts and incoming.ts; this keeps track of them.
//
// Your vehicle is found while it is coming for you and remembered by its number from then on:
// once it has left your stop nothing else could tell it from the one behind it. Once its ride
// is over - you are at the stop where you change - the next ride's vehicle is the one.

import { useEffect, useState } from "react";
import type { TransitData } from "../logic/timetable/loadData";
import type { Now } from "../logic/timetable/clock";
import { secondsUntil } from "../logic/timetable/departures";
import type { Vehicle } from "../logic/live/vehicles";
import type { Ride } from "../logic/journey/direct";
import { incomingSoon, rideNow } from "../logic/journey/incoming";
import { nearingChange, rideOver } from "../logic/journey/progress";

// ---------- settings ----------
// a ride's vehicle is looked for until this long after the timetable's time: one running late
// is still coming, and incomingSoon tells it from the trip after by its delay
const LATE_S = 5 * 60;
// ------------------------------

type Ask = {
  data: TransitData;
  now: Now; // the real clock
  vehicles: Vehicle[]; // all live vehicles
  way: string | null; // the key of the way picked, null for none
  legs: { ride: Ride }[]; // its rides
  live: boolean; // you are leaving now: a live vehicle can be yours
};

type Kept = { way: string | null; mine: number | null; leg: number };

export function useJourneyProgress({ data, now, vehicles, way, legs, live }: Ask) {
  // what is remembered of the way picked - from nothing again whenever another one is
  const [kept, setKept] = useState<Kept>({ way, mine: null, leg: 0 });
  if (kept.way !== way) setKept({ way, mine: null, leg: 0 });
  const { mine, leg } = kept.way === way ? kept : { mine: null, leg: 0 };
  const keep = (change: Partial<Kept>) => setKept((was) => ({ ...was, ...change }));

  // the ride you are on or waiting for, and the vehicle coming for it now
  const current = legs[leg]?.ride;
  const waiting = current && live && secondsUntil(current.departure, now) > -LATE_S;
  const coming = waiting ? incomingSoon(data, vehicles, current, now) : null;
  const comingId = coming?.vehicle.id ?? null;
  // once one is found it stays yours: the next one coming to your stop - after yours has left
  // it, or while it waits there - is never taken for it
  useEffect(() => {
    if (comingId !== null && mine === null) keep({ mine: comingId });
  }, [comingId, mine]);
  // - unless it drops out of the live data while you still wait for it (its unit goes off, or
  // it was taken for yours wrongly): the one coming now is yours instead
  const yours = mine === null ? undefined : vehicles.find((vehicle) => vehicle.id === mine);
  useEffect(() => {
    if (mine !== null && !yours && comingId !== null) keep({ mine: comingId });
  }, [mine, yours, comingId]);

  // the ride is over, you are where you change: the next ride is the one now (for every leg
  // again: two rides may both be over already, when the way is opened late)
  const over =
    current !== undefined && leg < legs.length - 1 && live && rideOver(data, current, yours, now);
  useEffect(() => {
    if (over) keep({ leg: leg + 1, mine: null });
  }, [over, leg]);

  // the last ride is over: you are there - or off the last vehicle, with a walk still to go
  const arrived =
    current !== undefined && leg === legs.length - 1 && live && rideOver(data, current, yours, now);

  // where your vehicle is
  const where = live && current && yours ? rideNow(data, current, yours, now) : null;
  const state = where?.state ?? "coming";
  // nearing the stop where you change: the vehicle coming for the next ride, a few stops off
  const nearing =
    current !== undefined &&
    leg < legs.length - 1 &&
    nearingChange(data, current, yours, state, now);
  const next = nearing ? incomingSoon(data, vehicles, legs[leg + 1].ride, now) : null;

  return {
    leg, // which ride
    mine, // the number of its vehicle, once known
    yours, // that vehicle
    where, // where it is, when it is live: coming (in how long), at your stop, gone from it
    // you are on your way: on a vehicle that picked you up, or after a change
    onWay: leg > 0 || state !== "coming",
    nearing, // nearing the stop where you change
    arrived, // the last ride is over
    next, // the vehicle coming for the next ride, then, when one is
  };
}
