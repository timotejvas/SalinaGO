// 3D buildings: the flat building outlines of the basemap raised into blocks.
// The basemap carries them from zoom 13 up; below that there are none to raise, and a house
// would be a third of a pixel wide anyway.

import type { ExpressionSpecification, Map as MapLibreMap } from "maplibre-gl";

// ---------- settings ----------
const COLOR = "#17171f"; // light enough to be seen against the ground where a building is small
const OPACITY = 1; // 1 = solid, lower = see-through
const DEFAULT_HEIGHT = 8; // height in meters when the data has none
const BUILDINGS_FROM = 13; // the basemap has building outlines from this zoom up
const SETTLE = 0.9; // the zooms over which they rise and fade in, so that none of it blinks
const SETTLED = 0.15; // how tall they are at the bottom of that, as a share of their height
// ------------------------------

// Turns the flat building outlines of the basemap into 3D blocks.
// Pull back and the basemap stops carrying the outlines at BUILDINGS_FROM, so the whole city
// would go out in one frame. Over the zoom above it the blocks sink towards the ground and
// fade as you pull back, and are already gone by the time the layer itself ends.
export function addBuildings3D(map: MapLibreMap) {
  const flat = map.getLayer("building"); // flat layer of the basemap
  if (!flat) return;

  // insert below the first label so text stays readable
  const firstLabel = map.getStyle().layers.find((l) => l.type === "symbol")?.id;

  map.addLayer(
    {
      id: "3d-buildings",
      source: flat.source, // same data as the flat layer
      "source-layer": flat.sourceLayer ?? "building",
      type: "fill-extrusion",
      minzoom: BUILDINGS_FROM,
      paint: {
        "fill-extrusion-color": COLOR,
        // a zoom is only allowed as the input of the outermost interpolate, so the height of
        // each building goes inside it, at both ends
        "fill-extrusion-opacity": [
          "interpolate",
          ["linear"],
          ["zoom"],
          BUILDINGS_FROM,
          0,
          BUILDINGS_FROM + SETTLE,
          OPACITY,
        ],
        "fill-extrusion-height": [
          "interpolate",
          ["linear"],
          ["zoom"],
          BUILDINGS_FROM,
          ["*", SETTLED, height()],
          BUILDINGS_FROM + SETTLE,
          height(),
        ],
        "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0],
      },
    },
    firstLabel,
  );

  // hide the flat versions so they don't show through the 3D blocks
  map.setLayoutProperty("building", "visibility", "none");
  if (map.getLayer("building-top")) {
    map.setLayoutProperty("building-top", "visibility", "none");
  }
}

// How tall a building is, as the basemap gives it.
function height(): ExpressionSpecification {
  return ["coalesce", ["get", "render_height"], DEFAULT_HEIGHT];
}
