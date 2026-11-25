// What a journey puts on the map, and takes off again: the two ends, the legs you picked and,
// before them, the stretch your vehicle comes along. Also which live vehicles the map should show, which
// App hands to the live layer.
// It only links what logic/journey works out with what map/transit draws; it decides nothing.

import { useEffect, useMemo } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";
import type { TransitData, Variant } from "../logic/timetable/loadData";
import type { Place } from "../logic/walk/places";
import type { DoorWalk } from "../logic/journey/plan";
import { walkBetween } from "../logic/walk/places";
import type { WalkGraph } from "../logic/walk/graph";
import { useWalking } from "./useWalking";
import type { RouteStop } from "../logic/timetable/stations";
import type { Ride } from "../logic/journey/direct";
import { legOf } from "../logic/journey/leg";
import { metersBetween } from "../logic/live/track";
import { incomingSoon } from "../logic/journey/incoming";
import type { Now } from "../logic/timetable/clock";
import type { Vehicle } from "../logic/live/vehicles";
import { legColors, lineColor } from "../colors";
import {
  setHighlight,
  setHighlightParts,
  setOtherRoutes,
  type HighlightPart,
} from "../map/transit/highlightLayer";
import { setJourneyEnds } from "../map/transit/journeyLayer";
import { hideStations } from "../map/transit/stationsLayer";

// One leg as the map needs it: the kind of vehicle it takes and the ride itself. A direct
// line is one such leg, a way with a change is several.
export type DrawnLeg = { kind: Variant["kind"]; ride: Ride };

type Props = {
  map: MapLibreMap;
  data: TransitData;
  from: Place | null;
  to: Place | null;
  legs: DrawnLeg[]; // of what is picked; empty when nothing is
  walkFirst?: DoorWalk; // from the address you start at, when you do
  walkLast?: DoorWalk; // to the address you are going to, when you do
  vehicles: Vehicle[]; // all live vehicles
  now: Now; // the real clock: which vehicle is coming for your ride
  mine: number | null; // the vehicle of your journey, once it is known
  leg: number; // the ride that vehicle is of: the first, or after a change the next
  // the vehicle coming for the ride after it, while you near the stop where you change
  next: number | null;
  onVehiclesOnWay: (vehicles: Vehicle[] | null) => void;
};

export function useJourneyOnMap({
  map,
  data,
  from,
  to,
  legs,
  walkFirst,
  walkLast,
  vehicles,
  now,
  mine,
  leg,
  next,
  onVehiclesOnWay,
}: Props) {
  // the two ends, marked until a route is drawn from one to the other
  const drawn = legs.length > 0;
  useEffect(() => {
    setJourneyEnds(map, from, to, !drawn);
    return () => setJourneyEnds(map, null, null);
  }, [map, from, to, drawn]);

  // while a way is picked, its stops are the only ones on the map: the grey dots of all the
  // others go
  useEffect(() => {
    hideStations(map, drawn);
    return () => hideStations(map, false);
  }, [map, drawn]);

  // while a way is picked the map shows one live vehicle: yours, once it is known - not the
  // trips before or after it on the same line, which are of no use to you
  const picked = legs.length > 0;
  useEffect(() => {
    // and, nearing where you change, the one coming for your next ride
    onVehiclesOnWay(
      picked ? vehicles.filter((vehicle) => vehicle.id === mine || vehicle.id === next) : null,
    );
    return () => onVehiclesOnWay(null);
  }, [vehicles, picked, mine, next, onVehiclesOnWay]);

  // The legs as they are drawn: the same route found again as the clock ticks (the planner
  // looks again every minute, and the next trip of a line is a new ride) is the same drawing,
  // and drawing it again would start the line growing from the beginning once a minute.
  const shape = legs.map(({ ride }) => `${ride.variant}:${ride.at}:${ride.stops}`).join(" ");
  const drawnLegs = useMemo(() => legs, [shape]);

  // the legs themselves, and before them where your vehicle comes from; taken off the map when
  // something else is picked, the ends change or the panel leaves this mode
  // the walks the same way: found again with every search, drawn again only when they change
  const walks = [walkFirst, walkLast].map((walk) => walk && `${walk.name}:${walk.path.length}`);
  const drawnWalks = useMemo(() => ({ first: walkFirst, last: walkLast }), [walks.join(" ")]);
  // It is not taken off before it is put on again: the map draws only what changed, and taking
  // it off first would draw the same route growing from its start again.
  // A change is drawn as the walk from one platform to the other along the streets, so the paths
  // are downloaded first - once; after that they are there at once. Without them, a straight line.
  const last = drawnLegs[drawnLegs.length - 1]?.ride;
  const offAt = last && data.variants[last.variant].stops[last.at + last.stops];
  const changes = drawnLegs.length > 1 || (to !== null && offAt !== undefined && offAt !== to.id);
  const walking = useWalking(changes);
  const waiting = changes && walking === null;
  const graph = walking ? walking.graph : null;
  useEffect(() => {
    if (drawnLegs.length === 0) setHighlight(map, []);
    else if (!waiting) setHighlightParts(map, partsOf(data, drawnLegs, to, drawnWalks, graph));
  }, [map, data, drawnLegs, to, drawnWalks, waiting, graph]);
  useEffect(() => () => setHighlight(map, []), [map]);

  // where the vehicle coming for you is: the stop it passed last, while one is coming; the
  // stretch from there to your stop is drawn only then, and drawn again only when it moves on
  // to the next stop, not with every position
  // - of the ride you are waiting for: the first, after a change the next; and while you near
  // the stop where you change, the next one's, coming to meet you there
  // Only the vehicle the map shows, once it is known to be yours: a stretch drawn for another -
  // one the time of the ride does not fit, or the ride as it was before the planner looked
  // again - came from a vehicle that was not there. The ride as it is now (legs), the stretch
  // as it is drawn (drawnLegs): the same route.
  const watched = next !== null ? leg + 1 : leg;
  const first = drawnLegs[watched];
  const followed = next !== null ? next : mine;
  const found =
    first && legs[watched] && followed !== null
      ? incomingSoon(data, vehicles, legs[watched].ride, now)
      : null;
  const coming = found && found.vehicle.id === followed ? found : null;
  const passed = coming && first ? first.ride.at - coming.stopsAway : null;
  // from where it is: the part behind it goes as it drives on (the stops it passed with it)
  const at: [number, number] | null = coming ? [coming.vehicle.lon, coming.vehicle.lat] : null;
  const [lon, lat] = at ?? [0, 0];
  useEffect(() => {
    if (passed === null || !first || !at) return;
    setOtherRoutes(map, comingFrom(data, drawnLegs, watched, passed, at));
  }, [map, data, drawnLegs, watched, first, passed, lon, lat]);
  useEffect(() => {
    if (passed === null) return;
    return () => setOtherRoutes(map, []);
  }, [map, passed === null]);
}

