// Live vehicles on the map. Zoomed out: a small dot in the color of the kind of
// vehicle, on a halo of that colour.
// Zoomed in: a label with the line number and an arrow that shows where the vehicle is going
// (vehicleLabels.ts).
// It knows nothing about the stream; it is given a list of vehicles.
// The vehicle of your journey - the one coming for you, or the one you are on - pings
// (vehicleLabels.ts draws it), so that you can tell it from the others on the map. Only that
// one: a dozen rings over one another flicker rather than tell you anything.
// A dot is drawn where its vehicle most likely is now (logic/live/motion.ts works that out from
// when it was last seen and how fast it drove). The dot drives like a vehicle does: it has a
// speed of its own, which is the speed of that place plus a little to make up any difference
// left by a new position, and that speed changes gently - so neither a new position nor a
// vehicle stopping is ever a lurch. It never drives backwards: when the guess was too far
// ahead, the dot slows down and waits for the vehicle instead.

import type { ExpressionSpecification, GeoJSONSource, Map as MapLibreMap } from "maplibre-gl";
import type { Vehicle } from "../../logic/live/vehicles";
import { metersBetween } from "../../logic/live/track";
import { distanceOf, expectedAt, pointOn, type Motion } from "../../logic/live/motion";
import { MIN_ZOOM } from "../settings";
import { isTouch, lessMotion } from "../../screen";
import { onLabelPick, placeLabels, type Label } from "./vehicleLabels";

// ---------- settings ----------
const DOT_SIZE = [2.5, 6]; // dot radius at the smallest zoom of the map and at LABEL_MIN_ZOOM
// from this zoom labels with line numbers replace the dots. On a phone a little closer: each
// label is an element the phone moves as the map moves, and at 13.5 a phone had three hundred
// of them on its screen and stuttered as you zoomed; closer, it has half as many, and they
// are big enough to read on the small screen only from there anyway.
const COARSE = isTouch();
const LABEL_MIN_ZOOM = COARSE ? 14.2 : 13.5;
// over this much zoom before it the dots turn into the labels: each label grows out of its dot
// as the dot fades, so that zooming in shows one becoming the other rather than a jump
const BLEND = 0.7;
const LABEL_SCALE = [0.85, 1.1]; // label size at LABEL_MIN_ZOOM and at zoom 17
// How a dot keeps up with where its vehicle should be. A difference is made up at a speed that
// would close it in CORRECT_S, never more than MAX_CORRECTION on top of the vehicle's own; and
// the dot's speed moves two thirds of the way to the one it wants in RAMP_S. Chosen on a
// simulated vehicle that drives, brakes, waits at a stop and drives on, sending a position
// every 10.1 s: the dot's speed changes by at most half a metre a second from one frame to the
// next, where taking the place directly changed it by ten, and while driving it is within two
// metres of the vehicle.
const CORRECT_S = 1.5;
// Gently, rather than at once: a vehicle that stood at a stop and has driven off is known to
// only with its next position, some fifty metres on, and catching up at twenty more metres a
// second made it shoot forward; at most ten makes it pull away a little briskly instead.
const MAX_CORRECTION = 10; // m/s
const RAMP_S = 0.8;
const HALO_SIZE = [6, 13, 17]; // halo radius at the smallest zoom, at LABEL_MIN_ZOOM, at zoom 17
const HALO_OPACITY = 0.2; // of the halo at rest
const PULSE_MS = 2000; // one breath of the halo while only one line is shown
const PULSE_GROWTH = 0.55; // how much bigger the halo gets at the top of a breath
const POP_MS = 420; // a vehicle seen for the first time grows into its size
const POP_SPREAD_MS = 600; // not all at once: each waits its own moment inside this
// The dots are a source of the map, and every redraw of it costs the map the whole fleet, so
// they are redrawn this often and no more - on a fast screen one frame apart meant a hundred
// and eighty of them a second for no visible gain. The labels are elements that cost next to
// nothing to move, and they move every frame the screen draws, so that nothing you read steps.
// A phone has less to spare: there twenty.
const REDRAWS_PER_SECOND = COARSE ? 20 : 30;
// A vehicle the guess has lost - a new position far from where it is drawn, a route it turned
// off, a stream that came back after a while - is not chased across the map: it is shown where
// it is, growing in again, as it does when it first appears.
const JUMP_M = 250;
// ------------------------------

const SOURCE_ID = "vehicles"; // the dots and their halos
const HALO_ID = "vehicles-halo";
const DOTS_ID = "vehicles-dots";

type Point = [number, number]; // [lon, lat]

