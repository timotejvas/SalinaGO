// A highlighted route on top of the map: a colored line with the stations as dots with names.
// Under it, thinner and fainter, the other routes of the same line (short-turns, depot trips),
// or the one you ride carrying on beyond your part.
// The route draws itself from where you get on to where you get off, and every stop appears
// as the line reaches it, so that you can see which way it goes without reading anything.
// It knows nothing about lines or timetables; it is given stations, routes and a color.
// Moving the camera to what it draws is in map/camera.ts.

import type { Map as MapLibreMap, GeoJSONSource } from "maplibre-gl";
import { metersBetween } from "../../logic/live/track";
import { lessMotion } from "../../screen";
import { dimStations } from "./stationsLayer";
import { labelFont } from "../labelFont";

// ---------- settings ----------
const LABEL_MIN_ZOOM = 12; // names appear from this zoom
const OTHERS_OPACITY = 0.4; // the other routes of the line, under the main one
// where the line you ride carries on beyond your part: fainter still, because it crosses the
// whole city and is only there to say where the line comes from and where it goes
const CARRY_ON_OPACITY = 0.18;
// the main route is this wide, at zoom 11 and at zoom 16; the routes under it are thinner,
// unless they carry on where the main one ends, where a change of width would read as a cut
const WIDE = [2.5, 6];
const THIN = [1.5, 3.5];
const DRAW_MS = 1500; // the line grows from one end to the other in this time
// ------------------------------

const SOURCE_ID = "highlight"; // the lines, redrawn every frame while one draws itself
const STOPS_ID = "highlight-stops"; // the stops, which stand still while it does
const OTHERS_ID = "highlight-others";
const OTHERS_DOTS_ID = "highlight-others-dots";
const OTHERS_LABELS_ID = "highlight-others-labels";
const LINE_ID = "highlight-line";
const WALK_ID = "highlight-walk";
const DOTS_ID = "highlight-dots";
const LABELS_ID = "highlight-labels";

// The part of a station this file needs.
export type HighlightStation = { name: string; lon: number; lat: number };

// Adds the (empty) highlight layers. Call after addStations, so that they are drawn on top.
export function addHighlight(map: MapLibreMap) {
  const empty = { type: "FeatureCollection" as const, features: [] };
  map.addSource(SOURCE_ID, { type: "geojson", data: empty });
  // The stops of a highlighted route are all there from the first frame and do not move, but
  // their names are symbols, and the map lays every symbol of a source out again whenever that
  // source changes - twenty milliseconds, sixty times over, for names that never moved. They
  // have a source of their own, which is written once when the route changes.
  map.addSource(STOPS_ID, { type: "geojson", data: empty });
  map.addSource(OTHERS_ID, { type: "geojson", data: { type: "FeatureCollection", features: [] } });

  // the other routes first, so that the main route is drawn over them
  map.addLayer({
    id: OTHERS_ID,
    type: "line",
    source: OTHERS_ID,
    filter: ["==", ["geometry-type"], "LineString"],
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": ["get", "color"],
      "line-opacity": ["case", ["==", ["get", "wide"], true], CARRY_ON_OPACITY, OTHERS_OPACITY],
      "line-width": [
        "interpolate",
        ["linear"],
        ["zoom"],
        11,
        ["case", ["==", ["get", "wide"], true], WIDE[0], THIN[0]],
        16,
        ["case", ["==", ["get", "wide"], true], WIDE[1], THIN[1]],
      ],
    },
  });

  map.addLayer({
    id: OTHERS_DOTS_ID,
    type: "circle",
    source: OTHERS_ID,
    filter: ["==", ["geometry-type"], "Point"],
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 2.5, 16, 6],
      "circle-color": ["get", "color"],
      "circle-opacity": OTHERS_OPACITY,
      "circle-stroke-color": "#ffffff",
      "circle-stroke-width": 1.5,
      "circle-stroke-opacity": OTHERS_OPACITY,
    },
  });
  map.addLayer({
    id: OTHERS_LABELS_ID,
    type: "symbol",
    source: OTHERS_ID,
    filter: ["==", ["geometry-type"], "Point"],
    minzoom: LABEL_MIN_ZOOM,
    layout: {
      "text-field": ["get", "name"],
      "text-font": labelFont(map),
      "text-size": 11,
      "text-offset": [0, 1.1],
      "text-anchor": "top",
      "text-optional": true,
    },
    paint: {
      "text-color": "#9a9aa6",
      "text-halo-color": "#000000",
      "text-halo-width": 1.5,
    },
  });
  map.addLayer({
    id: LINE_ID,
    type: "line",
    source: SOURCE_ID,
    filter: ["all", ["==", ["geometry-type"], "LineString"], ["!=", ["get", "walk"], true]],
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": ["get", "color"],
      "line-width": ["interpolate", ["linear"], ["zoom"], 11, WIDE[0], 16, WIDE[1]],
    },
  });

  // the piece you walk: dashed, because it is not a route but a way between two stations
  map.addLayer({
    id: WALK_ID,
    type: "line",
    source: SOURCE_ID,
    filter: ["all", ["==", ["geometry-type"], "LineString"], ["==", ["get", "walk"], true]],
    layout: { "line-cap": "round" },
    paint: {
      "line-color": ["get", "color"],
      "line-width": ["interpolate", ["linear"], ["zoom"], 11, 2, 16, 4],
      "line-dasharray": [1, 1.6],
    },
  });
  map.addLayer({
    id: DOTS_ID,
    type: "circle",
    source: STOPS_ID,
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 3.5, 16, 8],
      "circle-color": ["get", "color"],
      "circle-stroke-color": "#ffffff",
      "circle-stroke-width": 2,
    },
  });
  map.addLayer({
    id: LABELS_ID,
    type: "symbol",
    source: STOPS_ID,
    minzoom: LABEL_MIN_ZOOM,
    layout: {
      "text-field": ["get", "name"],
      "text-font": labelFont(map),
      "text-size": 12,
      "text-offset": [0, 1.1],
      "text-anchor": "top",
      "text-optional": true,
    },
    paint: {
      "text-color": "#ffffff",
      "text-halo-color": "#000000",
      "text-halo-width": 1.5,
    },
  });
}

