// Walking in Brno: the paths you can walk along (public/walk.bin, built by
// scripts/build-walk.mjs from OpenStreetMap), and how far it is along them from a place to the
// places around it. It is a graph - points where paths meet or bend, and the links between
// them - and the way along it is found with Dijkstra's algorithm: from where you are, the
// nearest point not yet reached is reached next, until everything within reach is.
// No React and no map here, only data in, data out.

// ---------- settings ----------
const CELL = 0.002; // degrees: the points are filed in squares this big (about 150 x 220 m)
const SNAP_M = 400; // a place further than this from every path is not on the map of paths
// ------------------------------

export type Point = [number, number]; // lon, lat

export type WalkGraph = {
  size: number; // how many points
  first: Uint32Array; // the links of point i are next[first[i] .. first[i + 1]]
  next: Uint32Array;
  lon: Float64Array;
  lat: Float64Array;
  // the points of the biggest part of the graph, in which everything is linked with everything:
  // a place is put onto those, never onto a path that leads nowhere (a yard, a platform)
  main: Uint8Array;
  cells: Map<string, number[]>; // the main points in each square, to find the nearest one
};

// The graph from the bytes of walk.bin (the layout is described in scripts/build-walk.mjs).
export function readWalkGraph(buffer: ArrayBuffer): WalkGraph {
  const [size, links, west, south] = new Int32Array(buffer, 0, 4);
  let at = 16;
  const first = new Uint32Array(buffer, at, size + 1);
  at += (size + 1) * 4;
  const next = new Uint32Array(buffer, at, links);
  at += links * 4;
  const x = new Uint16Array(buffer, at, size);
  const y = new Uint16Array(buffer, at + size * 2, size);
  const lon = new Float64Array(size);
  const lat = new Float64Array(size);
  for (let i = 0; i < size; i++) {
    lon[i] = (west + x[i]) / 1e5;
    lat[i] = (south + y[i]) / 1e5;
  }
  const main = biggestPart(size, first, next);
  const cells = new Map<string, number[]>();
  for (let i = 0; i < size; i++) {
    if (!main[i]) continue;
    const key = cellOf(lon[i], lat[i]);
    const cell = cells.get(key);
    if (cell) cell.push(i);
    else cells.set(key, [i]);
  }
  return { size, first, next, lon, lat, main, cells };
}

// The points of the biggest part of the graph: every part is walked through from one of its
// points, and the one with the most points is kept.
function biggestPart(size: number, first: Uint32Array, next: Uint32Array): Uint8Array {
  const part = new Int32Array(size).fill(-1);
  let biggest = -1;
  let most = 0;
  for (let start = 0; start < size; start++) {
    if (part[start] >= 0) continue;
    part[start] = start;
    const queue = [start];
    for (let i = 0; i < queue.length; i++) {
      const here = queue[i];
      for (let k = first[here]; k < first[here + 1]; k++) {
        const other = next[k];
        if (part[other] >= 0) continue;
        part[other] = start;
        queue.push(other);
      }
    }
    if (queue.length > most) [biggest, most] = [start, queue.length];
  }
  return Uint8Array.from(part, (p) => (p === biggest ? 1 : 0));
}

const cellOf = (lon: number, lat: number) => `${Math.floor(lon / CELL)}:${Math.floor(lat / CELL)}`;

// The point of the paths nearest to a place, and how far it is; null when no path is near.
export function nearestPoint(
  graph: WalkGraph,
  [lon, lat]: Point,
): { point: number; metres: number } | null {
  const [cx, cy] = [Math.floor(lon / CELL), Math.floor(lat / CELL)];
  let best = null as { point: number; metres: number } | null;
  // ring after ring of squares round the place, until a ring cannot hold anything nearer
  for (let ring = 0; ring * CELL * 70000 < SNAP_M + CELL * 111000; ring++) {
    for (let dx = -ring; dx <= ring; dx++) {
      for (let dy = -ring; dy <= ring; dy++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
        for (const point of graph.cells.get(`${cx + dx}:${cy + dy}`) ?? []) {
          const metres = metresBetween([lon, lat], [graph.lon[point], graph.lat[point]]);
          if (!best || metres < best.metres) best = { point, metres };
        }
      }
    }
    // a square is at least 150 m wide, so anything in the next ring is further than this
    if (best && best.metres < ring * CELL * 70000) break;
  }
  return best && best.metres <= SNAP_M ? best : null;
}

// How far every point within a distance is from a starting point along the paths, and from
// which point it is reached, to read the way back (Dijkstra's algorithm).
export type Reach = { metres: Map<number, number>; before: Map<number, number> };

export function walkAround(graph: WalkGraph, start: number, limit: number): Reach {
  const metres = new Map<number, number>([[start, 0]]);
  const before = new Map<number, number>();
  const done = new Set<number>();
  const queue = new Queue();
  queue.push(start, 0);
  while (queue.size > 0) {
    const [here, far] = queue.pop();
    if (done.has(here)) continue; // reached before by a shorter way
    done.add(here);
    const from: Point = [graph.lon[here], graph.lat[here]];
    for (let k = graph.first[here]; k < graph.first[here + 1]; k++) {
      const other = graph.next[k];
      const further = far + metresBetween(from, [graph.lon[other], graph.lat[other]]);
      if (further > limit || further >= (metres.get(other) ?? Infinity)) continue;
      metres.set(other, further);
      before.set(other, here);
      queue.push(other, further);
    }
  }
  return { metres, before };
}

// The way from the start of a walk to a point it reached, as points on the map.
export function wayTo(graph: WalkGraph, reach: Reach, end: number): Point[] {
  const way: Point[] = [];
  for (let at: number | undefined = end; at !== undefined; at = reach.before.get(at)) {
    way.push([graph.lon[at], graph.lat[at]]);
  }
  return way.reverse();
}

// How far apart two places are, in metres; near enough for a town (the earth as flat there).
export function metresBetween([lon1, lat1]: Point, [lon2, lat2]: Point): number {
  const x = (lon2 - lon1) * 111320 * Math.cos((((lat1 + lat2) / 2) * Math.PI) / 180);
  const y = (lat2 - lat1) * 110540;
  return Math.hypot(x, y);
}

// The points still to reach, the nearest always first: a binary heap.
class Queue {
  private points: number[] = [];
  private metres: number[] = [];
  get size() {
    return this.points.length;
  }
  push(point: number, metres: number) {
    let i = this.points.length;
    this.points.push(point);
    this.metres.push(metres);
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.metres[parent] <= metres) break;
      this.move(parent, i);
      i = parent;
    }
    this.points[i] = point;
    this.metres[i] = metres;
  }
  pop(): [number, number] {
    const top: [number, number] = [this.points[0], this.metres[0]];
    const point = this.points.pop()!;
    const metres = this.metres.pop()!;
    const size = this.points.length;
    if (size === 0) return top;
    let i = 0;
    while (true) {
      let child = 2 * i + 1;
      if (child >= size) break;
      if (child + 1 < size && this.metres[child + 1] < this.metres[child]) child++;
      if (this.metres[child] >= metres) break;
      this.move(child, i);
      i = child;
    }
    this.points[i] = point;
    this.metres[i] = metres;
    return top;
  }
  private move(from: number, to: number) {
    this.points[to] = this.points[from];
    this.metres[to] = this.metres[from];
  }
}