// A vehicle as it is drawn: the motion it follows, and where on it the dot is right now.
type Dot = {
  vehicle: Vehicle;
  color: string;
  motion: Motion; // the latest of its vehicle
  shown: number; // how far along the route of that motion the dot is drawn
  target: number; // where along it the vehicle should have been at the last frame
  speed: number; // how fast the dot itself drives, metres a second
  point: Point; // where the dot is drawn
  born: number; // when it first appeared, so that it can grow into its size
};

// What colour a vehicle is drawn in; the component asks the timetable (see src/colors.ts).
type ColorOf = (vehicle: Vehicle) => string;

// The app has one map, so the dots of its vehicles are kept here, for this one map.
const dots = new Map<number, Dot>(); // vehicle id -> its dot
let frame = 0; // the requested animation frame, 0 when nothing moves
// While the app is developed, a changed version of this file replaces the old one in the page,
// and the old one's frames would go on drawing its own, stale vehicles into the same map -
// two of them taking turns, every vehicle flickering. The old one stops when it is replaced.
import.meta.hot?.dispose(() => cancelAnimationFrame(frame));
// This file keeps what is on the map in variables of its own, which a hot update while the app
// is developed would start again from nothing next to the old ones still drawing - the live
// vehicles blinking between two copies of themselves. A change to it, or to anything it uses,
// reloads the page instead.
import.meta.hot?.accept(() => location.reload());

let breathing = false; // whether the halos pulse, which keeps the frames coming
let yours: number | null = null; // the vehicle of your journey: the one that pings
let drawnAt = 0; // when the vehicles were last moved
let sentAt = 0; // and when the dots were last given to the map
let labelsFrom = LABEL_MIN_ZOOM; // the zoom the labels start at; 0 while one line is shown

// Where a vehicle is drawn on the map at this moment - between its positions, where the map
// shows it - or null when it is not drawn.
export function shownAt(id: number): Point | null {
  return dots.get(id)?.point ?? null;
}

// Adds the (empty) vehicle layers. Call last, so that vehicles are drawn on top of everything.
export function addVehicles(map: MapLibreMap) {
  dots.clear();
  placeLabels(map, []); // any left from a map before
  const empty = { type: "FeatureCollection" as const, features: [] };
  map.addSource(SOURCE_ID, { type: "geojson", data: empty });

  // a soft glow under every vehicle, in its colour; how big and how faint it is comes with
  // each vehicle, so that a breath costs no more than the positions already cost
  map.addLayer({
    id: HALO_ID,
    type: "circle",
    source: SOURCE_ID,
    paint: {
      "circle-color": ["get", "color"],
      "circle-opacity": ["get", "fade"],
      "circle-blur": 0.8,
      // a zoom is only allowed as the input of the outermost interpolate, so what each
      // vehicle brings with it is multiplied in at every stop of it
      "circle-radius": [
        "interpolate",
        ["linear"],
        ["zoom"],
        MIN_ZOOM,
        ["*", ["get", "halo"], HALO_SIZE[0]],
        LABEL_MIN_ZOOM,
        ["*", ["get", "halo"], HALO_SIZE[1]],
        17,
        ["*", ["get", "halo"], HALO_SIZE[2]],
      ],
    },
  });

  map.addLayer({
    id: DOTS_ID,
    type: "circle",
    source: SOURCE_ID,
    maxzoom: LABEL_MIN_ZOOM,
    paint: {
      "circle-color": ["get", "color"],
      "circle-radius": [
        "interpolate",
        ["linear"],
        ["zoom"],
        MIN_ZOOM,
        ["*", ["get", "pop"], DOT_SIZE[0]],
        LABEL_MIN_ZOOM,
        ["*", ["get", "pop"], DOT_SIZE[1]],
      ],
      "circle-opacity": fadingOut(),
      "circle-stroke-color": "#101016",
      "circle-stroke-width": 1,
      "circle-stroke-opacity": fadingOut(),
    },
  });

  // the labels stand on the map, so they move with it by themselves; but which of them are on
  // the screen, and where their darts point, changes with it too
  map.on("move", () => {
    if (frame === 0) frame = requestAnimationFrame(() => draw(map));
  });
  // a click on a vehicle, its dot or its label, opens its line
  map.on("click", DOTS_ID, (event) => {
    const id = event.features?.[0]?.properties?.id;
    if (typeof id === "number") pickVehicle(id);
  });
  map.on("mouseenter", DOTS_ID, () => (map.getCanvas().style.cursor = "pointer"));
  map.on("mouseleave", DOTS_ID, () => (map.getCanvas().style.cursor = ""));
  onLabelPick(pickVehicle);
  map.once("remove", () => cancelAnimationFrame(frame));
}

