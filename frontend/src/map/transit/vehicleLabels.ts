// The labels of live vehicles when the map is close enough to read them: the line number in the
// colour of the line, a rounded square for a tram and a capsule for a bus or a trolleybus, the
// way Apple Maps draws them - and a small dart outside it pointing where it drives.
// The vehicle of your journey pings: a ring in the shape of its label grows out of it and fades.
// They are HTML elements laid over the map rather than symbols of a map layer. A symbol layer
// lays all its symbols out again whenever any of them moves - twenty milliseconds each time,
// however few there are - so its labels could only be moved twice a second and stepped
// visibly. An element is moved by its position alone, every frame, for next to nothing.
// It is given the labels to show and where; which those are is vehiclesLayer.ts's business.

import { Marker, type Map as MapLibreMap } from "maplibre-gl";
import { inkOn } from "../../colors";
import "./vehicleLabels.css";

// ---------- settings ----------
const LABEL_HEIGHT = 18;
const LABEL_FONT = "650 11px system-ui, sans-serif"; // keep in sync with vehicleLabels.css
const DART = { gap: 2, length: 9 }; // the dart sits this far outside the pill, this long
// ------------------------------

// One label to show.
export type Label = {
  id: number; // of the vehicle
  line: string;
  kind: "tram" | "trolleybus" | "bus"; // tells the shape: square, round, round with poles
  color: string;
  bearing: number; // degrees clockwise from north, -1 when the direction is not known
  point: [number, number]; // [lon, lat]
  pop: number; // how far it has grown in, arriving: 0 to a little over 1 and back to 1
  atStop: boolean; // it pings: it is the vehicle of your journey
};

// What all the labels share at this moment: how big they are at this zoom, and how much of them
// shows while they grow out of the dots.
export type Look = { scale: number; seen: number };

type Shown = {
  marker: Marker;
  inner: HTMLElement;
  pill: HTMLElement;
  dart: HTMLElement;
  reach: number;
  leaving: boolean; // it has left the stop: the ping on its way finishes, then no more
  pop: number; // what was last written of it, so that only what changes is written again
  dartTurn: string;
};

// The app has one map, so its labels are kept here.
const shown = new Map<number, Shown>(); // vehicle id -> its label on the map
let look: Look = { scale: -1, seen: -1 }; // what was last written of what they share
let picked: (id: number) => void = () => {}; // what a click on a label does

// While the app is developed, a changed version of this file replaces the old one in the page;
// the labels the old one put on the map would stay there, orphaned, so they go with it.
import.meta.hot?.dispose(() => {
  for (const { marker } of shown.values()) marker.remove();
});
// This file keeps what is on the map in variables of its own, which a hot update while the app
// is developed would start again from nothing next to the old ones still drawing - the live
// vehicles blinking between two copies of themselves. A change to it, or to anything it uses,
// reloads the page instead.
import.meta.hot?.accept(() => location.reload());

// What a click on a label does: it is given the id of the vehicle.
export function onLabelPick(handler: (id: number) => void) {
  picked = handler;
}

// Shows exactly these labels: new ones are added, the rest moved, and the ones not given any
// more taken away.
// This runs every frame, for hundreds of labels while the map is zoomed out to where they turn
// into dots - and on a phone writing the size of every one of them every frame made zooming
// stutter. What they share is written once, on the map, and the labels take it from there
// (vehicleLabels.css); of each label only what changed is written.
export function placeLabels(map: MapLibreMap, labels: Label[], now: Look = look) {
  if (now.scale !== look.scale || now.seen !== look.seen) {
    const container = map.getContainer();
    container.style.setProperty("--label-scale", String(now.scale));
    container.style.setProperty("--label-seen", String(now.seen));
    look = now;
  }
  const turn = map.getBearing(); // the dart points along the map, which may be turned
  const wanted = new Set<number>();
  for (const label of labels) {
    wanted.add(label.id);
    const known = shown.get(label.id) ?? add(map, label);
    known.marker.setLngLat(label.point);
    if (label.pop !== known.pop) {
      known.inner.style.setProperty("--pop", String(label.pop));
      known.pop = label.pop;
    }
    ping(known, label.atStop);
    const dartTurn =
      label.bearing >= 0
        ? `rotate(${Math.round(label.bearing - turn)}deg) translateY(${-known.reach}px)`
        : "";
    if (dartTurn !== known.dartTurn) {
      known.dart.style.display = dartTurn ? "" : "none";
      known.dart.style.transform = dartTurn;
      known.dartTurn = dartTurn;
    }
  }
  for (const [id, { marker }] of shown) {
    if (wanted.has(id)) continue;
    marker.remove();
    shown.delete(id);
  }
}

// A new label on the map, in the colour of its line.
function add(map: MapLibreMap, label: Label): Shown {
  const element = document.createElement("div");
  element.className = "vehicle-label";
  element.addEventListener("click", (event) => {
    event.stopPropagation(); // the map under it is not clicked too
    picked(label.id);
  });
  const inner = document.createElement("div");
  inner.className = "vehicle-label-inner";
  inner.style.setProperty("--line-color", label.color);
  inner.style.setProperty("--line-ink", inkOn(label.color));

  const dart = document.createElement("div");
  dart.className = "vehicle-label-dart";
  dart.innerHTML =
    '<svg viewBox="0 0 11 9" width="11" height="9" aria-hidden="true">' +
    '<path d="M5.5 0 L0 9 Q5.5 5 11 9 Z" /></svg>';
  const pill = document.createElement("div");
  pill.className = `vehicle-label-pill ${label.kind}`;
  pill.textContent = label.line;
  // the ping of a vehicle at a stop: a copy of the pill behind it that grows and fades
  const ring = document.createElement("span");
  ring.className = "vehicle-label-ring";
  pill.append(ring);

  inner.append(dart, pill);
  element.append(inner);
  // placed to the fraction of a pixel: rounded to whole ones, a slow vehicle shivers
  const marker = new Marker({ element, subpixelPositioning: true })
    .setLngLat(label.point)
    .addTo(map);
  // the dart turns around the middle of the pill, just outside it
  const reach = Math.max(LABEL_HEIGHT, textWidth(label.line) + 10) / 2 + DART.gap + DART.length / 2;
  const known = { marker, inner, pill, dart, reach, leaving: false, pop: -1, dartTurn: "-" };
  // a vehicle that has left its stop finishes the ping on its way rather than cut it off
  ring.addEventListener("animationiteration", () => {
    if (known.leaving) pill.classList.remove("at-stop");
  });
  shown.set(label.id, known);
  return known;
}

// Starts the pings of a vehicle that came to a stop, each from the start; one that leaves has
// the one on its way finish. The browser animates them, smoothly, without the page.
function ping(known: Shown, atStop: boolean) {
  const pinging = known.pill.classList.contains("at-stop");
  if (atStop) {
    known.leaving = false;
    if (!pinging) known.pill.classList.add("at-stop");
  } else if (pinging) {
    known.leaving = true;
  }
}

// How wide a line number is written, to keep the dart just outside its pill.
const context = document.createElement("canvas").getContext("2d")!;
function textWidth(text: string) {
  context.font = LABEL_FONT;
  return context.measureText(text).width;
}
