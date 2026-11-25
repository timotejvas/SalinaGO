// Choosing a line in the panel: kind (tram / trolleybus / bus) -> line number. The chosen line
// itself is shown by ui/lines/LineOverview.tsx.
// Which lines are offered, and which of them run now, is decided in
// logic/timetable/lines.ts.

import { useMemo, type CSSProperties } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";
import type { TransitData } from "../../logic/timetable/loadData";
import type { Now } from "../../logic/timetable/clock";
import { lineNumbers, type Kind } from "../../logic/timetable/lines";
import type { LiveStatus, Vehicle } from "../../logic/live/vehicles";
import type { Space } from "../../map/camera";
import LineOverview from "./LineOverview";
import KindIcon from "../journey/KindIcon";
import { inkOn, lineColor } from "../../colors";
import { useWords } from "../language";
import "./LinePicker.css";

const KINDS: Kind[] = ["tram", "trolleybus", "bus"];

type Props = {
  map: MapLibreMap;
  data: TransitData;
  now: Now;
  kind: Kind; // the kind of the lines offered; App keeps it, so that a click on a vehicle can
  onKindChange: (kind: Kind) => void; //   open a line of another kind
  line: string | null; // the chosen line; App keeps it, because the live vehicles need it too
  onLineChange: (line: string | null) => void;
  vehicles: Vehicle[]; // the live vehicles of the chosen line
  liveStatus: LiveStatus; // whether the stream is answering
  space: () => Space; // the room the panel takes, so that the map keeps it free
  covered: boolean; // something is open over the line (a vehicle of it)
};

export default function LinePicker({
  map,
  data,
  now,
  kind,
  onKindChange,
  line,
  onLineChange,
  vehicles,
  liveStatus,
  space,
  covered,
}: Props) {
  const w = useWords();
  const lines = useMemo(() => lineNumbers(data, kind, now), [data, kind, now]);

  function pickKind(newKind: Kind) {
    onKindChange(newKind);
    onLineChange(null);
  }

  return (
    <>
      {/* the kinds and the lines to choose from; a line chosen takes the whole panel, and its ×
          brings them back */}
      {line ? null : (
        <>
          {/* the kind: the segmented control of the panel, a picture of each kind in it */}
          <div
            className="segmented kinds"
            role="group"
            data-on={KINDS.indexOf(kind)}
            style={{ "--count": KINDS.length, "--on": KINDS.indexOf(kind) } as CSSProperties}
          >
            {KINDS.map((k) => (
              <button key={k} aria-pressed={k === kind} onClick={() => pickKind(k)}>
                <KindIcon kind={k} />
                {w[k]}
              </button>
            ))}
          </div>

          {/* one badge per line, in its colour and shape as everywhere else in the app; faded
              when none of its trips runs or starts within an hour */}
          <div className="chips" key={kind}>
            {lines.map(([number, running], i) => {
              const color = lineColor(data, kind, number);
              return (
                <button
                  key={number}
                  className={`ride-line chip ${kind} ${running ? "" : "idle"}`}
                  style={
                    {
                      background: color,
                      "--line-ink": inkOn(color),
                      "--i": Math.min(i, 30),
                    } as CSSProperties
                  }
                  onClick={() => onLineChange(number)}
                >
                  {number}
                </button>
              );
            })}
          </div>
        </>
      )}

      {/* `key` starts the overview afresh for another line: direction and clicked stop reset */}
      {line && (
        <LineOverview
          key={line}
          map={map}
          data={data}
          line={line}
          kind={kind}
          now={now}
          vehicles={vehicles}
          liveStatus={liveStatus}
          space={space}
          covered={covered}
          onClose={() => onLineChange(null)}
        />
      )}
    </>
  );
}
