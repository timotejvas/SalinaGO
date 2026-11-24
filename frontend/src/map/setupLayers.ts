// Puts the data on the map: adds all layers in drawing order.
// The data itself is loaded by App and handed over by hooks/MapView.tsx.

import type { Map as MapLibreMap } from "maplibre-gl";
import type { TransitData } from "../logic/timetable/loadData";
import { mapStations } from "../logic/timetable/stations";
import { networkPaths } from "../logic/timetable/lines";
import { lineColor } from "../colors";
import { nextAtStation } from "../logic/timetable/departures";
import { brnoNow } from "../logic/timetable/clock";
import { trimBasemap } from "./basemap/trimBasemap";
import { addBuildings3D } from "./basemap/buildings3D";
import { addNetwork } from "./transit/networkLayer";
import { addRoutes } from "./transit/routesLayer";
import { addStations } from "./transit/stationsLayer";
import { addHighlight } from "./transit/highlightLayer";
import { addJourney } from "./transit/journeyLayer";
import { addVehicles } from "./transit/vehiclesLayer";

// Adds all layers, in drawing order (the first one is at the bottom).
// Call once, after the map has loaded its style.
export function setupLayers(map: MapLibreMap, transit: TransitData) {
  trimBasemap(map);
  addBuildings3D(map);
  addNetwork(map, networkPaths(transit));
  addRoutes(map); // under the stations
  addStations(
    map,
    mapStations(transit),
    // the routes through a station, each in the colour of its line
    (id) =>
      transit.variants
        .filter(
          (variant) =>
            variant.path &&
            variant.stops.includes(id) &&
            // only a route that leaves from there in the days ahead: not a diversion of a few
            // days a year (the same as the panel lists, logic/timetable/departures.ts)
            nextAtStation(transit, [variant], id, brnoNow(), 1).length > 0,
        )
        .map((variant) => ({
          path: variant.path ?? [],
          color: lineColor(transit, variant.kind, variant.line),
        })),
  );
  addHighlight(map);
  addJourney(map);
  addVehicles(map);
}
