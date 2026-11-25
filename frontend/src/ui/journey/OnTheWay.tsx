// On the way: the way you picked, alone, once its vehicle has picked you up - where it is, the
// stops still to come, where you change - until you close it (×) or are there. The title says
// where your vehicle is: at your stop, on the way, or at a change which line you change to and
// when it comes; nearing a change, a line under it says how far the next one is.
// Where you are on the way is found by hooks/useJourneyProgress.ts.

import type { TransitData } from "../../logic/timetable/loadData";
import { formatTime, type Now } from "../../logic/timetable/clock";
import type { Vehicle } from "../../logic/live/vehicles";
import type { Journey } from "../../logic/journey/plan";
import {
  describeComing,
  describeRunning,
  onTime,
  type RideNow,
} from "../../logic/journey/incoming";
import type { Incoming } from "../../logic/journey/incoming";
import { useWords } from "../language";
import LiveWaves from "../LiveWaves";
import JourneyWay from "./JourneyWay";
import type { JourneyStop } from "./JourneyStrip";
import "./OnTheWay.css";

type Props = {
  data: TransitData;
  now: Now;
  way: Journey;
  vehicles: Vehicle[]; // all live vehicles
  leg: number; // the ride you are on or waiting for
  mine: number | null; // the number of its vehicle
  yours: Vehicle | undefined; // that vehicle, when it is live
  where: RideNow | null; // where it is
  next: Incoming | null; // nearing a change: the vehicle coming for the next ride
  nearing: boolean; // nearing the stop where you change
  arrived: boolean; // the last ride is over: you are there, or have only the walk to the end left
  hidden: boolean; // the journey is kept under the lines, out of sight
  onClose: () => void;
  onPickStop: (stop: JourneyStop) => void;
};

export default function OnTheWay({
  data,
  now,
  way,
  vehicles,
  leg,
  mine,
  yours,
  where,
  next,
  nearing,
  arrived,
  hidden,
  onClose,
  onPickStop,
}: Props) {
  const w = useWords();
  const ride = way.legs[leg];
  const late = !arrived && yours !== undefined && !onTime(yours);
  const walkLeft = way.walkLast?.minutes ?? way.walkAfter?.minutes;

  // after a change, still waiting: which line you change to, and when it comes - live, or as
  // the timetable has it; otherwise where your vehicle is
  const state = where?.state ?? "coming";
  const title = arrived
    ? walkLeft
      ? w.walkRest(walkLeft)
      : w.arrived
    : leg > 0 && state === "coming"
      ? `${w.changeTo(ride.line)} · ${
          where?.state === "coming"
            ? describeComing(where.seconds, w)
            : formatTime(ride.ride.departure.seconds)
        }`
      : state === "atStop"
        ? w.atStop
        : w.onTheWay;
  const after = nearing && !arrived ? way.legs[leg + 1] : undefined;

  return (
    <div className="journey riding" hidden={hidden}>
      <div className="ride-head">
        <strong className={`ride-title ${late ? "late" : ""} ${arrived ? "there" : ""}`}>
          {arrived ? (
            <svg className="ride-there" viewBox="0 0 16 16" aria-hidden="true">
              <circle cx="8" cy="8" r="7" />
              <path d="M4.6 8.2 L7 10.5 L11.4 5.8" />
            </svg>
          ) : yours ? (
            <LiveWaves />
          ) : null}
          {title}
          {late ? <span className="trip-late">{describeRunning(yours, w)}</span> : null}
        </strong>
        <button className="station-close" aria-label={w.close} onClick={onClose}>
          ×
        </button>
      </div>
      {/* nearing the change: the line you change to and how far its vehicle is */}
      {after ? (
        <div className={`ride-next ${next ? "live" : ""}`}>
          {next ? <LiveWaves /> : null}
          {w.changeTo(after.line)} ·{" "}
          {next?.seconds !== undefined
            ? describeComing(next.seconds, w)
            : formatTime(after.ride.departure.seconds)}
        </div>
      ) : null}
      <ul className="rides scroll-list">
        <JourneyWay
          data={data}
          now={now}
          way={way}
          vehicles={vehicles}
          picked
          mine={mine}
          leg={leg}
          onPick={() => {}}
          live
          onPickStop={onPickStop}
          riding
        />
      </ul>
    </div>
  );
}
