// Moving the panel on a phone by hand, as a phone's own sheets move.
// A finger: on its top - the handle, the modes, the title of what is open - it moves the panel;
// on what is in it, pulling up moves the panel until it is all the way up, and pulling down
// moves it once what is in it is scrolled to its top - otherwise it scrolls. Let go, it goes to
// the nearest height, or on in the direction it was flicked. A tap on the handle steps to the
// next height.
// A mouse (a narrow window on a computer): the handle only, dragged or clicked.
// While it moves its height is written straight onto the element: going through state would
// draw the whole panel - both modes, every row of a strip - for every pixel, and it stuttered.

import { useEffect, useRef, type PointerEvent, type RefObject } from "react";
import { isPhone, visibleHeight } from "../../screen";
import { HEIGHT, nearest, next, onwards, stretched, type Height } from "./control";

// ---------- settings ----------
const FLICK = 0.4; // px/ms: faster than this, let go, is a flick
const SLOP = 6; // px a finger moves before it is a drag rather than a tap
// what of the panel a finger moves it by, wherever it is scrolled
const HEAD = ".grab, .panel-top, .station-head, .overview-head, .ride-head";
// ------------------------------

export function usePanelDrag(
  panelRef: RefObject<HTMLDivElement | null>,
  bodyRef: RefObject<HTMLDivElement | null>,
  height: Height,
  setHeight: (height: Height) => void,
) {
  const resting = useRef(height); // for the listeners, which are added once
  resting.current = height;

  // the share of the screen a top edge at this place leaves to the panel
  const shareAt = (top: number) => 100 - (100 * top) / visibleHeight();
  const hold = (panel: HTMLElement, share: number) => {
    panel.classList.add("held");
    panel.style.setProperty("--panel-height", String(share));
  };
  const letGo = (panel: HTMLElement, to: Height) => {
    panel.classList.remove("held");
    panel.style.removeProperty("--panel-height"); // from here on the height is React's again
    setHeight(to);
  };

  // a finger, anywhere on the panel
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    let start: { y: number; top: number; head: boolean; handle: boolean } | null = null;
    let drag: { grip: number; moves: { y: number; t: number }[] } | null = null;

    const begin = (event: TouchEvent) => {
      start = null;
      if (!isPhone() || event.touches.length !== 1) return;
      const target = event.target as Element;
      if (target.closest("input, textarea")) return;
      start = {
        y: event.touches[0].clientY,
        top: panel.getBoundingClientRect().top,
        head: Boolean(target.closest(HEAD)),
        handle: Boolean(target.closest(".grab")),
      };
      drag = null;
    };

    const move = (event: TouchEvent) => {
      if (!start) return;
      const y = event.touches[0].clientY;
      const dy = y - start.y;
      if (!drag) {
        if (Math.abs(dy) < SLOP) return;
        const atTop = (bodyRef.current?.scrollTop ?? 0) <= 0;
        const own = start.head || (dy > 0 && atTop) || (dy < 0 && resting.current !== "full");
        if (!own) return void (start = null); // a scroll of what is in it
        drag = { grip: start.y - start.top, moves: [] };
      }
      event.preventDefault(); // the panel moves, not what is in it
      hold(panel, stretched(shareAt(y - drag.grip)));
      drag.moves.push({ y, t: event.timeStamp });
      if (drag.moves.length > 5) drag.moves.shift();
    };

    const end = () => {
      if (!start) return;
      if (!drag) {
        if (start.handle) setHeight(next(resting.current)); // a tap on the handle
        start = null;
        return;
      }
      const at = Number(panel.style.getPropertyValue("--panel-height")) || HEIGHT.half;
      const [first, last] = [drag.moves[0], drag.moves[drag.moves.length - 1]];
      const speed = first && last && last.t > first.t ? (last.y - first.y) / (last.t - first.t) : 0;
      start = drag = null;
      letGo(panel, Math.abs(speed) > FLICK ? onwards(at, speed < 0) : nearest(at));
    };

    panel.addEventListener("touchstart", begin, { passive: true });
    panel.addEventListener("touchmove", move, { passive: false });
    panel.addEventListener("touchend", end);
    panel.addEventListener("touchcancel", end);
    return () => {
      panel.removeEventListener("touchstart", begin);
      panel.removeEventListener("touchmove", move);
      panel.removeEventListener("touchend", end);
      panel.removeEventListener("touchcancel", end);
    };
  }, [panelRef, bodyRef, setHeight]);

  // a mouse, on the handle: what it is given to listen with (a finger is handled above)
  const mouse = useRef<{ grip: number; moved: boolean } | null>(null);
  return {
    onPointerDown(event: PointerEvent<HTMLElement>) {
      const panel = panelRef.current;
      if (!panel || event.pointerType === "touch") return;
      event.currentTarget.setPointerCapture(event.pointerId);
      // where it was taken hold of, so that it does not jump to the cursor
      mouse.current = { grip: event.clientY - panel.getBoundingClientRect().top, moved: false };
    },
    onPointerMove(event: PointerEvent<HTMLElement>) {
      const panel = panelRef.current;
      if (!panel || !mouse.current) return;
      mouse.current.moved = true;
      hold(panel, stretched(shareAt(event.clientY - mouse.current.grip), false));
    },
    onPointerUp() {
      const panel = panelRef.current;
      if (!panel || !mouse.current) return;
      const at = Number(panel.style.getPropertyValue("--panel-height"));
      const moved = mouse.current.moved;
      mouse.current = null;
      letGo(panel, moved ? nearest(at) : next(resting.current)); // a click steps on
    },
  };
}
