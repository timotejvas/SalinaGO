// Builds what the app needs to walk: public/walk.bin, the paths of Brno you can walk along, and
// public/addresses.json, the addresses of Brno to search for. Both from OpenStreetMap
// (© OpenStreetMap contributors, ODbL), which ../data/osm/czech-republic.osm.pbf holds for the
// whole country; only the area of the stations of the timetable, and a little round it, is kept.
//
//   input  ../data/osm/czech-republic.osm.pbf   (see docs/DATA.md for where it comes from)
//          public/transit.json                  (where the stations are)
//   output public/walk.bin
//          public/addresses.json
//          public/transfers.json                which stations are a short walk from each other,
//                                               and the changes within one that take longer
//
// transfers.json:
//   { transfers: { station: [[other station, seconds]] },
//     changes: { station: { "lon,lat>lon,lat": seconds } } }   from one platform to another
//
// walk.bin is a graph, in numbers, little-endian:
//   int32 n, int32 m                  how many points and how many links between them
//   int32 west, int32 south           the corner of the area, in hundred-thousandths of a degree
//   uint32 first[n + 1]               the links of point i are next[first[i] .. first[i + 1]]
//   uint32 next[m]                    the point each link leads to (every link goes both ways)
//   uint16 x[n], uint16 y[n]          where each point is, in hundred-thousandths of a degree
//                                     east and north of the corner
// addresses.json:
//   { west, south, streets: [name], cities: [name], places: [[street, number, city, x, y]] }
//   street and city are places in the lists of names; x and y are where the address is, in
//   hundred-thousandths of a degree (about a metre) east and north of the corner west, south
//
// Run from the frontend/ folder:  node scripts/build-walk.mjs
// Run it again when a new OpenStreetMap file is downloaded.

import fs from "node:fs";
import { readPbf } from "./osm/pbf.mjs";
import { nearestPoint, readWalkGraph, walkAround } from "../src/logic/walk/graph.ts";

// ---------- settings ----------
const OSM = "../data/osm/czech-republic.osm.pbf";
const TRANSIT = "public/transit.json";
const WALK = "public/walk.bin";
const ADDRESSES = "public/addresses.json";
const TRANSFERS = "public/transfers.json";
const MARGIN = 0.02; // degrees round the stations, about 1.5 - 2 km
// the roads and paths people walk along; motorways, trunk roads and the like are left out
const WALKABLE = new Set([
  "footway",
  "path",
  "pedestrian",
  "steps",
  "living_street",
  "residential",
  "service",
  "unclassified",
  "tertiary",
  "tertiary_link",
  "secondary",
  "secondary_link",
  "primary",
  "primary_link",
  "track",
  "cycleway",
  "corridor",
  "platform",
]);
const NO = new Set(["no", "private"]); // foot=no, access=private: not for walking
const TRANSFER_M = 500; // stations this far apart along the paths are a walk from each other
const WALK_SPEED = 1.3; // metres a second, as the app walks (src/logic/walk/places.ts)
const FIND_PLATFORM_S = 60; // and a minute to find the platform at the other end
const CHANGE_S = 120; // a change within one station is given this long (src/logic/journey/plan.ts)
// ------------------------------

const transit = JSON.parse(fs.readFileSync(TRANSIT, "utf8"));
const stations = Object.values(transit.stations);
const box = {
  west: Math.min(...stations.map((s) => s.lon)) - MARGIN,
  east: Math.max(...stations.map((s) => s.lon)) + MARGIN,
  south: Math.min(...stations.map((s) => s.lat)) - MARGIN,
  north: Math.max(...stations.map((s) => s.lat)) + MARGIN,
};
const inside = (lon, lat) => lon > box.west && lon < box.east && lat > box.south && lat < box.north;

// ---------- 1. read: the points inside, the paths, the addresses ----------
const index = new Map(); // node id -> its place in lons / lats
const lons = [];
const lats = [];
const paths = []; // each a list of places in lons / lats
const addresses = []; // [street, number, city, lon, lat, from RÚIAN]

