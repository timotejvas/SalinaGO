// What a chosen line puts on the map, and takes off again: the route of the direction you are
// looking at, drawn in the colour of the line, and under it, faintly, the other routes of the
// same line so that every live vehicle of it stands on a drawn line. It also moves the camera
// to the route when the route changes.
// It only links what logic/timetable works out with what map/transit draws; it decides nothing.

import { useEffect } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";
import type { TransitData } from "../logic/timetable/loadData";
import { otherStops, routesOf, type Direction, type Kind } from "../logic/timetable/lines";
import { stationsOf } from "../logic/timetable/stations";
import { lineColor } from "../colors";
import { markStop, setHighlight, setOtherRoutes } from "../map/transit/highlightLayer";
import { fitTo, type Space } from "../map/camera";

type Props = {
  map: MapLibreMap;
  data: TransitData;
  kind: Kind;
  line: string;
  directions: Direction[]; // of the line, to draw its other routes under the one shown
  shownId: number | null; // the route on the map; null while the line has none
  space: () => Space; // the room the panel takes, so that the map keeps it free
  picked: { lon: number; lat: number } | null; // the stop clicked in the strip, marked on the map
  // a vehicle (or a station) is open over the line: the line steps aside, so that the route
  // ahead of the vehicle is all the map shows - the line under it would look like the part the
  // vehicle has driven was never taken away. It comes back when the card closes.
  covered: boolean;
};

export function useLineOnMap(props: Props) {
  const { map, data, kind, line, directions, shownId, space, picked, covered } = props;

  // the route itself. It depends on the id of the route only, so that the clock ticking does
  // not draw it again; taken off the map while something is open over the line.
  useEffect(() => {
    if (covered) return;
    const shown = shownId === null ? null : data.variants[shownId];
    setHighlight(
      map,
      shown ? stationsOf(data, shown) : [],
      shown ? lineColor(data, shown.kind, shown.line) : undefined,
      shown?.path,
    );
    // take the route off the map when the line is deselected or another one is chosen
    return () => setHighlight(map, []);
  }, [map, data, shownId, covered]);

  // the whole route in sight when it changes - once the panel has settled at its height: on a
  // phone the sheet goes to half the screen as the line opens. Not again when a card over the
  // line closes: the map stays where you left it.
  useEffect(() => {
    const shown = shownId === null ? null : data.variants[shownId];
    const stations = shown ? stationsOf(data, shown) : [];
    const fit = requestAnimationFrame(() => fitTo(map, stations, space()));
    return () => cancelAnimationFrame(fit);
  }, [map, data, shownId, space]);

  // the stop clicked in the strip, marked as it is picked
  const pickedLon = picked?.lon;
  const pickedLat = picked?.lat;
  useEffect(() => {
    if (covered || pickedLon === undefined || pickedLat === undefined) return;
    markStop(map, { lon: pickedLon, lat: pickedLat }, lineColor(data, kind, line));
    return () => markStop(map, null);
  }, [map, data, kind, line, pickedLon, pickedLat, covered]);

  // under it, all routes of the line with the stations only they have
  useEffect(() => {
    if (covered) return;
    const shown = shownId === null ? null : data.variants[shownId];
    const color = lineColor(data, kind, line);
    setOtherRoutes(map, [
      ...routesOf(directions).map((path) => ({ stations: [], path, color })),
      { stations: otherStops(data, directions, shown), color },
    ]);
    return () => setOtherRoutes(map, []);
  }, [map, data, directions, shownId, kind, line, covered]);
}
