// A live vehicle clicked on the map, in the panel - as a stop is: its line and where it goes,
// whether it runs late, and the stops still ahead of it with when it is there, the vehicle
// moving down the strip as it drives. The route ahead grows out of it on the map
// (map/transit/routesLayer.ts); the × closes it, and the whole line opens in the lines mode.

import { useEffect, type CSSProperties } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";
import type { TransitData } from "../logic/timetable/loadData";
import { formatTime, type Now } from "../logic/timetable/clock";
import type { Kind } from "../logic/timetable/lines";
import type { Vehicle } from "../logic/live/vehicles";
import { vehicleTrip } from "../logic/live/trip";
import { legOf } from "../logic/journey/leg";
import type { Ride } from "../logic/journey/direct";
import { describeRunning, onTime } from "../logic/journey/incoming";
import { inkOn, lineColor } from "../colors";
import { focusOn, type Space } from "../map/camera";
import { followRouteAhead, showRouteAhead } from "../map/transit/routesLayer";
import { shownAt } from "../map/transit/vehiclesLayer";
import Strip, { type StripRow } from "./Strip";
import LiveWaves from "./LiveWaves";
import { useWords } from "./language";
import "./StationCard.css";

type Props = {
  map: MapLibreMap;
  data: TransitData;
  vehicle: Vehicle;
  now: Now;
  space: () => Space;
  onLine: (line: string, kind: Kind) => void;
  onClose: () => void;
};

export default function VehicleCard({ map, data, vehicle, now, space, onLine, onClose }: Props) {
  const w = useWords();
  const trip = vehicleTrip(data, vehicle);
  const color = lineColor(data, vehicle.kind, vehicle.line);

  // the map goes to it when it is opened
  useEffect(() => {
    focusOn(map, vehicle, space());
  }, [vehicle.id]);

  // the route ahead of it: it grows out of it when it is opened, and then, as the vehicle drives
  // on, the part behind it goes - cut right where its mark is drawn, frame by frame, never
  // grown again
  const ahead = trip
    ? legOf(data, { variant: trip.variant.id, at: trip.passed, stops: trip.ahead.length } as Ride)
        .path
    : null;
  useEffect(() => {
    if (!trip || !ahead) return;
    const route = { path: ahead, color };
    showRouteAhead(map, [vehicle.lon, vehicle.lat], route, trip.ahead);
    followRouteAhead(map, route, trip.ahead, () => shownAt(vehicle.id));
    return () => showRouteAhead(map, [vehicle.lon, vehicle.lat], null);
  }, [vehicle.id]);

  const rows: StripRow[] = trip
    ? [
        // the stop it passed last, and itself on its way from there
        {
          key: "passed",
          name: data.stations[trip.variant.stops[trip.passed]].name,
          color,
          end: true,
          riders: [
            {
              key: vehicle.id,
              label: vehicle.line,
              color,
              kind: vehicle.kind,
              share: trip.share,
              note: describeRunning(vehicle, w),
              onTime: onTime(vehicle),
            },
          ],
          onPick: () => focusOn(map, vehicle, space()),
        },
        ...trip.ahead.map((stop, i): StripRow => ({
          key: `${stop.id}-${i}`,
          name: stop.name,
          color,
          end: i === trip.ahead.length - 1,
          time: formatTime(now.seconds + Math.max(0, stop.seconds)),
          onPick: () => focusOn(map, stop, space()),
        })),
      ]
    : [];

  return (
    <div className="station-card">
      <div className="station-head">
        <button className="vehicle-line" onClick={() => onLine(vehicle.line, vehicle.kind)}>
          <span
            className={`ride-line ${vehicle.kind}`}
            style={{ background: color, "--line-ink": inkOn(color) } as CSSProperties}
          >
            {vehicle.line}
          </span>
          <strong className="station-name">
            → {trip?.variant.headsign ?? vehicle.destination}
          </strong>
        </button>
        <button className="station-close" aria-label={w.close} onClick={onClose}>
          ×
        </button>
      </div>
      <div className={`vehicle-now ${onTime(vehicle) ? "" : "late"}`}>
        <LiveWaves />
        {w.liveNow} · {describeRunning(vehicle, w)}
        <button className="vehicle-whole" onClick={() => onLine(vehicle.line, vehicle.kind)}>
          {w.wholeLine(vehicle.line)} ›
        </button>
      </div>
      <div className="scroll-list">
        <Strip rows={rows} />
      </div>
    </div>
  );
}