// What a click on a vehicle does; the component that draws them says.
let picked: (vehicle: Vehicle) => void = () => {};
export function onVehiclePick(handler: (vehicle: Vehicle) => void) {
  picked = handler;
}
function pickVehicle(id: number) {
  const dot = dots.get(id);
  if (dot) picked(dot.vehicle);
}

// Shows the given vehicles instead of the previous ones. A vehicle that moved starts gliding
// from where its dot is now; a new one appears at its position.
// `focused`: only a few vehicles are shown (one line), so they get labels at every zoom;
// as small dots they would be lost among the highlighted stations.
export function setVehicles(
  map: MapLibreMap,
  vehicles: Vehicle[],
  colorOf: ColorOf,
  focused = false,
  mine: number | null = null, // the vehicle of your journey, which pings
) {
  breathing = focused && !lessMotion();
  yours = lessMotion() ? null : mine;
  labelsFrom = focused ? 0 : LABEL_MIN_ZOOM;
  map.setLayerZoomRange(DOTS_ID, 0, labelsFrom);

  const now = performance.now();
  const seen = new Set<number>();

  for (const vehicle of vehicles) {
    seen.add(vehicle.id);
    const motion = vehicle.motion;
    const dot = dots.get(vehicle.id);
    if (!dot) {
      // a new one appears exactly where it was seen
      const point = pointOn(motion, motion.at);
      dots.set(vehicle.id, {
        vehicle,
        color: colorOf(vehicle),
        motion,
        shown: motion.at,
        target: expectedAt(motion, Date.now()),
        speed: motion.speed, // it is already driving: it does not start from a standstill
        point,
        born: now + (vehicle.id % POP_SPREAD_MS), // its own moment to appear
      });
      continue;
    }
    dot.vehicle = vehicle;
    dot.color = colorOf(vehicle);
    if (dot.motion === motion) continue; // nothing new about where it is
    // a new position: the dot carries on from where it is drawn, now measured on the new route
    dot.motion = motion;
    dot.shown = distanceOf(motion, dot.point);
    dot.target = expectedAt(motion, Date.now()); // what it jumped by is a difference to make up
    // unless that is too far to drive over: then it is simply shown where it is now
    const there = pointOn(motion, dot.target);
    // how far the new route passes by where the dot is drawn (off any route, it has none)
    const off = motion.route ? metersBetween(dot.point, pointOn(motion, dot.shown)) : 0;
    if (metersBetween(dot.point, there) > JUMP_M || off > JUMP_M) {
      dot.shown = dot.target;
      dot.point = there;
      dot.speed = motion.speed;
      dot.born = now; // it grows in again
    }
  }
  for (const id of dots.keys()) if (!seen.has(id)) dots.delete(id);

  cancelAnimationFrame(frame);
  draw(map);
}

// Moves every dot towards where its vehicle should be, draws them, and asks for the next frame
// while any of them still has somewhere to go.
function draw(map: MapLibreMap) {
  const now = performance.now();
  // how long since the last frame; a hidden tab may have skipped many, and then it simply
  // catches up rather than flying across the screen
  const seconds = drawnAt === 0 ? 0 : Math.min(0.5, (now - drawnAt) / 1000);
  drawnAt = now;
  const still = lessMotion();
  const clock = Date.now(); // the stream measures its times with the clock, not the page
  // one breath, the same for every vehicle: 0 at rest, 1 at the top of it
  const breath = breathing ? (1 - Math.cos((2 * Math.PI * now) / PULSE_MS)) / 2 : 0;
  let moving = false;
  const zoom = map.getZoom();
  // how far the labels have grown out of the dots: 0 where they begin, 1 from LABEL_MIN_ZOOM on
  // (and always, when one line is shown and has labels at every zoom)
  const grown = labelsFrom === 0 ? 1 : clamp((zoom - (LABEL_MIN_ZOOM - BLEND)) / BLEND);
  const labelled = grown > 0;
  const look = { scale: labelSize(zoom) * (0.35 + 0.65 * easeOut(grown)), seen: grown };
  const visible = labelled ? onScreen(map) : undefined;
  const labels: Label[] = [];
  const features = [...dots.values()].map((dot) => {
    if (chase(dot, clock, seconds, still)) moving = true;
    const pop = popped(dot, now, !still);
    if (pop < 1) moving = true;
    if (visible?.(dot.point)) {
      labels.push({
        id: dot.vehicle.id,
        line: dot.vehicle.line,
        kind: dot.vehicle.kind,
        color: dot.color,
        bearing: dot.vehicle.bearing,
        point: dot.point,
        pop,
        atStop: dot.vehicle.id === yours,
      });
    }
    return dotFeature(dot, dot.point, pop, breath);
  });
  // the dots not more often than REDRAWS_PER_SECOND, however fast the screen is
  if (now - sentAt >= 1000 / REDRAWS_PER_SECOND) {
    sentAt = now;
    map.getSource<GeoJSONSource>(SOURCE_ID)?.setData({ type: "FeatureCollection", features });
  }
  placeLabels(map, labels, look);
  frame = moving || breathing ? requestAnimationFrame(() => draw(map)) : 0;
}

