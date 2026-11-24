// Creates the MapLibre map with the settings from settings.ts.

import { Map as MapLibreMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import "./setupMapLibre"; // sets the worker URL, must be imported before creating a map
import {
  MAP_STYLE,
  BRNO_CENTER,
  DEFAULT_ZOOM,
  DEFAULT_PITCH,
  DEFAULT_BEARING,
  BRNO_BOUNDS,
  DATA_ATTRIBUTION,
  MIN_ZOOM,
  MAX_ZOOM,
} from "./settings";
import { isPhone } from "../screen";

const FOLD_MS = 5000; // how long the credits stay open on a phone after a tap on the (i)

// Creates the map with the dark basemap only. The layers are added by setupLayers.ts.
export function createMap(container: HTMLElement): MapLibreMap {
  const map = new MapLibreMap({
    container,
    style: MAP_STYLE,
    center: BRNO_CENTER,
    zoom: DEFAULT_ZOOM,
    pitch: DEFAULT_PITCH,
    bearing: DEFAULT_BEARING,
    maxBounds: BRNO_BOUNDS,
    minZoom: MIN_ZOOM,
    maxZoom: MAX_ZOOM,
    // the credits are shown in full when the map opens, and fold into the usual (i) as soon as
    // you move the map - the way the OpenStreetMap attribution guidelines allow - so that a
    // line of text does not lie across the map for good; a tap on the (i) opens them again
    attributionControl: { customAttribution: DATA_ATTRIBUTION, compact: true },
  });
  // on a phone there is no room for them even at first: folded from the start, there under
  // the (i). A tap on it opens them, and they fold again by themselves after a while, as they
  // do when the map is moved.
  map.once("load", () => {
    if (!isPhone()) return;
    const credits = container.querySelector(".maplibregl-ctrl-attrib");
    credits?.classList.remove("maplibregl-compact-show");
    let fold: number | undefined;
    credits?.addEventListener("click", () => {
      clearTimeout(fold);
      fold = window.setTimeout(() => credits.classList.remove("maplibregl-compact-show"), FOLD_MS);
    });
  });
  return map;
}
