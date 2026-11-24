// Reads an OpenStreetMap .osm.pbf file, the format Geofabrik publishes, without any library:
// the file is a row of blocks, each compressed with zlib (which Node has) and written in
// Protocol Buffers (which is simple enough to read by hand, below). It calls back with every
// node and every way; relations are skipped, nothing here needs them.
// See https://wiki.openstreetmap.org/wiki/PBF_Format for the format.
//
//   readPbf(path, { node(id, lon, lat, tags), way(id, refs, tags) })
//
// Tags are given as a Map, and only when the element has any, because most nodes have none and
// building a Map for each of them would cost more than all the rest.

import fs from "node:fs";
import zlib from "node:zlib";

export function readPbf(path, { node, way }) {
  const fd = fs.openSync(path, "r");
  const lengthBuffer = Buffer.alloc(4);
  let position = 0;
  try {
    for (;;) {
      if (fs.readSync(fd, lengthBuffer, 0, 4, position) < 4) break;
      const headerLength = lengthBuffer.readUInt32BE(0);
      const header = readExactly(fd, position + 4, headerLength);
      const { type, size } = blobHeader(header);
      const blob = readExactly(fd, position + 4 + headerLength, size);
      position += 4 + headerLength + size;
      if (type === "OSMData") primitiveBlock(unpack(blob), node, way);
    }
  } finally {
    fs.closeSync(fd);
  }
}

function readExactly(fd, at, length) {
  const buffer = Buffer.alloc(length);
  let done = 0;
  while (done < length) {
    const read = fs.readSync(fd, buffer, done, length - done, at + done);
    if (read === 0) throw new Error("the file ends in the middle of a block");
    done += read;
  }
  return buffer;
}

// ---------- Protocol Buffers ----------

// A reader of one message: fields one after another, each a key (number and wire type) and a
// value. Numbers are JavaScript numbers: the ids and coordinates of OpenStreetMap are well
// below 2^53, where they stay exact, so no BigInt is needed.
class Message {
  constructor(buffer, start = 0, end = buffer.length) {
    this.buffer = buffer;
    this.at = start;
    this.end = end;
  }
  more() {
    return this.at < this.end;
  }
  varint() {
    let result = 0;
    let factor = 1;
    for (;;) {
      const byte = this.buffer[this.at++];
      result += (byte & 0x7f) * factor;
      if (byte < 0x80) return result;
      factor *= 128;
    }
  }
  // the number of the next field and how its value is written
  key() {
    const key = this.varint();
    return [Math.floor(key / 8), key % 8];
  }
  // a length-delimited value: bytes, a string, a message or a packed list
  bytes() {
    const length = this.varint();
    const start = this.at;
    this.at += length;
    return [start, this.at];
  }
  skip(wire) {
    if (wire === 0) this.varint();
    else if (wire === 1) this.at += 8;
    else if (wire === 2) this.bytes();
    else if (wire === 5) this.at += 4;
    else throw new Error(`unknown wire type ${wire}`);
  }
}

const zigzag = (value) => (value % 2 === 1 ? -(value + 1) / 2 : value / 2);

// A packed list of varints, as numbers; signed ones (sint) are unzigzagged.
function packed(buffer, [start, end], signed = false) {
  const reader = new Message(buffer, start, end);
  const values = [];
  while (reader.more()) values.push(signed ? zigzag(reader.varint()) : reader.varint());
  return values;
}

// ---------- the blocks ----------

function blobHeader(buffer) {
  const reader = new Message(buffer);
  let type = "";
  let size = 0;
  while (reader.more()) {
    const [field, wire] = reader.key();
    if (field === 1) {
      const [start, end] = reader.bytes();
      type = buffer.toString("utf8", start, end);
    } else if (field === 3) size = reader.varint();
    else reader.skip(wire);
  }
  return { type, size };
}

function unpack(buffer) {
  const reader = new Message(buffer);
  while (reader.more()) {
    const [field, wire] = reader.key();
    if (field === 1) return buffer.subarray(...reader.bytes()); // stored as it is
    if (field === 3) return zlib.inflateSync(buffer.subarray(...reader.bytes()));
    reader.skip(wire);
  }
  throw new Error("a block in a form this reader does not know");
}

