// The ŠalinaGO screen shown while the map, the timetable and the live vehicles load: frosted
// glass over the map as it comes up under it, and on it a line with stops that draws itself
// again and again, the name, what it is waiting for, and who made it. It fades out when the app is ready (or loading failed, then the error message under it
// is visible).
// When it is over in a moment it says what it is doing; when it takes longer than that, it
// starts passing the time instead.

import { useEffect, useState } from "react";
import { useWords } from "./language";
import "./LoadingScreen.css";

// ---------- settings ----------
const FADE_MS = 800; // keep in sync with the transition in LoadingScreen.css
const SLOW_MS = 1800; // a load longer than this gets the lines below
const LINE_MS = 2400; // how long each of them stays
// ------------------------------

// The lines it passes the time with are in logic/words.ts (passingTime): true enough to be
// worth reading - Brno has 848 stops and 131 lines, and some four hundred vehicles are out there.

// One thing that has to arrive before the app can open.
export type LoadingStep = { label: string; done: boolean };

type Props = {
  loading: boolean;
  steps: LoadingStep[]; // what is being waited for, in the order it is usually done
};

export default function LoadingScreen({ loading, steps }: Props) {
  const w = useWords();
  const [gone, setGone] = useState(false);
  const [line, setLine] = useState(-1); // -1 until the load counts as slow

  // after the fade-out, remove the screen from the page
  useEffect(() => {
    if (loading) return;
    const id = setTimeout(() => setGone(true), FADE_MS);
    return () => clearTimeout(id);
  }, [loading]);

  // while it takes its time, one line after another
  useEffect(() => {
    if (!loading) return;
    let next: ReturnType<typeof setInterval> | undefined;
    const start = setTimeout(() => {
      setLine(0);
      next = setInterval(() => setLine((shown) => shown + 1), LINE_MS);
    }, SLOW_MS);
    return () => {
      clearTimeout(start);
      clearInterval(next);
    };
  }, [loading]);

  if (gone) return null;
  const lines = w.passingTime;
  const text = steps.find((step) => !step.done)?.label ?? w.hereWeGo;

  return (
    <div className={`loading ${loading ? "" : "done"}`} role="status" aria-live="polite">
      <div className="loading-content">
        {/* a line with stations that draws itself again and again */}
        <svg className="loading-route" viewBox="0 0 160 40" aria-hidden="true">
          <path className="loading-track" d="M8 30 L48 30 L72 10 L112 10 L152 30" />
          <path className="loading-line" d="M8 30 L48 30 L72 10 L112 10 L152 30" />
          {[
            [8, 30],
            [48, 30],
            [72, 10],
            [112, 10],
            [152, 30],
          ].map(([x, y], i) => (
            <circle
              key={i}
              className="loading-stop"
              cx={x}
              cy={y}
              r="4"
              style={{ animationDelay: `${i * 0.18}s` }}
            />
          ))}
        </svg>

        <div className="loading-name">
          Šalina<span>GO</span>
        </div>
        {/* a new line fades in over the old one, rather than replace it */}
        <div className="loading-text" key={line < 0 ? text : line}>
          {line < 0 ? text : lines[line % lines.length]}
        </div>
      </div>
      <div className="loading-by">{w.madeBy} Timotej V.</div>
    </div>
  );
}
