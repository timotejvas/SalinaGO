// A strip of stops, like the board inside a tram: a coloured line through a circle for every
// stop, a name beside it, and room under each of them. It is told what every row holds and
// nothing else - a line, a journey, anything that is a sequence of stops - so what goes in a
// row is the business of whoever builds it.
// The styles are in Strip.css.

import { Fragment, type CSSProperties, type ReactNode } from "react";
import { inkOn } from "../colors";
import KindIcon from "./journey/KindIcon";
import type { Kind } from "../logic/timetable/lines";
import "./Strip.css";

// A live vehicle on the line between this stop and the next one, as far along as it is there
// (`share`, 0 - 1): it glides down the strip as it drives. It gets a row of its own between the
// two stops, so that there is room to see it move, and a word beside it.
export type StripRider = {
  key: string | number;
  label: string; // the line, for readers of the page: the strip is the line already
  color: string;
  kind: Kind; // tram, trolleybus, bus: the picture in it
  share: number;
  note?: string; // beside it: "on time", "2 min late"
  onTime?: boolean; // the note in green; otherwise in orange
};

// One stop of the strip.
export type StripRow = {
  key: string;
  name: string;
  color: string; // of the line that takes you on from here
  time?: string; // on the right of the name
  badge?: string; // beside the name: the line you get on here
  // where that line goes: then the line and its end go under the name together, as one chip -
  // the number in the colour of the line, the end on a tint of it - what you look for on the
  // front of the vehicle
  toward?: string;
  end?: boolean; // the first or the last stop: a filled dot and a bold name
  broken?: boolean; // you walk on from this stop: the line from it to the next one is dashed
  strong?: boolean; // the name in bold
  picked?: boolean; // the stop that was clicked: its circle fills and grows, its name moves out
  open?: boolean; // the row is showing what is under it (for readers of the page)
  under?: ReactNode; // under the name: the next departures, a walk, anything
  riders?: StripRider[]; // between this stop and the next one
  here?: StripRider; // standing at this stop: drawn on its circle
  onPick?: () => void;
};

export default function Strip({ rows }: { rows: StripRow[] }) {
  return (
    <ol className="strip">
      {rows.map((row, i) => {
        // where you change from one line to another, the circle is half the one and half the
        // other: the line that brought you above, the one you go on with below
        const before = rows[i - 1]?.color;
        const split = before !== undefined && before !== row.color && !rows[i - 1].broken;
        // after a walk the line comes in dashed
        const walked = rows[i - 1]?.broken === true;
        return (
          <Fragment key={row.key}>
            <li
              className={[
                row.end ? "end" : "",
                row.strong ? "strong" : "",
                row.picked ? "picked" : "",
                row.broken ? "broken" : "",
                split ? "split" : "",
                walked ? "walked" : "",
              ]
                .join(" ")
                .trim()}
              style={
                {
                  "--line-color": row.color,
                  "--line-before": before,
                  "--line-ink": inkOn(row.color),
                } as CSSProperties
              }
            >
              <button onClick={row.onPick} aria-expanded={row.open}>
                <span className="strip-dot" aria-hidden="true" />
                <span className="strip-name">{row.name}</span>
                {row.here?.note ? (
                  <span className={`strip-rider-note ${row.here.onTime ? "on-time" : ""}`}>
                    {row.here.note}
                  </span>
                ) : null}
                {row.badge && !row.toward ? <span className="strip-badge">{row.badge}</span> : null}
                {row.time ? <span className="strip-time">{row.time}</span> : null}
              </button>
              {row.badge && row.toward ? (
                <div className="strip-board">
                  <span className="strip-board-line">{row.badge}</span>
                  <span className="strip-board-to">{row.toward}</span>
                </div>
              ) : null}
              {row.under}
              {row.here ? <Here rider={row.here} /> : null}
            </li>
            {row.riders && row.riders.length > 0 ? (
              <Riding riders={row.riders} color={row.color} />
            ) : null}
          </Fragment>
        );
      })}
    </ol>
  );
}

// A vehicle standing at a stop: its mark on the stop's circle, which it covers, so that the
// strip says it is there - at your stop, at the one where you change - and not between two.
function Here({ rider }: { rider: StripRider }) {
  return (
    <span
      className="strip-here"
      aria-label={`${rider.label} ${rider.note ?? ""}`}
      style={
        {
          "--rider-color": rider.color,
          "--rider-ink": inkOn(rider.color),
        } as CSSProperties
      }
    >
      <span className="strip-rider-mark">
        <KindIcon kind={rider.kind} />
      </span>
    </span>
  );
}

// The row of the vehicles between two stops: the line goes on through it, and each vehicle is a
// round mark on the line with a picture of its kind, as far down it as the vehicle is towards
// the next stop, and how late it runs beside it.
function Riding({ riders, color }: { riders: StripRider[]; color: string }) {
  return (
    <li
      className="strip-riding"
      style={{ "--line-color": color } as CSSProperties}
      aria-label={riders.map((rider) => `${rider.label} ${rider.note ?? ""}`).join(", ")}
    >
      {together(riders).map(({ rider, more }) => (
        <span
          key={rider.key}
          className="strip-rider"
          style={
            {
              "--share": rider.share,
              "--rider-color": rider.color,
              "--rider-ink": inkOn(rider.color),
            } as CSSProperties
          }
        >
          <span className="strip-rider-marks">
            {/* the others at the same place peek out from behind it, as a stack */}
            {Array.from({ length: Math.min(more, 2) }, (_, i) => (
              <span
                key={i}
                className="strip-rider-mark behind"
                style={{ "--behind": i + 1 } as CSSProperties}
              />
            ))}
            <span className="strip-rider-mark">
              <KindIcon kind={rider.kind} />
            </span>
          </span>
          {rider.note ? (
            <span className={`strip-rider-note ${rider.onTime ? "on-time" : ""}`}>
              {rider.note}
            </span>
          ) : null}
        </span>
      ))}
    </li>
  );
}

// Vehicles at about the same place - three of them waiting at the terminus - are one rider,
// with the others stacked behind it: side by side they ran off the panel, on top of each other
// they were unreadable. The first of them speaks for the rest.
function together(riders: StripRider[]) {
  const sorted = [...riders].sort((a, b) => a.share - b.share);
  const groups: { rider: StripRider; more: number }[] = [];
  for (const rider of sorted) {
    const last = groups[groups.length - 1];
    if (last && rider.share - last.rider.share < 0.3) last.more++;
    else groups.push({ rider, more: 0 });
  }
  return groups;
}
