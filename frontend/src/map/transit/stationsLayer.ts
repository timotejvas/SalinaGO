// All stations as grey dots. A click on a station opens it: a white dot marks it, the app is
// told (onStationChange) and shows it in the panel, and every route through it grows out of it
// on the map (routesLayer.ts), until it is closed - by a click elsewhere on the map, or by the
// app (closeStation).
// It is given the stations (see logic/timetable/stations.ts) and a way to ask for the routes
// through a station.

import type { ExpressionSpecification, GeoJSONSource, Map as MapLibreMap } from "maplibre-gl";
import type { MapStation } from "../../logic/timetable/stations";
import { MIN_ZOOM } from "../settings";
import { isTouch, lessMotion } from "../../screen";
import { clearRoutes, growRoutesFrom, type Route } from "./routesLayer";

// ---------- settings ----------
const COLOR = "#696974";
const SIZE = [1.5, 5]; // dot radius at the smallest zoom of the map and at zoom 16
const DIMMED_OPACITY = 0.15; // while the stations of a line are highlighted
// how far from a station a click still opens it: further for a finger, which is wider than a
// cursor and covers what it taps
const HIT_RADIUS = isTouch() ? 22 : 14;
const OPEN_SIZE = [5, 10]; // the open station's dot, at zoom 11 and 16
const OPEN_IN_MS = 250; // how quickly it fades in
// ------------------------------

const SOURCE_ID = "stations";
const DOTS_ID = "stations-dots";
const HIT_AREA_ID = "stations-hit-area";
const OPEN_ID = "station-open"; // the station that is open, as a white dot

// The app has one map, and one station open on it at most.
let openMap: MapLibreMap | null = null;
let opening: number | undefined; // the white dot fading in
let changed: (station: MapStation | null) => void = () => {};
let clickable = true; // whether a click on a station opens it
// This file keeps what is on the map in variables of its own; a change to it reloads the page
// while the app is developed (see vehiclesLayer.ts).
import.meta.hot?.accept(() => location.reload());

// Whether a click on a station opens it: not while a journey, a line or a vehicle is open - a
// station would then stand in front of what you are looking at.
export function setStationsClickable(on: boolean) {
  clickable = on;
}

// What the app is told when a station is opened, and closed (null).
export function onStationChange(handler: (station: MapStation | null) => void) {
  changed = handler;
}

// Closes the station that is open, if one is: its routes go, and the app is told.
export function closeStation() {
  if (!openMap) return;
  clearRoutes(openMap);
  markOpen(openMap, null);
  openMap = null;
  changed(null);
}

// Adds the grey dots, and what a click on one of them does.
export function addStations(
  map: MapLibreMap,
  stations: MapStation[],
  routesAt: (id: string) => Route[],
) {
  map.addSource(SOURCE_ID, {
    type: "geojson",
    data: {
      type: "FeatureCollection",
      features: stations.map((station, index) => ({
        type: "Feature" as const,
        properties: { index }, // a click finds the station by its position in the list
        geometry: { type: "Point" as const, coordinates: [station.lon, station.lat] },
      })),
    },
  });

  map.addLayer({
    id: DOTS_ID,
    type: "circle",
    source: SOURCE_ID,
    paint: {
      "circle-color": COLOR,
      "circle-radius": ["interpolate", ["linear"], ["zoom"], MIN_ZOOM, SIZE[0], 16, SIZE[1]],
    },
  });

  // the station that is open: a white dot with a soft glow, bigger than the grey ones
  map.addSource(OPEN_ID, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
  // (a zoom curve has to stand alone, so the glow has one of its own)
  const openRadius = (scale: number): ExpressionSpecification => [
    "interpolate",
    ["linear"],
    ["zoom"],
    11,
    OPEN_SIZE[0] * scale,
    16,
    OPEN_SIZE[1] * scale,
  ];
  map.addLayer({
    id: `${OPEN_ID}-glow`,
    type: "circle",
    source: OPEN_ID,
    paint: {
      "circle-color": "#ffffff",
      "circle-radius": openRadius(2.2),
      "circle-blur": 1,
      "circle-opacity": 0.35,
      "circle-opacity-transition": { duration: 0, delay: 0 }, // markOpen fades it frame by frame
    },
  });
  map.addLayer({
    id: OPEN_ID,
    type: "circle",
    source: OPEN_ID,
    paint: {
      "circle-color": "#ffffff",
      "circle-radius": openRadius(1),
      "circle-stroke-color": "#1c1c22",
      "circle-stroke-width": 2,
      "circle-opacity-transition": { duration: 0, delay: 0 }, // markOpen fades it frame by frame
      "circle-stroke-opacity-transition": { duration: 0, delay: 0 },
    },
  });

  // invisible bigger circles, so that a station is easy to click
  map.addLayer({
    id: HIT_AREA_ID,
    type: "circle",
    source: SOURCE_ID,
    paint: { "circle-radius": HIT_RADIUS, "circle-opacity": 0 },
  });

  map.on("click", (event) => {
    const [feature] = clickable
      ? map.queryRenderedFeatures(event.point, { layers: [HIT_AREA_ID] })
      : [];
    // a click anywhere else on the map closes the station
    if (!feature || feature.geometry.type !== "Point") return closeStation();
    const station = stations[feature.properties.index as number];
    openMap = map;
    markOpen(map, station);
    changed(station);
    growRoutesFrom(map, [station.lon, station.lat], routesAt(station.id));
  });
  map.on("mouseenter", HIT_AREA_ID, () => {
    if (clickable) map.getCanvas().style.cursor = "pointer";
  });
  map.on("mouseleave", HIT_AREA_ID, () => (map.getCanvas().style.cursor = ""));
}

// Puts the white dot on the station that is open (null takes it off), fading it in.
function markOpen(map: MapLibreMap, station: MapStation | null) {
  map.getSource<GeoJSONSource>(OPEN_ID)?.setData({
    type: "FeatureCollection",
    features: station
      ? [
          {
            type: "Feature",
            properties: {},
            geometry: { type: "Point", coordinates: [station.lon, station.lat] },
          },
        ]
      : [],
  });
  if (opening !== undefined) cancelAnimationFrame(opening);
  const fade = (share: number) => {
    map.setPaintProperty(`${OPEN_ID}-glow`, "circle-opacity", 0.35 * share);
    map.setPaintProperty(OPEN_ID, "circle-opacity", share);
    map.setPaintProperty(OPEN_ID, "circle-stroke-opacity", share);
  };
  if (!station || lessMotion()) return fade(1);
  const started = performance.now();
  const frame = () => {
    const done = Math.min(1, (performance.now() - started) / OPEN_IN_MS);
    fade(1 - (1 - done) ** 3); // eased out
    opening = done < 1 ? requestAnimationFrame(frame) : undefined;
  };
  fade(0);
  opening = requestAnimationFrame(frame);
}

// Fades the grey dots, so that highlighted stations stand out (see highlightLayer.ts); or
// takes them off altogether while a journey is picked, whose own stops are all that matter
// then and which a grey dot a few metres beside its stop only muddles (hideStations).
let dimmed = false;
let hidden = false;
export function dimStations(map: MapLibreMap, dim: boolean) {
  dimmed = dim;
  showDots(map);
}
export function hideStations(map: MapLibreMap, hide: boolean) {
  hidden = hide;
  showDots(map);
}
function showDots(map: MapLibreMap) {
  const opacity = hidden ? 0 : dimmed ? DIMMED_OPACITY : 1;
  map.setPaintProperty(DOTS_ID, "circle-opacity", opacity);
}