// An address as people write it in Czechia: the street and the number ("Hybešova 255/17"), and
// the part of the town it is in (addr:place, "Staré Brno"), which tells apart streets of the
// same name. In a village without streets the village is the street ("Podolí 438").
function addressOf(tags) {
  const number = tags.get("addr:housenumber") ?? tags.get("addr:conscriptionnumber");
  const street = tags.get("addr:street");
  const part = tags.get("addr:place");
  if (!number || !(street || part)) return null;
  return {
    street: street ?? part,
    number,
    city: (street && part) || tags.get("addr:city") || "",
  };
}

const started = Date.now();
readPbf(OSM, {
  node(id, lon, lat, tags) {
    if (!inside(lon, lat)) return;
    index.set(id, lons.length);
    lons.push(lon);
    lats.push(lat);
    const address = tags && addressOf(tags);
    if (address) {
      const ruian = tags.has("ref:ruian:addr");
      addresses.push([address.street, address.number, address.city, lon, lat, ruian]);
    }
  },
  way(id, refs, tags) {
    if (!tags) return;
    const highway = tags.get("highway");
    if (
      highway &&
      WALKABLE.has(highway) &&
      !NO.has(tags.get("foot")) &&
      !NO.has(tags.get("access"))
    ) {
      // a path that leaves the area is cut where it does: each part inside is kept
      let part = [];
      for (const ref of refs) {
        const at = index.get(ref);
        if (at === undefined) {
          if (part.length > 1) paths.push(part);
          part = [];
        } else part.push(at);
      }
      if (part.length > 1) paths.push(part);
    }
    // a building with an address: the address stands in its middle
    const address = addressOf(tags);
    if (address) {
      const inner = refs.map((ref) => index.get(ref)).filter((at) => at !== undefined);
      if (inner.length === 0) return;
      const lon = inner.reduce((sum, at) => sum + lons[at], 0) / inner.length;
      const lat = inner.reduce((sum, at) => sum + lats[at], 0) / inner.length;
      addresses.push([address.street, address.number, address.city, lon, lat, false]);
    }
  },
});
console.log(
  `Read in ${Math.round((Date.now() - started) / 1000)} s: ${lons.length} points inside, ${paths.length} paths, ${addresses.length} addresses`,
);

