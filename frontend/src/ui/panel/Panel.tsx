// The panel over the map: top left on a wide screen, and on a phone a sheet along the bottom
// that you pull up and down (usePanelDrag.ts) between the heights of control.ts. It holds the
// two modes of the app, ui/journey/JourneyPlanner.tsx and ui/lines/LinePicker.tsx, under the
// switch between them - and over them, what is opened on the map (App.tsx).

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type FocusEvent,
  type ReactNode,
  type RefObject,
} from "react";
import type { TransitData } from "../../logic/timetable/loadData";
import { formatDate, type Now } from "../../logic/timetable/clock";
import { isTimetableCurrent } from "../../logic/timetable/departures";
import { isPhone } from "../../screen";
import { useWords } from "../language";
import { HEIGHT, MOVE_EVENT, next, type Height } from "./control";
import { usePanelDrag } from "./usePanelDrag";
import { usePanelHeight } from "./usePanelHeight";
import { useKeyboard } from "./useKeyboard";
import "./Panel.css";

export type Mode = "journey" | "lines";

// the journey comes first: it is what the app is for, the lines are there to look around
const MODES: Mode[] = ["journey", "lines"];

type Props = {
  ref: RefObject<HTMLDivElement | null>; // App measures the panel to keep the map clear of it
  mode: Mode;
  onModeChange: (mode: Mode) => void;
  // while one thing fills the panel (a station, a vehicle, a line, the way you are on), the
  // modes step aside above it; its × brings them back
  modesHidden: boolean;
  data: TransitData;
  now: Now;
  children: ReactNode; // the mode itself
};

export default function Panel({
  ref,
  mode,
  onModeChange,
  modesHidden,
  data,
  now,
  children,
}: Props) {
  const w = useWords();
  const body = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<Height>("half"); // on a phone: where it was left
  const grab = usePanelDrag(ref, body, height, setHeight);
  usePanelHeight(ref);
  useKeyboard();

  // asked to another height by the rest of the app (movePanel)
  useEffect(() => {
    const ask = (event: Event) => setHeight((event as CustomEvent<Height>).detail);
    window.addEventListener(MOVE_EVENT, ask);
    return () => window.removeEventListener(MOVE_EVENT, ask);
  }, []);

  // Something else in it - the other mode, or a station, a line, a vehicle opened: from its top,
  // and on a phone at half the screen, so that the map above shows where it is (a mode at least
  // half). Closed again, the mode under it is where it was left, scrolled as far as it was.
  const shown = useRef({ mode, modesHidden });
  const scrolledTo = useRef<Partial<Record<Mode, number>>>({}); // how far each mode was scrolled
  // (kept as it scrolls: by the time a change is seen, what was scrolled is gone)
  function scrolled() {
    if (body.current && !shown.current.modesHidden)
      scrolledTo.current[shown.current.mode] = body.current.scrollTop;
  }
  useLayoutEffect(() => {
    const was = shown.current;
    if (was.mode === mode && was.modesHidden === modesHidden) return;
    shown.current = { mode, modesHidden };
    body.current?.scrollTo({ top: modesHidden ? 0 : (scrolledTo.current[mode] ?? 0) });
    if (isPhone()) setHeight((at) => (modesHidden || HEIGHT[at] < HEIGHT.half ? "half" : at));
  }, [mode, modesHidden]);

  // a name being typed: all the way up, so that the field and what it offers stay above the
  // keyboard
  function focused(event: FocusEvent) {
    if (isPhone() && event.target instanceof HTMLInputElement) setHeight("full");
  }

  return (
    <div
      className="panel"
      ref={ref}
      style={{ "--panel-height": HEIGHT[height] } as CSSProperties}
      data-height={height}
      onFocus={focused}
    >
      {/* only on a phone, where the panel is a sheet along the bottom */}
      <button
        className="grab"
        aria-label={w.movePanel}
        {...grab}
        onPointerCancel={grab.onPointerUp}
        onKeyDown={(event) => event.key === "Enter" && setHeight(next(height))}
      />

      <div className={`panel-top ${modesHidden ? "away" : ""}`} inert={modesHidden}>
        <div className="modes" data-on={MODES.indexOf(mode)}>
          {MODES.map((m) => (
            <button
              key={m}
              className={`mode ${m === mode ? "on" : ""}`}
              aria-pressed={m === mode}
              onClick={() => onModeChange(m)}
            >
              {w[m]}
            </button>
          ))}
        </div>
      </div>

      <div className={`panel-body for-${mode}`} ref={body} onScroll={scrolled}>
        {children}

        {!isTimetableCurrent(data, now) && (
          <p className="info">
            {w.outsideTimetable(
              formatDate(data.validFrom, true, w),
              formatDate(data.validTo, true, w),
            )}
          </p>
        )}
      </div>
    </div>
  );
}
