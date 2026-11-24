// A station opened on the map, in the panel: its name and every line that stops there, with
// when it leaves next from there - the ones leaving within the hour first and bright, the others
// (tomorrow morning, only some days) dimmed after them. A line opens
// in the lines mode; the × closes the station. While it is open the map shows the routes through
// it (map/transit/stationsLayer.ts) and only the vehicles of its lines (App).

import type { CSSProperties } from "react";
import type { TransitData } from "../logic/timetable/loadData";
import type { MapStation } from "../logic/timetable/stations";
import type { Kind } from "../logic/timetable/lines";
import type { Now } from "../logic/timetable/clock";
import {
  describeDepartures,
  describeWhen,
  linesLeaving,
  secondsUntil,
} from "../logic/timetable/departures";
import { inkOn, lineColor } from "../colors";
import { capital } from "./LiveWaves";
import { useWords } from "./language";
import { PlaceMark } from "./journey/PlaceField";
import "./StationCard.css";

// ---------- settings ----------
const SOON_S = 3600; // a departure sooner says in how many minutes, a later one at what time
// ------------------------------

type Props = {
  data: TransitData;
  station: MapStation;
  now: Now;
  onLine: (line: string, kind: Kind) => void;
  onClose: () => void;
};

export default function StationCard({ data, station, now, onLine, onClose }: Props) {
  const w = useWords();
  const lines = linesLeaving(data, station.id, station.lines, now)
    .map(({ line, kind, next }) => {
      const running = secondsUntil(next, now) < SOON_S;
      const when = running
        ? capital(describeWhen(next, now, w))
        : capital(describeDepartures([next], now, w)[0]);
      const order = next.day * 86400 + next.seconds;
      return { line, kind, running, when, order, color: lineColor(data, kind, line) };
    })
    .sort((a, b) => Number(b.running) - Number(a.running) || a.order - b.order);

  return (
    <div className="station-card">
      <div className="station-head">
        {/* that it is a stop: the same mark the search gives a stop */}
        <span className="station-title">
          <PlaceMark place={station} />
          <strong className="station-name">{station.name}</strong>
        </span>
        <button className="station-close" aria-label={w.close} onClick={onClose}>
          ×
        </button>
      </div>
      <ul className="station-lines">
        {lines.map(({ line, kind, running, when, color }, i) => (
          <li key={`${kind}|${line}`} style={{ "--i": i } as CSSProperties}>
            <button
              className={`station-line ${running ? "" : "idle"}`}
              onClick={() => onLine(line, kind)}
            >
              <span
                className={`ride-line ${kind}`}
                style={{ background: color, "--line-ink": inkOn(color) } as CSSProperties}
              >
                {line}
              </span>
              <span className="station-when">{when}</span>
              <span className="station-more" aria-hidden="true">
                ›
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
