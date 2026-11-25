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
  type TouchEvent,
} from "react";
import { flushSync } from "react-dom";
import type { TransitData } from "../../logic/timetable/loadData";
import { formatDate, type Now } from "../../logic/timetable/clock";
import { isTimetableCurrent } from "../../logic/timetable/departures";
import { EASE, isPhone, lessMotion } from "../../screen";
import { useWords } from "../language";
import { HEIGHT, MOVE_EVENT, next, type Height } from "./control";
import { typedNoMore, usePanelDrag } from "./usePanelDrag";
import { usePanelHeight } from "./usePanelHeight";
import { useKeyboard } from "./useKeyboard";
import "./Panel.css";

export type Mode = "journey" | "lines";

// the journey comes first: it is what the app is for, the lines are there to look around
const MODES: Mode[] = ["journey", "lines"];

// ---------- settings ----------
const TAP = 10; // px a finger may move on a field and still have tapped it
const RISE_MS = 380; // how long the panel takes to rise when a field is tapped
// ------------------------------

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
  // keyboard (a keyboard of a computer, or a field focused by the app: a finger is below)
  function focused(event: FocusEvent) {
    if (isPhone() && event.target instanceof HTMLInputElement) setHeight("full");
  }

  // Below all the way up, nothing is typed: the keyboard goes as the panel comes down - pulled
  // down, or sent down by the app (the ways found) - and the panel glides to where it is going
  // without waiting for it.
  useEffect(() => {
    if (height !== "full" && ref.current && isPhone()) typedNoMore(ref.current);
  }, [height, ref]);

  // A finger on a field of the panel, on a phone, as a phone's own sheets do it: one tap, and
  // the panel rises all the way up as the keyboard comes, the cursor in the field. The phone
  // is left out of it: its own focus comes as the finger lifts, and it scrolls the page to show
  // the field - the page and the panel moving at once was the jump, going from one field to the
  // other too - and a panel rising under the finger could make it take the tap for nothing at
  // all, so that a second one was needed. So the field is focused here, without a scroll, with
  // the panel already up. A field already typed in is the phone's: the finger puts the cursor.
  const tapped = useRef<{ field: HTMLInputElement; x: number; y: number } | null>(null);

  function touchStarted(event: TouchEvent<HTMLDivElement>) {
    tapped.current = null;
    const field = (event.target as Element).closest("input");
    if (!isPhone() || !field || field === document.activeElement || event.touches.length !== 1)
      return;
    const { clientX: x, clientY: y } = event.touches[0];
    tapped.current = { field, x, y };
  }

  function touchEnded(event: TouchEvent<HTMLDivElement>) {
    const was = tapped.current;
    tapped.current = null;
    const finger = event.changedTouches[0];
    if (!was || !finger || Math.hypot(finger.clientX - was.x, finger.clientY - was.y) > TAP) return; // not a tap: the panel or what is in it moved
    event.preventDefault(); // no focus, scroll or click of the phone's own
    if (height !== "full") rise();
    was.field.focus({ preventScroll: true });
    // the cursor at the end of what is written, as a tap there would put it
    const end = was.field.value.length;
    if (was.field.selectionStart === was.field.selectionEnd) was.field.setSelectionRange(end, end);
  }

  // All the way up at once, so that the field is high on the screen before the keyboard comes;
  // drawn where it was, it slides into its place, without its layout changing on the way.
  function rise() {
    const panel = ref.current;
    if (!panel) return;
    const before = panel.getBoundingClientRect().top;
    panel.dataset.glide = "none"; // its own glide stays out of it (usePanelHeight.ts)
    flushSync(() => setHeight("full"));
    const after = panel.getBoundingClientRect().top;
    if (lessMotion() || Math.abs(before - after) < 2) return;
    panel.animate([{ transform: `translateY(${before - after}px)` }, { transform: "none" }], {
      duration: RISE_MS,
      easing: EASE,
    });
  }

  return (
    <div
      className="panel"
      ref={ref}
      style={{ "--panel-height": HEIGHT[height] } as CSSProperties}
      data-height={height}
      onFocus={focused}
      onTouchStart={touchStarted}
      onTouchEnd={touchEnded}
      onTouchCancel={() => (tapped.current = null)}
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
