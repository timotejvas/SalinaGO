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

// A spring, for the sheet of a phone settling at a height: it goes a little past it and comes
// back, as a phone's own sheets do (damping 0.72, a response of 0.42 s - it overshoots by about
// 4 % and is still after SPRING_MS). Null where the browser cannot draw such a curve; then EASE.
export const SPRING_MS = 540;
const SPRING_CURVE =
  "linear(0, 0.028, 0.099, 0.196, 0.307, 0.42, 0.53, 0.631, 0.721, 0.798, 0.863, 0.915, 0.956, " +
  "0.986, 1.009, 1.023, 1.033, 1.037, 1.038, 1.037, 1.034, 1.031, 1.026, 1.022, 1.018, 1.014, " +
  "1.011, 1.008, 1.005, 1.003, 1.002, 1, 1)";
export const SPRING =
  typeof CSS !== "undefined" && CSS.supports("animation-timing-function", SPRING_CURVE)
    ? SPRING_CURVE
    : null;