// The dots fade out over the zoom the labels grow in, as much as they are seen otherwise.
function fadingOut(): ExpressionSpecification {
  return [
    "interpolate",
    ["linear"],
    ["zoom"],
    LABEL_MIN_ZOOM - BLEND,
    ["get", "seen"],
    LABEL_MIN_ZOOM,
    0,
  ];
}

const clamp = (value: number) => Math.max(0, Math.min(1, value));
const easeOut = (t: number) => 1 - (1 - t) ** 3;

// How big the labels are at this zoom: they grow a little as the map comes closer.
function labelSize(zoom: number) {
  const t = Math.max(0, Math.min(1, (zoom - LABEL_MIN_ZOOM) / (17 - LABEL_MIN_ZOOM)));
  return LABEL_SCALE[0] + (LABEL_SCALE[1] - LABEL_SCALE[0]) * t;
}

// Whether a point is on the screen or just beyond its edge. Only those get a label: an element
// the eye cannot see still costs the page to move.
function onScreen(map: MapLibreMap) {
  const bounds = map.getBounds();
  const margin = 0.2 * (bounds.getEast() - bounds.getWest());
  const [west, east] = [bounds.getWest() - margin, bounds.getEast() + margin];
  const [south, north] = [bounds.getSouth() - margin, bounds.getNorth() + margin];
  return ([lon, lat]: Point) => lon > west && lon < east && lat > south && lat < north;
}

// How far a dot has grown into its size: from nothing to a little over it and back, so that a
// vehicle arrives rather than switches on. Everything is simply there for a user who asked
// their system for less motion.
function popped(dot: Dot, now: number, moves: boolean) {
  if (!moves) return 1;
  const t = (now - dot.born) / POP_MS;
  if (t >= 1) return 1;
  if (t <= 0) return 0;
  const back = 1.7; // how far past its size it goes before it settles
  return 1 + (back + 1) * (t - 1) ** 3 + back * (t - 1) ** 2;
}

// One vehicle as the map takes it: where it is, what colour it is, and how far it has grown and
// how wide its halo stands at this moment.
function dotFeature(dot: Dot, at: Point, pop: number, breath: number) {
  return {
    type: "Feature" as const,
    properties: {
      id: dot.vehicle.id,
      color: dot.color,
      // the halo grows as it fades, so that a breath reads as a ping and not as a throb
      halo: pop * (1 + PULSE_GROWTH * breath),
      fade: Math.min(1, pop) * HALO_OPACITY * (1 - 0.7 * breath),
      pop,
      seen: Math.min(1, pop), // how much of it to show while it is still arriving
    },
    geometry: { type: "Point" as const, coordinates: at },
  };
}

// Moves a dot along its route with its vehicle, at a speed of its own that follows the
// vehicle's and makes up any difference between the two, changing gently, never backwards.
// Off any route it eases towards where the vehicle was last seen. For someone who asked for
// less motion it simply stands where its vehicle was last seen. Tells whether the dot still
// has somewhere to go.
function chase(dot: Dot, clock: number, seconds: number, still: boolean): boolean {
  const { motion } = dot;
  if (still) {
    dot.shown = motion.at;
    dot.point = pointOn(motion, motion.at);
    return false;
  }
  if (motion.route) {
    const target = expectedAt(motion, clock);
    // how fast the vehicle itself should be going, and how fast to make up the difference
    const driving = seconds > 0 ? (target - dot.target) / seconds : 0;
    dot.target = target;
    const difference = (target - dot.shown) / CORRECT_S;
    const making = Math.max(-MAX_CORRECTION, Math.min(MAX_CORRECTION, difference));
    const wanted = Math.max(0, driving + making); // never backwards
    dot.speed += (wanted - dot.speed) * (1 - Math.exp(-seconds / RAMP_S));
    dot.shown += dot.speed * seconds;
    dot.point = pointOn(motion, dot.shown);
    return dot.speed > 0.05 || driving > 0 || Math.abs(target - dot.shown) > 0.3;
  }
  const share = 1 - Math.exp(-seconds / CORRECT_S);
  const [lon, lat] = dot.point;
  const [toLon, toLat] = motion.point;
  dot.point = [lon + (toLon - lon) * share, lat + (toLat - lat) * share];
  return metersBetween(dot.point, motion.point) > 0.3;
}