// One piece of what is highlighted: stations and the route between them, in one colour.
// A journey gives one part per leg, so that it changes colour where you change.
export type HighlightPart = {
  stations: HighlightStation[];
  path?: [number, number][];
  color?: string;
  walk?: boolean; // a piece you walk: drawn dashed, with no stops of its own
  // only under the highlighted route: as wide as it, for a route that carries on where it
  // ends, so that the line only grows dim and does not look cut off
  wide?: boolean;
};

// Highlights the given stations and the route between them ([lon, lat] points; optional).
// An empty list clears the highlight.
export function setHighlight(
  map: MapLibreMap,
  stations: HighlightStation[],
  color = "#ffffff",
  path: [number, number][] = [],
) {
  setHighlightParts(map, stations.length > 0 ? [{ stations, path, color }] : []);
}

// What is on the map now and the animation drawing it, so that the same route is not drawn
// again when the panel asks for it a second time, and a new one replaces the one being drawn.
// This file keeps what is on the map in variables of its own, which a hot update while the app
// is developed would start again from nothing next to the old ones still drawing - the live
// vehicles blinking between two copies of themselves. A change to it, or to anything it uses,
// reloads the page instead.
import.meta.hot?.accept(() => location.reload());
let shown = "";
let drawing: number | undefined;

// Highlights several pieces at once, each in its own colour. Empty parts clear the highlight.
// The stops appear at once and the line between them draws itself from one end to the other;
// the parts are drawn in the order they are given, so that a journey draws leg after leg.
export function setHighlightParts(map: MapLibreMap, parts: HighlightPart[]) {
  const source = map.getSource<GeoJSONSource>(SOURCE_ID);
  if (!source) return;
  const asked = nameOf(parts);
  if (asked === shown) return; // the same thing is already there, drawn or still drawing
  shown = asked;
  if (drawing !== undefined) cancelAnimationFrame(drawing);
  dimStations(map, parts.length > 0);

  // the stops, once: they are all there from the first frame and do not move
  map.getSource<GeoJSONSource>(STOPS_ID)?.setData({
    type: "FeatureCollection",
    features: stopsOf(parts),
  });

  const measured = parts.map(measure);
  const whole = lessMotion() ? 0 : measured.reduce((all, part) => all + part.length, 0);
  if (whole === 0) {
    draw(source, parts); // nothing to draw along, or a user who asked for less motion
    return;
  }

  const started = performance.now();
  const step = () => {
    const done = Math.min(1, (performance.now() - started) / DRAW_MS);
    draw(source, grown(parts, measured, (1 - (1 - done) ** 3) * whole)); // slowing towards the end
    drawing = done < 1 ? requestAnimationFrame(step) : undefined;
  };
  step();
}

