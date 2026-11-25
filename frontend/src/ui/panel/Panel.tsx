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
import { isPhone, lessMotion } from "../../screen";
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
// How the panel rises when a field is tapped: about as long as the keyboard, and easing out
// gently - a phone may show nothing for the first moment of it, while it brings the keyboard
// up, and a curve that does most of its way at once was then over before it was seen.
const RISE_MS = 460;
const RISE_EASE = "cubic-bezier(0.22, 0.61, 0.36, 1)";
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
  // the field that holds the keyboard while the panel rises, there before the first tap: one
  // put on the page in the same moment it is to take the keyboard, a phone may not give it one
  useEffect(() => {
    if (isPhone()) standIn();
  }, []);

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
    const { field } = was;
    const rising = height !== "full" ? rise() : null;
    if (!rising) return typeIn(field);
    // The panel slides up as the keyboard comes. The field slides with it, and the phone, seeing
    // it low on the screen where the keyboard comes, would move the whole page to show it: the
    // jump. So the keyboard is brought up for a field that stands still at the top of the
    // screen - it has to be now, in the tap - and the typing is handed to the real one once the
    // panel is up.
    const stand = standIn(field);
    stand.focus({ preventScroll: true });
    rising.finished
      .catch(() => {})
      .finally(() => {
        if (document.activeElement !== stand) return; // something else was tapped meanwhile
        // pulled down meanwhile: nothing is typed below all the way up
        if (ref.current?.dataset.height !== "full") return stand.blur();
        typeIn(field, stand.value);
        stand.value = "";
      });
  }

  // All the way up at once, so that the field is high on the screen before the keyboard comes;
  // drawn where it was, it slides into its place, without its layout changing on the way. The
  // slide, or null when there is none.
  function rise(): Animation | null {
    const panel = ref.current;
    if (!panel) return null;
    const before = panel.getBoundingClientRect().top;
    panel.dataset.glide = "none"; // its own glide stays out of it (usePanelHeight.ts)
    flushSync(() => setHeight("full"));
    const after = panel.getBoundingClientRect().top;
    if (lessMotion() || Math.abs(before - after) < 2) return null;
    return panel.animate(
      [{ transform: `translateY(${before - after}px)` }, { transform: "none" }],
      {
        duration: RISE_MS,
        easing: RISE_EASE,
      },
    );
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

// Typing goes to a field: the cursor in it, at the end of what is written, as a tap there would
// put it - with what was typed while the panel rose, if anything was.
function typeIn(field: HTMLInputElement, typed = "") {
  field.focus({ preventScroll: true });
  if (typed) {
    // as if typed into it, so that React hears it
    const write = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    write?.call(field, field.value + typed);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  }
  const end = field.value.length;
  if (field.selectionStart === field.selectionEnd) field.setSelectionRange(end, end);
}

// The field that holds the keyboard while the panel rises: unseen, high on the screen - about
// where the real one comes to stand, below the phone's own top bar and well above the keyboard -
// asking for the same keyboard as the real one. One for the whole page.
let standing: HTMLInputElement | null = null;
function standIn(field?: HTMLInputElement): HTMLInputElement {
  if (!standing) {
    standing = document.createElement("input");
    standing.setAttribute("aria-hidden", "true");
    standing.tabIndex = -1;
    standing.autocomplete = "off";
    // 16px, or the phone would zoom the page in for it; all but invisible, its cursor too
    standing.style.cssText = [
      "position:fixed",
      "top:calc(env(safe-area-inset-top, 0px) + 120px)",
      "left:0",
      "width:1px",
      "height:1px",
      "opacity:0.01",
      "font-size:16px",
      "border:0",
      "padding:0",
      "background:transparent",
      "color:transparent",
      "caret-color:transparent",
      "pointer-events:none",
    ].join(";");
    document.body.append(standing);
  }
  if (field) {
    standing.inputMode = field.inputMode;
    standing.enterKeyHint = field.enterKeyHint;
  }
  return standing;
}
