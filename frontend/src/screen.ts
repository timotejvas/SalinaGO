// What kind of screen the app is on: a phone's, one you touch, one whose user asked for less
// motion. Asked in one place, so that the panel, the map and the cards all draw the line at
// the same width. Both halves of the app ask here, which is why this is not inside map/ or ui/.

import { useSyncExternalStore } from "react";

// a phone's screen; keep in sync with the (max-width: 600px) of the styles
const PHONE = window.matchMedia("(max-width: 600px)");
// a finger rather than a cursor: what is tapped needs more room round it
const TOUCH = window.matchMedia("(pointer: coarse)");
// the user asked their system for less motion: nothing moves by itself then, and nothing
// shown is only in the movement, so nothing is left out
const STILL = window.matchMedia("(prefers-reduced-motion: reduce)");

export const isPhone = () => PHONE.matches;
export const isTouch = () => TOUCH.matches;
export const lessMotion = () => STILL.matches;

// Whether the screen is a phone's, for a component drawn differently there: it is drawn again
// when that changes (a phone turned, a window made narrow).
export function usePhone() {
  return useSyncExternalStore(
    (changed) => {
      PHONE.addEventListener("change", changed);
      return () => PHONE.removeEventListener("change", changed);
    },
    () => PHONE.matches,
  );
}

// The curve most things move by, for animations started from code: --ease of
// styles/theme.css, which the styles use.
export const EASE = "cubic-bezier(0.32, 0.72, 0, 1)";
