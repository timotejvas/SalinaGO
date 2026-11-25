// The chosen line in the panel, drawn as a journey card is: its number and where it runs
// between, whether and how often it runs now, the direction, its next departures - from the
// first stop, or from the stop clicked - and the stops of the direction with the live vehicles
// between them (ui/Strip.tsx).
// What it puts on the map is hooks/useLineOnMap.ts.
// What it shows is decided in logic/timetable/, the vehicles in logic/live/vehicles.ts.

import { Fragment, useMemo, useState, type CSSProperties } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";
import type { TransitData } from "../../logic/timetable/loadData";
import type { Now } from "../../logic/timetable/clock";
import { destinationOf, directionsOf, otherEnds, type Kind } from "../../logic/timetable/lines";
import { stationsOf, type RouteStop } from "../../logic/timetable/stations";
import {
  describeDepartures,
  describeService,
  describeWhen,
  frequencyNow,
  isRunning,
  nextAtStation,
  secondsUntil,
  todayHours,
} from "../../logic/timetable/departures";
import {
  describeLive,
  vehiclesAlong,
  type LiveStatus,
  type Vehicle,
} from "../../logic/live/vehicles";
import { inkOn, lineColor } from "../../colors";
import LiveWaves, { capital } from "../LiveWaves";
import { shareBetween } from "../../logic/live/track";
import { describeRunning, onTime } from "../../logic/journey/incoming";
import { focusOn, type Space } from "../../map/camera";
import { useLineOnMap } from "../../hooks/useLineOnMap";
import Strip, { type StripRow } from "../Strip";
import { useWords } from "../language";
import "./LineOverview.css";

// ---------- settings ----------
const NEXT_TRIPS = 3; // how many of the next trips are listed
const SOON_S = 3600; // the first of them says in how many minutes when it leaves sooner
// ------------------------------

type Props = {
  map: MapLibreMap;
  data: TransitData;
  line: string;
  kind: Kind;
  now: Now;
  vehicles: Vehicle[]; // the live vehicles of this line
  liveStatus: LiveStatus;
  space: () => Space; // the room the panel takes, so that the map keeps it free
  onClose: () => void; // back to all the lines
  covered: boolean; // a vehicle is open over the line: its route steps aside on the map
};