function draw(source: GeoJSONSource, parts: HighlightPart[]) {
  source.setData({ type: "FeatureCollection", features: featuresOf(parts) });
}

// What the parts are, shortly: enough to tell one route from another without comparing them
// point by point.
function nameOf(parts: HighlightPart[]) {
  return parts
    .map((part) =>
      [
        part.color,
        part.walk,
        part.wide,
        part.stations.length,
        part.path?.length,
        part.path?.[0],
        part.path?.[part.path.length - 1],
      ].join(","),
    )
    .join(";");
}

// How far along a part each of its points lies, and how long the part is, so that the drawing
// knows where it has got to. Measured once, not every frame.
function measure(part: HighlightPart) {
  const path = part.path ?? [];
  const steps = [0];
  for (let i = 1; i < path.length; i++)
    steps.push(steps[i - 1] + metersBetween(path[i - 1], path[i]));
  return { steps, length: steps[steps.length - 1] ?? 0 };
}

// The parts as far as they are drawn: the ones before `reach` whole, the one it is in cut at
// that point, the rest without a line yet. The stops are all there from the first frame - you
// want to see where the line goes at once; what is worth watching is the line finding its way
// between them.
function grown(
  parts: HighlightPart[],
  measured: ReturnType<typeof measure>[],
  reach: number,
): HighlightPart[] {
  let before = 0;
  return parts.map((part, i) => {
    const { steps, length } = measured[i];
    const into = reach - before;
    before += length;
    if (into >= length) return part;
    if (into <= 0) return { ...part, path: [] };
    const path = part.path ?? [];
    return {
      ...part,
      path: [...path.filter((_, point) => steps[point] <= into), pointAt(path, steps, into)],
    };
  });
}

// The point this far along a path, between two of its points, so that the line grows evenly
// and not corner by corner.
function pointAt(path: [number, number][], steps: number[], reach: number): [number, number] {
  const next = steps.findIndex((step) => step > reach);
  if (next <= 0) return path[0];
  const span = steps[next] - steps[next - 1];
  const over = span === 0 ? 0 : (reach - steps[next - 1]) / span;
  const [fromLon, fromLat] = path[next - 1];
  const [toLon, toLat] = path[next];
  return [fromLon + (toLon - fromLon) * over, fromLat + (toLat - fromLat) * over];
}

// The routes and stations of parts, as the map draws them.
function featuresOf(parts: HighlightPart[]) {
  return parts.flatMap(({ path = [], color = "#ffffff", walk = false, wide = false }) =>
    path.length > 1
      ? [
          {
            type: "Feature" as const,
            properties: { color, walk, wide },
            geometry: { type: "LineString" as const, coordinates: path },
          },
        ]
      : [],
  );
}

// The stops of the parts, as the map draws them.
function stopsOf(parts: HighlightPart[]) {
  return parts.flatMap(({ stations, color = "#ffffff" }) =>
    stations.map((station) => ({
      type: "Feature" as const,
      properties: { name: station.name, color },
      geometry: { type: "Point" as const, coordinates: [station.lon, station.lat] },
    })),
  );
}

// Draws routes and stations under the highlighted one, thinner and fainter: the other routes
// of a line, or the whole routes of the lines of a journey, of which you only ride a part.
// Empty parts clear them.
export function setOtherRoutes(map: MapLibreMap, parts: HighlightPart[]) {
  // their lines and their stops together: these are not drawn growing, so one source is enough
  map.getSource<GeoJSONSource>(OTHERS_ID)?.setData({
    type: "FeatureCollection",
    features: [...featuresOf(parts), ...stopsOf(parts)],
  });
}