const WALKED = "#ffffff"; // the colour of where a walk begins or ends

// One part per leg, each in the colour of that leg, so that the map shows where you change,
// and a dashed part between two legs: the few steps to the other platform of the station, or
// the walk to another station. When the last line does not go to the end, the walk there too;
// from an address and to one, the walk along the streets, with a dot where the address is.
function partsOf(
  data: TransitData,
  legs: DrawnLeg[],
  to: Place | null,
  walks: { first?: DoorWalk; last?: DoorWalk },
  graph: WalkGraph | null,
): HighlightPart[] {
  const colors = colorsOf(data, legs);
  const parts: HighlightPart[] = [];
  // where you walk from or to is white, as the walk is
  if (walks.first) {
    const { name, path } = walks.first;
    const [lon, lat] = path[0];
    parts.push({ stations: [], path, walk: true });
    parts.push({ stations: [{ name, lon, lat }], path: [], color: WALKED });
  }
  let before: RouteStop | undefined;
  for (const [index, leg] of legs.entries()) {
    const drawn = legOf(data, leg.ride);
    // the station you change at named once, at the platform you get off at, when you get on at
    // another of its platforms
    const [on, ...rest] = drawn.stops;
    drawn.stops = [{ ...on, name: before?.id === on.id ? "" : on.name }, ...rest];
    // both platforms of a change are shown, the one you get off at in the colour of the line
    // that brought you and the one you get on at in the colour of the next one; one dot is
    // enough only when both lines stop at the same place
    const same = before !== undefined && samePlace(before, drawn.stops[0]);
    if (before && !same) {
      const [off, on] = [point(before), point(drawn.stops[0])];
      const path = (graph && walkBetween(graph, off, on)) ?? [off, on];
      parts.push({ stations: [], path, walk: true });
    }
    parts.push({
      stations: same ? drawn.stops.slice(1) : drawn.stops,
      path: drawn.path,
      color: colors[index],
    });
    before = drawn.stops[drawn.stops.length - 1];
  }
  if (before && walks.last) {
    const { name, path } = walks.last;
    const [lon, lat] = path[path.length - 1];
    parts.push({ stations: [], path, walk: true });
    parts.push({ stations: [{ name, lon, lat }], path: [], color: WALKED });
  } else if (before && to && before.id !== to.id) {
    // the last line does not go there: the walk from where it lets you off, along the streets
    const [off, end] = [point(before), [to.lon, to.lat] as [number, number]];
    const path = (graph && walkBetween(graph, off, end)) ?? [off, end];
    parts.push({ stations: [], path, walk: true });
    parts.push({
      stations: [{ name: to.name, lon: to.lon, lat: to.lat }],
      path: [],
      color: WALKED,
    });
  }
  return parts;
}

// Where your vehicle comes from: the stretch its line (that of ride `leg`) drives from the stop the vehicle
// coming for you passed last to your stop, fainter, with its stops, so that you can see on the
// map how far away it is. Not the rest of the routes: where a line goes after you get off is
// of no use to you.
function comingFrom(
  data: TransitData,
  legs: DrawnLeg[],
  leg: number,
  passed: number,
  at: [number, number],
): HighlightPart[] {
  const ride = legs[leg].ride;
  const { stops, path } = legOf(data, { ...ride, at: passed, stops: ride.at - passed });
  // cut where the vehicle is: nothing is drawn behind it
  let k = 0;
  path.forEach((point, i) => {
    if (metersBetween(point, at) < metersBetween(path[k], at)) k = i;
  });
  const ahead: [number, number][] = [at, ...path.slice(k + 1)];
  return [
    { stations: stops.slice(1, -1), path: ahead, color: colorsOf(data, legs)[leg], wide: true },
  ];
}

// The colour of each leg: the colour of its line, a shade lighter when two legs share one.
function colorsOf(data: TransitData, legs: DrawnLeg[]) {
  return legColors(
    legs.map((leg) => lineColor(data, leg.kind, data.variants[leg.ride.variant].line)),
  );
}

// Where a stop is, as the map wants it.
function point(stop: RouteStop): [number, number] {
  return [stop.lon, stop.lat];
}

// Whether two stops are at the same place. Two platforms of one station are not: at Úzká the
// tram and the bus stop a hundred metres apart, and the journey is drawn across that.
function samePlace(one: RouteStop, other: RouteStop) {
  return one.lon === other.lon && one.lat === other.lat;
}
