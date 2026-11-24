// One way there, as a card of the list of what was found: from when to when and how long, how
// you go - each line with a picture of its kind, the walks between them - and when it leaves
// from where, live when its vehicle is known. Picked, it opens its stops under it.
// logic/journey/plan.ts finds them; the styles are in JourneyWay.css.

import { Fragment, type CSSProperties } from "react";
import type { TransitData } from "../../logic/timetable/loadData";
import { formatTime, type Now } from "../../logic/timetable/clock";
import { describeWhen, secondsUntil } from "../../logic/timetable/departures";
import type { Journey, JourneyLeg } from "../../logic/journey/plan";
import {
  describeComing,
  describeRunning,
  incomingSoon,
  onTime,
  rideNow,
} from "../../logic/journey/incoming";
import type { Vehicle } from "../../logic/live/vehicles";
import { inkOn, legColors, lineColor } from "../../colors";
import JourneyStrip, { type JourneyStop } from "./JourneyStrip";
import KindIcon from "./KindIcon";
import LiveWaves, { capital } from "../LiveWaves";
import { useWords } from "../language";
import "./JourneyWay.css";

// ---------- settings ----------
const SOON_S = 3600; // a ride leaving sooner says in how many minutes, a later one at what time
// ------------------------------

type Props = {
  data: TransitData;
  now: Now;
  way: Journey;
  vehicles: Vehicle[]; // all live vehicles
  picked: boolean; // its stops are open
  mine: number | null; // the vehicle of its first line, once known (only for the picked one)
  leg?: number; // the ride you are on or waiting for, which mine is the vehicle of (JourneyStrip)
  live: boolean; // you are leaving now, so a live vehicle can be yours
  onPick: () => void;
  onPickStop: (stop: JourneyStop) => void;
  // you are on it: the panel's title says where its vehicle is, so the card does not again
  riding?: boolean;
};

