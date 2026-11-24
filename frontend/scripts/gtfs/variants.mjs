// Variants of lines.
//
// A variant is one sequence of stations of one line in one direction. A line usually
// has several: the full route, a short-turn, a branch. Each variant keeps the times of
// its trips, so that the app can tell which variants run at a given moment, and when
// a trip is at each station.
//
// The times at the stations are kept short: trips of a variant usually take one of only a few
// "patterns" of running times (slower in the rush hour, faster in the evening). A pattern is
// the time from the start of the trip to each station; every trip only says which pattern it has.

// How many trips a variant has in the whole timetable.
const tripCount = (variant) =>
  Object.values(variant.trips).reduce((sum, times) => sum + times.length / 2, 0);

// Groups all trips into variants. Only the part of a trip inside Brno is used; a trip
// with fewer than two stations in Brno is skipped.
//
// Trips with the same route, direction and sequence of stations form one variant.
// The headsign (destination) of a variant is the one most of its trips have.
//
//   routes       route id -> route (with its kind: tram / trolleybus / bus)
//   trips        trip id  -> row of trips.txt
//   stopsOfTrip  trip id  -> where the trip stops
//   stations     the stations in Brno (from buildStations)
// Returns the variants sorted by kind, line number, route and direction, and for each of them
// one sample trip (used to find the route of the variant on the map, see shapes.mjs).
export function buildVariants(routes, trips, stopsOfTrip, stations) {
  const building = new Map(); // key -> variant that is being collected

  for (const [tripId, stopTimes] of stopsOfTrip) {
    const trip = trips.get(tripId);
    const route = routes.get(trip.route_id);

    // stops of the trip in driving order, only in Brno, one stop per station
    const inBrno = stopTimes
      .sort((a, b) => a.order - b.order)
      .filter((stop) => stations[stop.station])
      .filter((stop, i, all) => i === 0 || stop.station !== all[i - 1].station);
    if (inBrno.length < 2) continue;

    const stationIds = inBrno.map((stop) => stop.station);
    const key = `${trip.route_id}|${trip.direction_id}|${stationIds.join(",")}`;
    if (!building.has(key)) {
      building.set(key, {
        route,
        direction: Number(trip.direction_id),
        stationIds,
        // where the vehicles stop at each station (the platforms of the first trip)
        positions: inBrno.map((stop) => stop.position),
        headsigns: new Map(), // headsign -> number of trips
        trips: {},
        patterns: [], // running times: seconds from the start to each station
        patternIndex: new Map(), // pattern as text -> its position in patterns
        tripPatterns: {}, // service id -> the pattern of each trip, in the order of trips
        // one trip of the variant and its first and last stop in Brno, to find its route later
        sample: { tripId, from: inBrno[0].order, to: inBrno.at(-1).order },
      });
    }
    const variant = building.get(key);

    variant.headsigns.set(trip.trip_headsign, (variant.headsigns.get(trip.trip_headsign) ?? 0) + 1);

    // the trip inside Brno: leaves the first station, arrives at the last one
    const start = inBrno[0].leave;
    if (!variant.trips[trip.service_id]) variant.trips[trip.service_id] = [];
    variant.trips[trip.service_id].push(start, inBrno.at(-1).arrive);

    // when it is at each station, from its start: it leaves the stations, arrives at the last
    const pattern = inBrno.map(
      (stop, i) => (i === inBrno.length - 1 ? stop.arrive : stop.leave) - start,
    );
    const patternKey = pattern.join(",");
    if (!variant.patternIndex.has(patternKey)) {
      variant.patternIndex.set(patternKey, variant.patterns.length);
      variant.patterns.push(pattern);
    }
    if (!variant.tripPatterns[trip.service_id]) variant.tripPatterns[trip.service_id] = [];
    variant.tripPatterns[trip.service_id].push(variant.patternIndex.get(patternKey));
  }

  const items = [...building.values()].map((v) => ({
    variant: {
      line: v.route.route_short_name,
      kind: v.route.kind,
      routeId: v.route.route_id,
      direction: v.direction,
      headsign: [...v.headsigns].sort((a, b) => b[1] - a[1])[0][0],
      stops: v.stationIds,
      positions: v.positions, // [lon, lat] of the platform at each station
      trips: v.trips, // service id -> [start, end, start, end, ...] in seconds
      patterns: v.patterns, // [seconds from the start to each station], one per pattern
      tripPatterns: v.tripPatterns, // service id -> pattern of each trip (same order as trips)
    },
    sample: v.sample,
  }));

  items.sort(
    (a, b) =>
      a.variant.kind.localeCompare(b.variant.kind) ||
      a.variant.line.localeCompare(b.variant.line, "cs", { numeric: true }) ||
      a.variant.routeId.localeCompare(b.variant.routeId) ||
      a.variant.direction - b.variant.direction ||
      tripCount(b.variant) - tripCount(a.variant),
  );

  // after sorting, every variant gets its position as id, so that the app can find it fast
  return {
    variants: items.map((item, index) => ({ id: index, ...item.variant })),
    samples: items.map((item) => item.sample), // samples[id] belongs to variants[id]
  };
}
