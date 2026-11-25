// Keeps the live vehicles up to date: connects to the stream, hands the vehicles in service to App
// (the line panel shows them too) and draws them on the map: all of them, or only the ones it
// is given - those of a chosen line, or those going your way on a journey. It shows nothing itself.
// It connects as soon as the timetable is here, while the map may still be loading, because the
// stream sends the whole fleet every ten seconds and that wait is worth starting early.
// onLoaded is called once: when the first vehicles arrive, when the stream cannot be reached, or
// after MAX_WAIT_MS at the latest, so that the loading screen never waits for the stream for long.

import { useEffect } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";
import type { TransitData } from "../logic/timetable/loadData";
import { watchVehicles, type LiveStatus, type Vehicle } from "../logic/live/vehicles";
import { inService } from "../logic/live/trip";
import { onVehiclePick, setVehicles } from "../map/transit/vehiclesLayer";
import { lineColor } from "../colors";

// ---------- settings ----------
const MAX_WAIT_MS = 4_000; // the longest the loading screen waits for the vehicles
// ------------------------------

type Props = {
  map: MapLibreMap | null; // the map, once it has its layers; the stream does not wait for it
  data: TransitData;
  shown: Vehicle[] | null; // the vehicles to draw brightly, null for all of them
  // whether the map is to be seen: under the loading screen they are not drawn yet, so that
  // they appear - each growing into its place - the moment it fades, not behind it
  revealed: boolean;
  mine: number | null; // the vehicle of your journey, which pings
  vehicles: Vehicle[]; // all vehicles, kept by App
  onVehicles: (vehicles: Vehicle[]) => void; // new vehicles from the stream
  onStatus: (status: LiveStatus) => void; // whether the stream is answering
  onLoaded: () => void;
  onPick: (vehicle: Vehicle) => void; // a vehicle on the map was clicked
};

export default function LiveVehicles({
  map,
  data,
  shown,
  revealed,
  mine,
  vehicles,
  onVehicles,
  onStatus,
  onLoaded,
  onPick,
}: Props) {
  // what a click on a vehicle does
  useEffect(() => onVehiclePick(onPick), [onPick]);

  // connect as soon as there is a timetable to read the stream against; the returned
  // function disconnects
  useEffect(() => {
    const timeout = setTimeout(onLoaded, MAX_WAIT_MS);
    const stop = watchVehicles(
      data,
      (latest) => {
        // only those on a trip with a route: one that has finished its trip, drives to the
        // depot or is outside Brno still sends its position, but is of no use on the map
        onVehicles(latest.filter((vehicle) => inService(data, vehicle)));
        onLoaded(); // the first ones are in; App waits for the map on its own
      },
      (status) => {
        onStatus(status);
        if (status === "offline") onLoaded(); // do not keep the loading screen waiting
      },
    );
    return () => {
      clearTimeout(timeout);
      stop();
    };
  }, [data, onVehicles, onStatus, onLoaded]);

  // draw what is to be shown: when new positions come and when the choice changes
  useEffect(() => {
    const colorOf = (vehicle: Vehicle) => lineColor(data, vehicle.kind, vehicle.line);
    if (map && revealed) setVehicles(map, shown ?? vehicles, colorOf, shown !== null, mine);
  }, [map, data, vehicles, shown, mine, revealed]);

  return null;
}
