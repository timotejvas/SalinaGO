// Creates the map, puts the timetable on it as soon as both are there, reports when it is
// ready (or failed) and removes it again.
// The map is created while the timetable is still downloading, so that the two wait for each
// other as little as possible. What is drawn is decided in map/setupLayers.ts.

import { useEffect, useRef } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";
import type { TransitData } from "../logic/timetable/loadData";
import { createMap } from "../map/createMap";
import { setupLayers } from "../map/setupLayers";

type Props = {
  transit: TransitData | null; // the timetable, once it has loaded
  onReady: (map: MapLibreMap | null) => void; // the map with its layers, or null when removed
  onError: () => void; // the map could not be drawn
};

export default function MapView({ transit, onReady, onError }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);

  // the map is created once, when the component appears, and starts loading its style at once
  useEffect(() => {
    if (!container.current) return;
    const created = createMap(container.current);
    map.current = created;
    return () => {
      map.current = null;
      onReady(null);
      created.remove();
    };
  }, []);

  // the layers can be added only once the style has loaded and the timetable is here
  useEffect(() => {
    const created = map.current;
    if (!created || !transit) return;
    let gone = false; // the component can be removed while the style is still loading

    const add = () => {
      if (gone) return;
      try {
        setupLayers(created, transit);
        onReady(created);
      } catch (error) {
        console.error("Map setup failed:", error);
        onError();
      }
    };
    if (created.isStyleLoaded()) add();
    else created.once("load", add);

    return () => {
      gone = true;
    };
  }, [transit]);

  return <div ref={container} className="map" />;
}
