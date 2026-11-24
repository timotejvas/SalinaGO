// The stops of a journey for the strip: every stop you pass with the time you are there, in
// the colour of the leg you are on from it, the station where you change marked as such, the
// walks, and the live vehicles between the stops they passed last.
// logic/journey/stops.ts turns the legs into those stops, ui/Strip.tsx draws them.

import { useState } from "react";
import type { TransitData } from "../../logic/timetable/loadData";
import { formatTime } from "../../logic/timetable/clock";
import type { DoorWalk, JourneyLeg, WalkTo } from "../../logic/journey/plan";
import { journeyStops } from "../../logic/journey/stops";
import { alongStops, metersBetween } from "../../logic/live/track";
import { describeRunning, onTime } from "../../logic/journey/incoming";
import type { Vehicle } from "../../logic/live/vehicles";
import { legColors, lineColor } from "../../colors";
import Strip, { type StripRow } from "../Strip";
import { useWords } from "../language";

// What a click on a stop of the journey does: the panel moves the map to it.
export type JourneyStop = { lon: number; lat: number };

// ---------- settings ----------
const NEAR_M = 150; // further than this from your route, the vehicle is not where the strip says
const AT_STOP_M = 40; // this close to one of your stops, it stands at it (as incoming.ts says)
// ------------------------------

type Props = {
  data: TransitData;
  legs: JourneyLeg[];
  walkAfter?: WalkTo; // the walk to the end, when the last line does not go there
  walkFirst?: DoorWalk; // from the address you start at
  walkLast?: DoorWalk; // to the address you are going to
  vehicles: Vehicle[]; // all live vehicles
  mine: number | null; // the vehicle of the ride you are on: the only one the strip shows
  leg?: number; // which ride that is: the first, or after a change the next
  onPick: (stop: JourneyStop) => void;
};

export default function JourneyStrip({
  data,
  legs,
  walkAfter,
  walkFirst,
  walkLast,
  vehicles,
  mine,
  leg = 0,
  onPick,
}: Props) {
  const w = useWords();
  // the stop clicked last: it stands out, as the one the map has moved to
  const [picked, setPicked] = useState<string | null>(null);
  const along = journeyStops(data, legs, walkAfter, { first: walkFirst, last: walkLast });

  // Where your vehicle is on the line you are on: between which two of your stops, and how far.
  // Found from where it is rather than from the stop the stream says it passed last, which
  // the stream updates late - a vehicle that has left your stop would still be "at" the one
  // before. Before your stop, or off your part of the route, it is not in the strip.
  const first = legs[leg]?.ride;
  const yours = mine === null ? undefined : vehicles.find((vehicle) => vehicle.id === mine);
  let place: { index: number; share: number } | null = null;
  // or the stop it stands at, from yours on: then it is drawn on that stop's circle
  let here: number | null = null;
  if (first && yours) {
    const positions = data.variants[first.variant].positions;
    const off = first.at + first.stops;
    for (let k = first.at; k <= off; k++) {
      if (metersBetween([yours.lon, yours.lat], positions[k]) < AT_STOP_M) here = k;
    }
  }
  if (first && yours && here === null) {
    const positions = data.variants[first.variant].positions;
    const off = first.at + first.stops;
    const found = alongStops([yours.lon, yours.lat], positions.slice(first.at - 1, off + 1));
    // the first stretch is the one to your stop: it has not picked you up yet
    if (found && found.index > 0 && found.meters < NEAR_M) {
      place = { index: first.at - 1 + found.index, share: found.share };
    }
  }

  // the colour of each leg, as the map draws it, found again by the route a stop is on
  const colors = legColors(legs.map((leg) => lineColor(data, leg.kind, leg.line)));
  const colorOf = new Map(legs.map((leg, i) => [leg.ride.variant, colors[i]]));

  // the row of the stop it stands at: found by its place on the route - but the stop where you
  // change is in the strip once, with the route you go on with, so the vehicle that brought
  // you there stands on the row after the last one of its own route
  let hereRow = -1;
  if (here !== null && first) {
    hereRow = along.findIndex((stop) => stop.variant === first.variant && stop.index === here);
    if (hereRow < 0 && here === first.at + first.stops) {
      const lastOfLeg = along.map((stop) => stop.variant === first.variant).lastIndexOf(true);
      if (lastOfLeg >= 0 && lastOfLeg + 1 < along.length) hereRow = lastOfLeg + 1;
    }
  }

  // your vehicle as the strip draws it: its kind, in the colour of its line, how late it runs
  const riderOf = (vehicle: Vehicle, color: string) => ({
    key: vehicle.id,
    label: vehicle.line,
    color,
    kind: vehicle.kind,
    share: 0,
    note: describeRunning(vehicle, w),
    onTime: onTime(vehicle),
  });

  const rows: StripRow[] = along.map((stop, i) => {
    const color = colorOf.get(stop.variant) ?? lineColor(data, stop.kind, stop.line ?? "");
    // you ride on from here to the next stop of the strip: the same route, its next stop; not
    // where you get off and walk, nor after the end
    const after = along[i + 1];
    const riding = !stop.walk && after?.variant === stop.variant && after.index === stop.index + 1;
    return {
      key: `${stop.id}-${i}`,
      name: stop.name,
      color,
      // when you are there, and when your next line leaves if you are waiting for it
      time: stop.leaves ? `${time(stop.time)} → ${time(stop.leaves)}` : time(stop.time),
      badge: stop.line,
      toward: stop.line ? data.variants[stop.variant].headsign : undefined,
      end: i === 0 || i === along.length - 1,
      strong: stop.change,
      broken: Boolean(stop.walk),
      under: stop.walk ? <div className="strip-walk">{w.walkMinutes(stop.walk)}</div> : null,
      // your vehicle between this stop and the next one, as far along as it is
      riders:
        riding && yours && place && stop.variant === first?.variant && stop.index === place.index
          ? [{ ...riderOf(yours, color), share: place.share }]
          : [],
      // standing at this stop: drawn on its circle
      here:
        yours && first && i === hereRow
          ? riderOf(yours, colorOf.get(first.variant) ?? color)
          : undefined,
      picked: picked === `${stop.id}-${i}`,
      onPick: () => {
        setPicked((known) => (known === `${stop.id}-${i}` ? null : `${stop.id}-${i}`));
        onPick(stop);
      },
    };
  });

  return (
    <div className="ride-strip">
      <Strip rows={rows} />
    </div>
  );
}

const time = (at: { seconds: number }) => formatTime(at.seconds);
