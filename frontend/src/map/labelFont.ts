// The font for our labels on the map.

import type { Map as MapLibreMap } from "maplibre-gl";

// Uses the font of an existing label of the basemap, so that we don't guess one it lacks.
export function labelFont(map: MapLibreMap): string[] {
  for (const layer of map.getStyle().layers) {
    if (layer.type !== "symbol") continue;
    const font = layer.layout?.["text-font"];
    if (Array.isArray(font)) return font as string[];
  }
  return ["Open Sans Regular"];
}
