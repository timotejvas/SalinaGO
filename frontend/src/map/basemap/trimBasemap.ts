// Hides the parts of the basemap we don't need. The style shows the whole world, but we
// only want Brno: no far-away towns, countries or borders. Streets and districts stay.

import type { Map as MapLibreMap } from "maplibre-gl";

// ---------- settings ----------
// layers of the CARTO "dark-matter" style that are hidden
const LAYERS_TO_HIDE = [
  // names of settlements outside the city
  "place_hamlet",
  "place_villages",
  "place_town",
  "place_city_r6",
  "place_city_r5",
  "place_city_dot_r7",
  "place_city_dot_r4",
  "place_city_dot_r2",
  "place_city_dot_z7",
  "place_capital_dot_z7",

  // names of regions, countries and continents
  "place_state",
  "place_country_1",
  "place_country_2",
  "place_continent",

  // administrative borders
  "boundary_county",
  "boundary_state",
  "boundary_country_outline",
  "boundary_country_inner",
];
// ------------------------------

// Hides the layers listed above. Call once, after the map has loaded.
export function trimBasemap(map: MapLibreMap) {
  for (const id of LAYERS_TO_HIDE) {
    // the check protects against layers that the style does not contain
    if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", "none");
  }
}
