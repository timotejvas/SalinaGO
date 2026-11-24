// Moving the camera: its entrance when the app opens, then to everything a line or a journey
// covers, or to one station. A panel lies over the map, so the camera is told how much room to
// keep free for it.
// It is given places, nothing more; what is drawn there is map/transit's business.

import type { Map as MapLibreMap } from "maplibre-gl";
import { DEFAULT_PITCH } from "./settings";
import { lessMotion } from "../screen";

// ---------- settings ----------
const FIT_PADDING = 48; // free space around the places when the camera moves to them
const FOCUS_ZOOM = 15.5; // the zoom at least, when the camera moves to one place
const FIT_MS = 1200; // how long the camera takes
const FOCUS_MS = 900;
const ARRIVE_MS = 1800; // the entrance, while the loading screen fades
const ARRIVE_BACK = 0.8; // how much further out the city lies before it comes to meet you
// ------------------------------

// The room a panel takes over the map, in pixels.
export type Space = { left: number; top: number; bottom: number };
const NO_SPACE: Space = { left: 0, top: 0, bottom: 0 };

// The map's entrance: Brno lies flat and a little further away, then it tilts up and comes
// closer. Called once, when everything is loaded and the loading screen starts to fade, so
// what you see first is the city standing up rather than a map that was already there.
// The city comes to stand in the middle of the room the panel leaves - on a phone, above the
// sheet.
export function arrive(map: MapLibreMap, space = NO_SPACE) {
  const zoom = map.getZoom();
  const middle = {
    center: map.getCenter(),
    offset: [space.left / 2, -space.bottom / 2] as [number, number],
  };
  if (lessMotion()) return map.jumpTo({ ...middle, zoom });
  map.jumpTo({ zoom: zoom - ARRIVE_BACK, pitch: 0 });
  map.easeTo({ ...middle, zoom, pitch: DEFAULT_PITCH, duration: ARRIVE_MS, essential: true });
}

// A place on the map: a station, a stop of a route, either end of a journey.
export type Place = { lon: number; lat: number };

// The map is tilted, and the camera fits the places as if it were not: near the bottom, where
// a tilted map shows less, places at the sides came out at the very edge, their names cut off.
// On a narrow screen, where that is most of the width, the sides get this much more room.
const sides = (map: MapLibreMap) => (map.getContainer().clientWidth < 600 ? 32 : 0);

// The room a panel takes, as no more than leaves the map some of its own: a camera told to
// keep more free than the map has does not move at all - on a phone, with the sheet pulled up
// over most of the screen, that was every move.
const MIN_FREE = 0.35; // of the map's height and width, at the least
function fitting(map: MapLibreMap, space: Space): Space {
  const { clientWidth: width, clientHeight: height } = map.getContainer();
  return {
    left: Math.min(space.left, width * (1 - MIN_FREE) - 2 * FIT_PADDING),
    top: space.top,
    bottom: Math.max(0, Math.min(space.bottom, height * (1 - MIN_FREE) - 2 * FIT_PADDING)),
  };
}

// Moves the camera so that all the given places are visible.
// `space` keeps room on the left, at the top or at the bottom for a panel over the map.
export function fitTo(map: MapLibreMap, places: Place[], room = NO_SPACE) {
  if (places.length === 0) return;
  const space = fitting(map, room);
  const lons = places.map((place) => place.lon);
  const lats = places.map((place) => place.lat);
  map.fitBounds(
    [
      [Math.min(...lons), Math.min(...lats)],
      [Math.max(...lons), Math.max(...lats)],
    ],
    {
      padding: {
        top: FIT_PADDING + space.top,
        bottom: FIT_PADDING + space.bottom,
        right: FIT_PADDING + sides(map),
        left: FIT_PADDING + space.left + sides(map),
      },
      maxZoom: 15,
      duration: FIT_MS,
    },
  );
}

// Moves the camera to one place, closer when the map is zoomed out.
// `space` as in fitTo.
export function focusOn(map: MapLibreMap, place: Place, room = NO_SPACE) {
  const space = fitting(map, room);
  map.flyTo({
    center: [place.lon, place.lat],
    zoom: Math.max(map.getZoom(), FOCUS_ZOOM),
    padding: { top: space.top, left: space.left, right: 0, bottom: space.bottom },
    duration: FOCUS_MS,
  });
}

// Moves the map, as little as it takes, when a place opened on it lies under the panel - on a
// phone the sheet covers half the map - so that it stands in the middle of the room left. The
// zoom stays as it is.
export function keepInSight(map: MapLibreMap, place: Place, space = NO_SPACE) {
  const at = map.project([place.lon, place.lat]);
  const { height } = map.getContainer().getBoundingClientRect();
  const hidden = at.x < space.left + FIT_PADDING || at.y > height - space.bottom - FIT_PADDING;
  if (!hidden) return;
  map.easeTo({
    center: [place.lon, place.lat],
    // the middle of what is left free, as an offset from the middle of the map
    offset: [space.left / 2, -space.bottom / 2],
    duration: lessMotion() ? 0 : FOCUS_MS,
  });
}