export default function LineOverview({
  map,
  data,
  onClose,
  line,
  kind,
  now,
  vehicles,
  liveStatus,
  space,
  covered,
}: Props) {
  const w = useWords();
  const [directionId, setDirectionId] = useState<string | null>(null);
  const [pickedStop, setPickedStop] = useState<string | null>(null); // clicked in the strip

  const directions = useMemo(() => directionsOf(data, kind, line), [data, kind, line]);
  const direction = directions.find((d) => d.id === directionId) ?? directions[0] ?? null;
  const route = direction?.main ?? null; // the route shown on the map
  const stops = useMemo(() => (route ? stationsOf(data, route) : []), [data, route]);
  // all routes of the direction: "how often", "today" and the departures count all their trips
  const routes = useMemo(
    () => (direction ? [direction.main, ...direction.others] : []),
    [direction],
  );

  const shownId = route?.id ?? null;
  const picked = stops.find((stop) => stop.id === pickedStop) ?? null;
  useLineOnMap({ map, data, kind, line, directions, shownId, space, picked, covered });

  if (!direction || !route) return null;

  // the line runs when any of its trips runs, in any direction and on any route
  const running = directions.some((d) =>
    [d.main, ...d.others].some((variant) => isRunning(data, variant, now)),
  );

  // the departures shown are from the first stop of the direction, or from the stop clicked in
  // the strip; a second click on it goes back to the first one. The map moves to the stop.
  function pickStop(stop: RouteStop) {
    setPickedStop(stop.id === pickedStop ? null : stop.id);
    focusOn(map, stop, space());
  }
  // Not clicked, the first stop of the route that trips really leave from: the route drawn is
  // the one with the most trips in the whole timetable, and its first stop may be served only
  // on some days - "none this week" there says nothing of when the line goes.
  const from =
    stops.find((stop) => stop.id === pickedStop) ??
    stops.find((stop) => nextAtStation(data, routes, stop.id, now, 1).length > 0) ??
    stops[0];

  // the stops of the route as the strip shows them, the live vehicles between them, and the one
  // the departures are from in bold
  const along = vehiclesAlong(vehicles, stops);
  const rows: StripRow[] = stops.map((stop, i) => {
    const open = stop.id === pickedStop;
    return {
      key: stop.id,
      name: stop.name,
      color: lineColor(data, route.kind, route.line),
      end: i === 0 || i === stops.length - 1,
      picked: open,
      // each vehicle rides down the line towards the next stop, as far as it has got
      riders:
        i === stops.length - 1
          ? []
          : along[i].map((vehicle) => ({
              key: vehicle.id,
              label: vehicle.line,
              color: lineColor(data, route.kind, route.line),
              kind: vehicle.kind,
              share: shareBetween(
                [vehicle.lon, vehicle.lat],
                [stop.lon, stop.lat],
                [stops[i + 1].lon, stops[i + 1].lat],
              ),
              note: describeRunning(vehicle, w),
              onTime: onTime(vehicle),
            })),
      onPick: () => pickStop(stop),
    };
  });

  // the next trips from that stop, counted for all routes of the direction: the first one
  // "In 4 min" while it is soon, the ones after it at their times
  const next = from ? nextAtStation(data, routes, from.id, now, NEXT_TRIPS) : [];
  const times = describeDepartures(next, now, w);
  const soon = next.length > 0 && secondsUntil(next[0], now) < SOON_S;
  const [first, ...later] = soon ? [describeWhen(next[0], now, w), ...times.slice(1)] : times;
  const color = lineColor(data, kind, line);
  const live = describeLive(liveStatus, vehicles.length, w);
  const service = describeService(
    frequencyNow(data, routes, now),
    todayHours(data, routes, now),
    w,
  );

  return (
    <div className="overview">
      {/* the line as the journey cards show it, and where it runs between */}
      <div className="overview-head">
        <span
          className={`ride-line overview-line ${kind}`}
          style={{ background: color, "--line-ink": inkOn(color) } as CSSProperties}
        >
          {line}
        </span>
        <strong className="overview-ends">
          {data.stations[directions[0].main.stops[0]].name} ⇄{" "}
          {destinationOf(data, directions[0].main)}
        </strong>
        <button className="station-close" aria-label={w.close} onClick={onClose}>
          ×
        </button>
      </div>

      {/* whether it runs now - green, with the live sign, while it does - how many of it are
          out, how often and from when to when today */}
      <div className="overview-now">
        <span className={running ? "running" : "idle"}>
          {running ? <LiveWaves /> : null}
          {running ? w.running : w.notRunning}
        </span>
        {live ? <span className="overview-part">{live}</span> : null}
      </div>
      {/* how often and from when to when today: a line of its own, so that nothing breaks in
          the middle of it */}
      <div className="overview-service">{service}</div>

      {/* the direction: changes the route on the map, the strip and the departures */}
      {directions.length > 1 ? (
        <div
          className="segmented directions"
          role="group"
          data-on={directions.indexOf(direction)}
          style={
            { "--count": directions.length, "--on": directions.indexOf(direction) } as CSSProperties
          }
        >
          {directions.map((d) => (
            <button
              key={d.id}
              aria-pressed={d === direction}
              onClick={() => {
                setDirectionId(d.id);
                setPickedStop(null);
              }}
            >
              → {d.label}
            </button>
          ))}
        </div>
      ) : null}

      {/* when it leaves, and from where: as big as a journey card says it */}
      {from ? (
        // a new stop: what the card says slides in afresh (the key starts it again)
        <div className="departures" key={from.id}>
          <span className="departures-from">{w.departuresFrom(from.name)}</span>
          <div className="departures-times">
            <strong className="departures-first">{capital(first)}</strong>
            {later.map((time) => (
              <span key={time} className="departures-later">
                {time}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {/* the stops scroll, the line and its departures above them stay in sight */}
      <div className="scroll-list">
        <Strip rows={rows} />
        <OtherEnds ends={otherEnds(data, direction)} />
      </div>
    </div>
  );
}

// Where some trips start or end other than at the ends of the line, a row for each:
//   Some trips also
//   Start   Komenského náměstí
//   End     Vozovna Medlánky, ARENA BRNO
function OtherEnds({ ends }: { ends: { starts: string[]; ends: string[] } }) {
  const w = useWords();
  const rows = [
    { label: w.startAt, stops: ends.starts },
    { label: w.endAt, stops: ends.ends },
  ].filter((row) => row.stops.length > 0);
  if (rows.length === 0) return null;
  return (
    <div className="other-ends">
      <div className="other-ends-title">{w.someTrips}</div>
      <dl>
        {rows.map((row) => (
          <Fragment key={row.label}>
            <dt>{row.label}</dt>
            <dd>{row.stops.join(", ")}</dd>
          </Fragment>
        ))}
      </dl>
    </div>
  );
}
