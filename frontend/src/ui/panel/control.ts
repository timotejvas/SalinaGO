// The heights the panel stands at on a phone, and what the rest of the app may ask of it:
// to stand at one of them, to scroll something into sight. A wide screen ignores all of this.

import { isPhone } from "../../screen";

// How tall it stands, as a share of the screen - three, as a phone's own sheets: down at the
// edge with its top showing (the modes, or the title of what is open), so the map is free and
// the panel a pull away; half the screen, map and panel side by side; all the way up, to type
// or to read a long list. It stands only as tall as what is in it, up to that. (All the way up
// it reaches from under the phone's top bar, which is a little more than this - Panel.css.)
export const HEIGHT = { peek: 14, half: 50, full: 92 } as const;
export type Height = keyof typeof HEIGHT;
const HEIGHTS = Object.values(HEIGHT); // from the lowest

// Moves the panel to one of its heights: typing a name, the ways just found, a way picked to be
// seen on the map. Panel.tsx listens.
export function movePanel(height: Height) {
  if (isPhone()) window.dispatchEvent(new CustomEvent(MOVE_EVENT, { detail: height }));
}
export const MOVE_EVENT = "panel-height";

// Scrolls the panel so that a part of it is in sight: at its top ("start"), or only as far as
// it takes ("nearest"). Only the panel scrolls - never the page under it.
export function scrollPanelTo(part: Element | null, where: "start" | "nearest") {
  const panel = part?.closest(".panel-body");
  if (!part || !panel || !isPhone()) return;
  const [box, view] = [part.getBoundingClientRect(), panel.getBoundingClientRect()];
  const room = 12;
  const by =
    where === "start"
      ? box.top - view.top - room
      : box.bottom > view.bottom
        ? box.bottom - view.bottom + room
        : box.top < view.top
          ? box.top - view.top - room
          : 0;
  if (by !== 0) panel.scrollBy({ top: by, behavior: "smooth" });
}

// The name of the height nearest a share of the screen - where it rests when let go.
export function nearest(share: number): Height {
  return nameOf(
    HEIGHTS.reduce((best, stop) => (Math.abs(stop - share) < Math.abs(best - share) ? stop : best)),
  );
}

// The height a tap on the handle moves it to: the next one up, and from the top the lowest.
export function next(height: Height): Height {
  return nameOf(HEIGHTS[(HEIGHTS.indexOf(HEIGHT[height]) + 1) % HEIGHTS.length]);
}

// The next height up from a share, or down - where a flick sends it.
export function onwards(share: number, up: boolean): Height {
  const stop = up
    ? (HEIGHTS.find((one) => one > share + 1) ?? HEIGHTS[HEIGHTS.length - 1])
    : ([...HEIGHTS].reverse().find((one) => one < share - 1) ?? HEIGHTS[0]);
  return nameOf(stop);
}

// Where a finger has it: past the lowest or the highest height only a third of the way, as a
// rubber band - and a mouse, which does not stretch it, within them.
export function stretched(share: number, rubber = true): number {
  const [low, high] = [HEIGHTS[0], HEIGHTS[HEIGHTS.length - 1]];
  if (!rubber) return Math.min(high, Math.max(low, share));
  if (share > high) return high + (share - high) / 3;
  if (share < low) return Math.max(low / 2, low - (low - share) / 3);
  return share;
}

const nameOf = (share: number) =>
  (Object.keys(HEIGHT) as Height[]).find((name) => HEIGHT[name] === share)!;