function primitiveBlock(buffer, node, way) {
  const reader = new Message(buffer);
  const groups = [];
  let strings = [];
  let granularity = 100;
  let latOffset = 0;
  let lonOffset = 0;
  while (reader.more()) {
    const [field, wire] = reader.key();
    if (field === 1) strings = stringTable(buffer, reader.bytes());
    else if (field === 2) groups.push(reader.bytes());
    else if (field === 17) granularity = reader.varint();
    else if (field === 19) latOffset = reader.varint();
    else if (field === 20) lonOffset = reader.varint();
    else reader.skip(wire);
  }
  const block = { buffer, strings, granularity, latOffset, lonOffset };
  for (const group of groups) primitiveGroup(block, group, node, way);
}

function stringTable(buffer, [start, end]) {
  const reader = new Message(buffer, start, end);
  const strings = [];
  while (reader.more()) {
    const [field, wire] = reader.key();
    if (field === 1) {
      const [from, to] = reader.bytes();
      strings.push(buffer.toString("utf8", from, to));
    } else reader.skip(wire);
  }
  return strings;
}

function primitiveGroup(block, [start, end], node, way) {
  const reader = new Message(block.buffer, start, end);
  while (reader.more()) {
    const [field, wire] = reader.key();
    if (field === 2 && node) denseNodes(block, reader.bytes(), node);
    else if (field === 3 && way) readWay(block, reader.bytes(), way);
    else if (field === 1 && node) readNode(block, reader.bytes(), node);
    else reader.skip(wire);
  }
}

const coordinate = (block, value, offset) => (offset + block.granularity * value) / 1e9;

function denseNodes(block, range, node) {
  const { buffer, strings } = block;
  const reader = new Message(buffer, ...range);
  let ids = [];
  let lats = [];
  let lons = [];
  let keysVals = [];
  while (reader.more()) {
    const [field, wire] = reader.key();
    if (field === 1) ids = packed(buffer, reader.bytes(), true);
    else if (field === 8) lats = packed(buffer, reader.bytes(), true);
    else if (field === 9) lons = packed(buffer, reader.bytes(), true);
    else if (field === 10) keysVals = packed(buffer, reader.bytes());
    else reader.skip(wire);
  }
  let id = 0;
  let lat = 0;
  let lon = 0;
  let k = 0;
  for (let i = 0; i < ids.length; i++) {
    id += ids[i];
    lat += lats[i];
    lon += lons[i];
    let tags = null;
    // the tags of every node one after another, each node's ended by a 0
    while (k < keysVals.length && keysVals[k] !== 0) {
      tags ??= new Map();
      tags.set(strings[keysVals[k]], strings[keysVals[k + 1]]);
      k += 2;
    }
    k++;
    node(
      id,
      coordinate(block, lon, block.lonOffset),
      coordinate(block, lat, block.latOffset),
      tags,
    );
  }
}

function readNode(block, range, node) {
  const { buffer, strings } = block;
  const reader = new Message(buffer, ...range);
  let id = 0;
  let lat = 0;
  let lon = 0;
  let keys = [];
  let vals = [];
  while (reader.more()) {
    const [field, wire] = reader.key();
    if (field === 1) id = zigzag(reader.varint());
    else if (field === 2) keys = packed(buffer, reader.bytes());
    else if (field === 3) vals = packed(buffer, reader.bytes());
    else if (field === 8) lat = zigzag(reader.varint());
    else if (field === 9) lon = zigzag(reader.varint());
    else reader.skip(wire);
  }
  const tags = keys.length ? new Map(keys.map((key, i) => [strings[key], strings[vals[i]]])) : null;
  node(id, coordinate(block, lon, block.lonOffset), coordinate(block, lat, block.latOffset), tags);
}

function readWay(block, range, way) {
  const { buffer, strings } = block;
  const reader = new Message(buffer, ...range);
  let id = 0;
  let keys = [];
  let vals = [];
  let refs = [];
  while (reader.more()) {
    const [field, wire] = reader.key();
    if (field === 1) id = reader.varint();
    else if (field === 2) keys = packed(buffer, reader.bytes());
    else if (field === 3) vals = packed(buffer, reader.bytes());
    else if (field === 8) refs = packed(buffer, reader.bytes(), true);
    else reader.skip(wire);
  }
  for (let i = 1; i < refs.length; i++) refs[i] += refs[i - 1]; // stored as differences
  const tags = keys.length ? new Map(keys.map((key, i) => [strings[key], strings[vals[i]]])) : null;
  way(id, refs, tags);
}