export default function JourneyWay({
  data,
  now,
  way,
  vehicles,
  picked,
  mine,
  live,
  onPick,
  onPickStop,
  riding = false,
  leg = 0,
}: Props) {
  const w = useWords();
  // the name of the station a leg takes you on board at, and the one it lets you off at
  const boardAt = (leg: JourneyLeg) => stationOf(data, leg, 0);
  const leaveAt = (leg: JourneyLeg) => stationOf(data, leg, leg.ride.stops);

  // when the first line leaves: "In 7 min" while it is soon, the time itself when it is not -
  // the day is the one you asked for, and the card says the times already
  const leavesWhen = (departure: Journey["departure"]) =>
    secondsUntil(departure, now) > SOON_S
      ? w.departsAt(formatTime(departure.seconds))
      : capital(describeWhen(departure, now, w));

  // one line the whole way, with no change
  const single = way.legs.length === 1;

  // the vehicle coming for you at the start, or the one you are on, once it is known: the card
  // says where it is and how late it runs. Known, it is the one - not whichever is coming to
  // the stop now.
  const yours = mine === null ? undefined : vehicles.find((vehicle) => vehicle.id === mine);
  const ride = way.legs[0].ride;
  const leftByTimetable = secondsUntil(ride.departure, now) < -30;
  const vehicle = !live
    ? undefined
    : (yours ?? (leftByTimetable ? undefined : incomingSoon(data, vehicles, ride, now)?.vehicle));
  const where = vehicle ? rideNow(data, ride, vehicle, now) : null;

  // what the card says of it: where the live vehicle is - coming in so long, at the stop, on the
  // way - or, without one, when the timetable says it leaves, and that it has
  const status = where
    ? where.state === "coming"
      ? capital(describeComing(where.seconds, w))
      : where.state === "atStop"
        ? w.atStop
        : w.onTheWay
    : leftByTimetable
      ? w.departed
      : leavesWhen(ride.departure);
  const showStop = !where || where.state !== "gone";

  return (
    // the card is the way and, once picked, its stops too: one block, the stops opening in it
    <li className={`trip-card ${picked ? "on" : ""}`}>
      <button className="trip" aria-pressed={picked} onClick={onPick}>
        {/* from when to when, and how long: what you compare the ways by */}
        <div className="trip-head">
          <strong className="trip-times">
            {formatTime(way.departure.seconds)} – {formatTime(way.arrival.seconds)}
          </strong>
          {/* how long, with a stopwatch beside it: it says it is the length of the journey */}
          <strong className="trip-long">
            <Stopwatch />
            {way.minutes} min
          </strong>
        </div>

        {/* how you go: each line, and the walks, one after another */}
        <div className="trip-chain">
          {way.walkFirst ? (
            <span className="trip-walk" title={w.walkTo(boardAt(way.legs[0]))}>
              <KindIcon kind="walk" />
              {way.walkFirst.minutes}
            </span>
          ) : null}
          {way.legs.map((leg, step) => (
            <Fragment key={leg.ride.variant}>
              {step > 0 || way.walkFirst ? (
                <span className="trip-then" aria-hidden="true">
                  ›
                </span>
              ) : null}
              {leg.walk ? (
                <>
                  <span className="trip-walk" title={w.walkTo(boardAt(leg))}>
                    <KindIcon kind="walk" />
                    {leg.walk.minutes}
                  </span>
                  <span className="trip-then" aria-hidden="true">
                    ›
                  </span>
                </>
              ) : null}
              <span
                className={`trip-ride ${single ? "first" : ""}`}
                title={`${w.towards(data.variants[leg.ride.variant].headsign)} · ${w.rideTo(leaveAt(leg))}`}
              >
                <KindIcon kind={leg.kind} />
                <span
                  className={`ride-line ${leg.kind}`}
                  style={
                    {
                      background: colorsOf(data, way)[step],
                      "--line-ink": inkOn(colorsOf(data, way)[step]),
                    } as CSSProperties
                  }
                >
                  {leg.line}
                </span>
                {/* where it goes, beside its number, when it is the only line: with a change
                    there is no room for it there, and it is said under the chain instead */}
                {single ? (
                  <span className="trip-toward">→ {data.variants[leg.ride.variant].headsign}</span>
                ) : null}
              </span>
            </Fragment>
          ))}
          {way.walkLast ? (
            <>
              <span className="trip-then" aria-hidden="true">
                ›
              </span>
              <span className="trip-walk" title={w.walkTo(way.walkLast.name)}>
                <KindIcon kind="walk" />
                {way.walkLast.minutes}
              </span>
            </>
          ) : null}
          {way.walkAfter ? (
            <>
              <span className="trip-then" aria-hidden="true">
                ›
              </span>
              <span className="trip-walk" title={w.walkTo(data.stations[way.walkAfter.to].name)}>
                <KindIcon kind="walk" />
                {way.walkAfter.minutes}
              </span>
            </>
          ) : null}
        </div>

        {/* when it leaves, as big as the rest: the minutes - live and green when its vehicle
            is known, orange when it runs late, and then they already count the delay - and how
            late, as a small tag beside them, said once and not added to anything. Under it, from
            where. Not on the way: the title over it says where its vehicle is. */}
        {riding ? null : (
          <div className="trip-go">
            <span
              className={`trip-when ${
                vehicle ? (onTime(vehicle) ? "live" : "late") : leftByTimetable ? "gone" : ""
              }`}
            >
              {vehicle ? <LiveWaves /> : null}
              {status}
            </span>
            {vehicle && !onTime(vehicle) ? (
              <span className="trip-late">{describeRunning(vehicle, w)}</span>
            ) : null}
          </div>
        )}
        {showStop && !riding ? (
          <div className="trip-at">{w.fromStop(boardAt(way.legs[0]))}</div>
        ) : null}
      </button>
      {picked ? (
        <JourneyStrip
          data={data}
          legs={way.legs}
          walkAfter={way.walkAfter}
          walkFirst={way.walkFirst}
          walkLast={way.walkLast}
          vehicles={vehicles}
          mine={mine}
          leg={leg}
          onPick={onPickStop}
        />
      ) : null}
    </li>
  );
}

// A stopwatch: the length of a journey.
function Stopwatch() {
  return (
    <svg className="stopwatch" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <circle cx="8" cy="9" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M8 9V6.2M6.3 1.8h3.4M12.2 4.4l1-1"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

// The colour of each leg of a way, the same ones the map draws that way with.
const colorsOf = (data: TransitData, way: Journey) =>
  legColors(way.legs.map((leg) => lineColor(data, leg.kind, leg.line)));

// The name of the station a leg stops at, this many stops after you get on.
function stationOf(data: TransitData, leg: JourneyLeg, step: number): string {
  const stops = data.variants[leg.ride.variant].stops;
  return data.stations[stops[leg.ride.at + step]].name;
}
