// Reading of the GTFS timetable files (data/gtfs/*.txt).

import fs from "node:fs";
import Papa from "papaparse";

// ---------- settings ----------
const GTFS_FOLDER = "../data/gtfs"; // relative to the frontend/ folder, where the scripts run
// ------------------------------

// Reads one GTFS file and returns its rows as objects.
//   readTable("routes.txt")  ->  [{ route_id: "1", route_short_name: "1", ... }, ...]
// `folder` is the official timetable unless another one is given.
export function readTable(fileName, folder = GTFS_FOLDER) {
  const path = `${folder}/${fileName}`;
  if (!fs.existsSync(path)) {
    throw new Error(`GTFS file not found: ${path}. Run the script from the frontend/ folder.`);
  }

  // GTFS files may start with a byte order mark (BOM), which would spoil the first column name
  const text = fs.readFileSync(path, "utf8").replace(/^\uFEFF/, "");
  return Papa.parse(text, { header: true, skipEmptyLines: true }).data;
}

// Converts a GTFS time ("HH:MM:SS") to seconds since midnight of the service day.
// After midnight GTFS keeps counting hours (24, 25, ...), so "25:10:00" -> 90600.
export function toSeconds(time) {
  const [hours, minutes, seconds] = time.split(":").map(Number);
  return hours * 3600 + minutes * 60 + seconds;
}
