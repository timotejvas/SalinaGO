// Calculates the route of every trip (GTFS shapes) from OpenStreetMap with pfaedle.
//
// The GTFS timetable has no routes, only stations. pfaedle (github.com/ad-freiburg/pfaedle)
// lays every trip onto the real tracks and streets of OpenStreetMap, using the turn
// restrictions and the routes mapped there. The result is calculated, not official.
// pfaedle runs in Docker, so Docker must be installed and running.

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import Papa from "papaparse";
import { readTable } from "./read.mjs";

// ---------- settings ----------
const DATA = path.resolve("../data"); // relative to the frontend/ folder
const OSM_FILE = "osm/czech-republic.osm.pbf"; // inside DATA
const PFAEDLE_IMAGE = "ghcr.io/ad-freiburg/pfaedle:latest";
// pfaedle has no mode for trolleybuses (GTFS type 800); they drive on streets like buses
const TYPE_FOR_PFAEDLE = { 800: "3" };
// ------------------------------

const WORK = path.join(DATA, ".pfaedle"); // temporary, removed by removeShapes()
const INPUT = path.join(WORK, "input");
const OUTPUT = path.join(WORK, "output");

// Runs pfaedle on the official timetable and returns the folder with its output:
// the same timetable with shapes.txt added. Takes a few minutes.
export function calculateShapes() {
  if (!fs.existsSync(path.join(DATA, OSM_FILE))) {
    throw new Error(
      `OpenStreetMap file not found: data/${OSM_FILE}. Download it from ` +
        "https://download.geofabrik.de/europe/czech-republic-latest.osm.pbf",
    );
  }

  // a copy of the timetable in which trolleybuses are buses (the original stays as it is)
  removeShapes();
  fs.mkdirSync(INPUT, { recursive: true });
  fs.mkdirSync(OUTPUT, { recursive: true });
  for (const file of fs.readdirSync(path.join(DATA, "gtfs"))) {
    if (file.endsWith(".txt"))
      fs.copyFileSync(path.join(DATA, "gtfs", file), path.join(INPUT, file));
  }
  const routes = readTable("routes.txt").map((route) => ({
    ...route,
    route_type: TYPE_FOR_PFAEDLE[route.route_type] ?? route.route_type,
  }));
  fs.writeFileSync(path.join(INPUT, "routes.txt"), Papa.unparse(routes));
  zip(INPUT, path.join(WORK, "input.zip"));

  console.log("Calculating the routes with pfaedle, this takes a few minutes ...");
  // the folders pfaedle sees inside Docker
  const volumes = [
    ["-v", `${WORK}:/work`],
    ["-v", `${path.join(DATA, "osm")}:/osm`],
    ["-v", `${OUTPUT}:/gtfs-out`],
  ].flat();
  const files = ["-x", `/osm/${path.basename(OSM_FILE)}`, "-i", "/work/input.zip"];
  try {
    execFileSync("docker", ["run", "--rm", ...volumes, PFAEDLE_IMAGE, ...files], {
      stdio: "inherit",
    });
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new Error("Docker not found. The routes are calculated in Docker, see docs/DATA.md.");
    }
    throw error;
  }
  return OUTPUT;
}

// Deletes the temporary files of pfaedle (its input and output, about 150 MB).
export function removeShapes() {
  fs.rmSync(WORK, { recursive: true, force: true });
}

// Packs the files of a folder into a zip file (pfaedle reads the timetable as one file).
function zip(folder, zipFile) {
  if (process.platform === "win32") {
    const command = `Compress-Archive -Path '${folder}\\*' -DestinationPath '${zipFile}' -Force`;
    execFileSync("powershell", ["-NoProfile", "-Command", command]);
  } else {
    const files = fs.readdirSync(folder).map((file) => path.join(folder, file));
    execFileSync("zip", ["-q", "-j", zipFile, ...files]);
  }
}
