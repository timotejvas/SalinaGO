// Where a journey starts and ends: the two stations marked with a ring and their names written
// above them, while you choose where you are going. Once a route is drawn from one to the other,
// its own stops say exactly where you get on and off - the platform, not the whole station - so
// the rings fade away and the names are left to the route (the highlight layer writes them under
// its stops; written above, the two never sit on top of each other).
// It is given the two places; it knows nothing about lines or the timetable.

import type { GeoJSONSource, Map as MapLibreMap } from "maplibre-gl";
import { labelFont } from "../labelFont";

// ---------- settings ----------
const COLOR = "#ffffff";
const RING_FADE_MS = 400;
// ------------------------------

const SOURCE_ID = "journey";
const RINGS_ID = "journey-rings";
const NAMES_ID = "journey-names";

// A place a journey starts or ends at.
export type JourneyEnd = { name: string; lon: number; lat: number };

// Adds the (empty) layer of a journey. Call after addHighlight, so that the names are written
// over the route, and before addVehicles, so that the vehicles stay on top.
export function addJourney(map: MapLibreMap) {
  map.addSource(SOURCE_ID, { type: "geojson", data: { type: "FeatureCollection", features: [] } });

  map.addLayer({
    id: RINGS_ID,
    type: "circle",
    source: SOURCE_ID,
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 11, 7, 16, 12],
      "circle-color": COLOR,
      "circle-opacity": 0.15,
      "circle-stroke-color": COLOR,
      "circle-stroke-width": 2,
      "circle-opacity-transition": { duration: RING_FADE_MS },
      "circle-stroke-opacity-transition": { duration: RING_FADE_MS },
    },
  });

  map.addLayer({
    id: NAMES_ID,
    type: "symbol",
    source: SOURCE_ID,
    layout: {
      "text-field": ["get", "name"],
      "text-font": labelFont(map),
      "text-size": ["interpolate", ["linear"], ["zoom"], 11, 11, 16, 14],
      "text-offset": [0, -0.9],
      "text-anchor": "bottom",
      // the ends of a journey are always worth reading, whatever else is written there
      "text-allow-overlap": true,
      "text-ignore-placement": true,
    },
    paint: {
      "text-color": COLOR,
      "text-halo-color": "#101016",
      "text-halo-width": 2,
    },
  });
}

// Shows where the journey starts and ends. Either of them may be missing. While a route is
// drawn (`marked` false) the rings fade out and the names are left off: the route shows its own
// stops, and writes the name of every one of them.
export function setJourneyEnds(
  map: MapLibreMap,
  from: JourneyEnd | null,
  to: JourneyEnd | null,
  marked = true,
) {
  if (map.getLayer(RINGS_ID)) {
    map.setPaintProperty(RINGS_ID, "circle-opacity", marked ? 0.15 : 0);
    map.setPaintProperty(RINGS_ID, "circle-stroke-opacity", marked ? 1 : 0);
  }
  const ends = [from, to].filter((end) => end !== null);
  map.getSource<GeoJSONSource>(SOURCE_ID)?.setData({
    type: "FeatureCollection",
    features: ends.map((end) => ({
      type: "Feature" as const,
      properties: { name: marked ? end.name : "" },
      geometry: { type: "Point" as const, coordinates: [end.lon, end.lat] },
    })),
  });
}
