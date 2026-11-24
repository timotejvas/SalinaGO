// Settings of the map: the basemap, where it opens, how far it may be moved and at what
// angle it is seen. The colours the lines are drawn in are in src/colors.ts, because the
// panel draws in them too.

// dark basemap by CARTO (its own attribution is added by the style)
export const MAP_STYLE = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

// the map cannot be moved outside of Brno: [west, south], [east, north]
export const BRNO_BOUNDS: [[number, number], [number, number]] = [
  [16.4, 49.08],
  [16.8, 49.32],
];
// the transit data is CC BY 4.0, which requires naming the source on the map
export const DATA_ATTRIBUTION =
  'Data: <a href="https://kordis-jmk.cz/" target="_blank" rel="noopener noreferrer">KORDIS JMK</a>, ' +
  '<a href="https://data.brno.cz/" target="_blank" rel="noopener noreferrer">data.brno.cz</a> (CC BY 4.0)';

export const BRNO_CENTER: [number, number] = [16.6068, 49.1951]; // [lon, lat]
export const DEFAULT_ZOOM = 14.5;

// how far the user can zoom out; low enough to show a whole line on a phone
export const MIN_ZOOM = 11;
export const MAX_ZOOM = 18; // how far the user can zoom in

export const DEFAULT_PITCH = 55; // view angle (0 = from top, max 60)
export const DEFAULT_BEARING = -15; // map rotation