// ---------- 2. the graph: crossings and ends, and only as many points between them as the shape needs ----------
// Every point of every path, linked to its neighbours.
const links = new Map(); // place in lons -> the places it is linked to
for (const path of paths) {
  for (let i = 1; i < path.length; i++) {
    const [a, b] = [path[i - 1], path[i]];
    if (a === b) continue;
    if (!links.has(a)) links.set(a, new Set());
    if (!links.has(b)) links.set(b, new Set());
    links.get(a).add(b);
    links.get(b).add(a);
  }
}
// A point with two neighbours only lies on the way from one to the other; most of them are
// there for the shape of a curve, and a curve drawn a metre or two off is drawn as well. They
// are left out where leaving them out moves the line less than TOLERANCE (Douglas - Peucker).
const TOLERANCE = 2; // metres
const metres = (a, b) => {
  const dx = (lons[a] - lons[b]) * 111320 * Math.cos((lats[a] * Math.PI) / 180);
  const dy = (lats[a] - lats[b]) * 110540;
  return Math.hypot(dx, dy);
};
function offLine(p, a, b) {
  const ab = metres(a, b);
  if (ab === 0) return metres(p, a);
  // the height of the triangle a, b, p over a - b
  const [pa, pb] = [metres(p, a), metres(p, b)];
  const half = (ab + pa + pb) / 2;
  const area = Math.sqrt(Math.max(0, half * (half - ab) * (half - pa) * (half - pb)));
  return (2 * area) / ab;
}
function simplify(chain) {
  if (chain.length < 3) return chain;
  let far = 0;
  let worst = -1;
  for (let i = 1; i < chain.length - 1; i++) {
    const off = offLine(chain[i], chain[0], chain[chain.length - 1]);
    if (off > far) [far, worst] = [off, i];
  }
  if (far <= TOLERANCE) return [chain[0], chain[chain.length - 1]];
  const left = simplify(chain.slice(0, worst + 1));
  return [...left.slice(0, -1), ...simplify(chain.slice(worst))];
}
const keyPoint = (at) => links.get(at).size !== 2;
const edges = new Map(); // place -> the places it is linked to in the simplified graph
const join = (a, b) => {
  if (a === b) return;
  if (!edges.has(a)) edges.set(a, new Set());
  if (!edges.has(b)) edges.set(b, new Set());
  edges.get(a).add(b);
  edges.get(b).add(a);
};
const walked = new Set(); // "a>b" of every link already followed
const covered = new Set(); // every point on a chain already followed, kept or left out
for (const [start, around] of links) {
  if (!keyPoint(start)) continue;
  for (const second of around) {
    if (walked.has(`${start}>${second}`)) continue;
    // follow the chain of two-neighbour points to the next crossing or end
    const chain = [start, second];
    walked.add(`${start}>${second}`);
    while (!keyPoint(chain[chain.length - 1])) {
      const [before, here] = chain.slice(-2);
      const onward = [...links.get(here)].find((other) => other !== before);
      if (onward === undefined || onward === start) {
        if (onward === start) chain.push(start);
        break;
      }
      chain.push(onward);
    }
    walked.add(`${chain[chain.length - 1]}>${chain[chain.length - 2]}`);
    for (const at of chain) covered.add(at);
    const kept = simplify(chain);
    for (let i = 1; i < kept.length; i++) join(kept[i - 1], kept[i]);
  }
}
// rings with no crossing at all (a path round a pond): kept as they are
for (const [at, around] of links) {
  if (keyPoint(at) || covered.has(at)) continue;
  for (const other of around) join(at, other);
}

const used = [...edges.keys()];
const point = new Map(used.map((at, i) => [at, i]));
const n = used.length;
const m = used.reduce((sum, at) => sum + edges.get(at).size, 0);
// where the points are: in hundred-thousandths of a degree (about a metre) from the corner of
// the area, which fits two bytes each
const west = Math.floor(box.west * 1e5);
const south = Math.floor(box.south * 1e5);
const buffer = new ArrayBuffer(16 + (n + 1) * 4 + m * 4 + n * 4);
const head = new Int32Array(buffer, 0, 4);
head.set([n, m, west, south]);
const first = new Uint32Array(buffer, 16, n + 1);
const next = new Uint32Array(buffer, 16 + (n + 1) * 4, m);
const x = new Uint16Array(buffer, 16 + (n + 1) * 4 + m * 4, n);
const y = new Uint16Array(buffer, 16 + (n + 1) * 4 + m * 4 + n * 2, n);
let k = 0;
used.forEach((at, i) => {
  x[i] = Math.round(lons[at] * 1e5) - west;
  y[i] = Math.round(lats[at] * 1e5) - south;
  first[i] = k;
  for (const other of edges.get(at)) next[k++] = point.get(other);
});
first[n] = k;
writeWhole(WALK, Buffer.from(buffer));
console.log(`${WALK}: ${n} points, ${m / 2} links, ${(buffer.byteLength / 1e6).toFixed(1)} MB`);

