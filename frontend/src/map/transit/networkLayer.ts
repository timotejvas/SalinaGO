// Draws the network of all lines as a faint background. It is given the routes as lists of
// [lon, lat] points (see networkPaths in logic/timetable/lines.ts), so it always matches the timetable.

import type { Map as MapLibreMap } from "maplibre-gl";

// ---------- settings ----------
const COLOR = "#2e2e3a";
// 1 = solid; lower would show where routes overlap as brighter lines
const OPACITY = 1;
const WIDTH = [0.8, 2.5]; // line width at zoom 10 and at zoom 16
// ------------------------------

// Adds the network as one line layer made of the given routes.
export function addNetwork(map: MapLibreMap, routes: [number, number][][]) {
  map.addSource("network", {
    type: "geojson",
    data: {
      type: "Feature",
      properties: {},
      geometry: { type: "MultiLineString", coordinates: routes },
    },
  });

  map.addLayer({
    id: "network",
    type: "line",
    source: "network",
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": COLOR,
      "line-opacity": OPACITY,
      "line-width": ["interpolate", ["linear"], ["zoom"], 10, WIDTH[0], 16, WIDTH[1]],
    },
  });
}