// ---------- 3. the addresses: each once, streets and cities named once ----------
const streets = [];
const cities = [];
const named = new Map(); // list -> name -> its place in the list
const numberOf = (list, name) => {
  if (!named.has(list)) named.set(list, new Map());
  const known = named.get(list);
  if (!known.has(name)) known.set(name, list.push(name) - 1);
  return known.get(name);
};
// The official addresses (RÚIAN) say the part of the town and both numbers of a house
// ("255/17"); a shop or a building that repeats the address says at most "Brno", often with one
// of the numbers. Such a repeat of an official address is left out.
const fromRuian = new Set(
  addresses
    .filter((address) => address[5])
    .flatMap(([s, n]) => [n, ...n.split("/")].map((part) => `${s}|${part}`)),
);
const seen = new Set();
const places = [];
for (const [street, number, city, x, y, ruian] of addresses) {
  const key = `${street}|${number}|${city}`;
  if (seen.has(key)) continue;
  if (!ruian && fromRuian.has(`${street}|${number}`)) continue;
  seen.add(key);
  places.push([
    numberOf(streets, street),
    number,
    numberOf(cities, city),
    Math.round(x * 1e5) - west,
    Math.round(y * 1e5) - south,
  ]);
}
const json = JSON.stringify({ west, south, streets, cities, places });
writeWhole(ADDRESSES, json);
console.log(
  `${ADDRESSES}: ${places.length} addresses on ${streets.length} streets, ${(json.length / 1e6).toFixed(1)} MB`,
);

// ---------- 4. walking between stations, along the paths ----------
// The timetable says where you can walk from one station to another (transfers.txt), but only
// for a few dozen pairs, with times rounded to whole minutes. Along the paths just built it is
// known for every pair of stations near each other, and how long it really takes: from the
// nearest platform of one to the nearest platform of the other (a big station such as Hlavní
// nádraží is a few hundred metres across), and a minute to find the platform.
const bytes = fs.readFileSync(WALK);
const graph = readWalkGraph(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length));
// the platforms of every station: the places the lines stop at it, each once
const platforms = new Map(); // station id -> [{ point, metres }] on the paths
for (const variant of transit.variants) {
  variant.stops.forEach((id, i) => {
    const key = variant.positions[i].join(",");
    if (!platforms.has(id)) platforms.set(id, new Map());
    if (!platforms.get(id).has(key))
      platforms.get(id).set(key, nearestPoint(graph, variant.positions[i]));
  });
}
const onPaths = new Map(
  [...platforms].map(([id, found]) => [id, [...found.values()].filter((at) => at !== null)]),
);
const transfers = {};
let pairs = 0;
for (const [id, starts] of onPaths) {
  const best = new Map(); // other station -> metres
  for (const start of starts) {
    const reach = walkAround(graph, start.point, TRANSFER_M);
    for (const [other, ends] of onPaths) {
      if (other === id) continue;
      for (const end of ends) {
        const along = reach.metres.get(end.point);
        if (along === undefined) continue;
        const metres = start.metres + along + end.metres;
        if (metres <= TRANSFER_M && metres < (best.get(other) ?? Infinity)) best.set(other, metres);
      }
    }
  }
  for (const [other, metres] of best) {
    const seconds = Math.round((metres / WALK_SPEED + FIND_PLATFORM_S) / 10) * 10;
    (transfers[id] ??= []).push([other, seconds]);
    pairs++;
  }
}
// And within one station: its platforms can be far apart too - at Svratecká the tram stops a few
// hundred metres from the bus - so a change there takes longer than the two minutes a change
// is given. Only those that do are written down, by where the two platforms are.
const changes = {};
let far = 0;
for (const [id, found] of platforms) {
  const known = [...found].filter(([, at]) => at !== null);
  for (const [fromKey, from] of known) {
    const reach = walkAround(graph, from.point, TRANSFER_M);
    for (const [toKey, to] of known) {
      if (toKey === fromKey) continue;
      const along = reach.metres.get(to.point);
      if (along === undefined) continue;
      const seconds = Math.round(((from.metres + along + to.metres) / WALK_SPEED + 30) / 10) * 10;
      if (seconds <= CHANGE_S) continue;
      (((changes[id] ??= {})[`${fromKey}>${toKey}`] = seconds), far++);
    }
  }
}
writeWhole(TRANSFERS, JSON.stringify({ transfers, changes }));
console.log(`${TRANSFERS}: ${pairs} walks between stations, ${far} long changes within one`);

// Writes a file whole: into a temporary one first, then renamed over the old, so the app running
// meanwhile reads either the old file or the new, never half of one.
function writeWhole(file, content) {
  fs.writeFileSync(`${file}.tmp`, content);
  fs.renameSync(`${file}.tmp`, file);
}
