// Keeps the timetable current: asks KORDIS whether it has published a new GTFS since the one
// in data/gtfs/, and when it has, downloads it and builds everything the app reads from it
// again - public/transit.json (build-data.mjs) and public/transfers.json, which names the
// stations of the timetable (build-walk.mjs). The stations change their ids between versions
// of the GTFS, so the two are always built together, from the same files.
//
// Asking costs one small request (the date of the file, not the file), so it can be run often:
// scripts/macos/schedule-update.sh makes a Mac run it every hour (see docs/DATA.md). When a step fails, everything is put
// back as it was - the old timetable keeps working - and it says why.
//
// Run from the frontend/ folder:  npm run data:update        (only when there is a new one)
//                                 npm run data:update -- --force   (download and build anyway)

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

// ---------- settings ----------
const SOURCE = "https://kordis-jmk.cz/gtfs/gtfs.zip";
const GTFS = path.resolve("../data/gtfs");
const STAMP = path.join(GTFS, "SOURCE.json"); // which version of the file is in data/gtfs/
const WORK = path.resolve("../data/.update"); // temporary
const LOCK = path.join(WORK, "lock");
const NEEDED = ["stops.txt", "routes.txt", "trips.txt", "stop_times.txt", "calendar.txt"];
const BUILT = ["public/transit.json", "public/transfers.json"]; // what is put back on a failure
const STALE_LOCK_MS = 2 * 3600 * 1000; // no build takes this long
// ------------------------------

const force = process.argv.includes("--force");
fs.mkdirSync(WORK, { recursive: true });

// one run at a time: an hourly run must not start while a long build is still going. A lock
// older than any build can be is left from a run that was stopped (the computer went to sleep,
// was shut down) and does not hold the next ones back.
if (fs.existsSync(LOCK) && Date.now() - fs.statSync(LOCK).mtimeMs > STALE_LOCK_MS) {
  fs.rmSync(LOCK);
}
try {
  fs.writeFileSync(LOCK, String(process.pid), { flag: "wx" });
} catch {
  say("Another update is running (data/.update/lock). Nothing done.");
  process.exit(0);
}

try {
  // ---------- 1. is there a new one? ----------
  const head = await fetch(SOURCE, { method: "HEAD" });
  if (!head.ok) throw new Error(`KORDIS answered ${head.status} for ${SOURCE}`);
  const version = {
    lastModified: head.headers.get("last-modified"),
    etag: head.headers.get("etag"),
  };
  const known = fs.existsSync(STAMP) ? JSON.parse(fs.readFileSync(STAMP, "utf8")) : {};
  const same = known.lastModified === version.lastModified && (known.etag ?? null) === version.etag;
  if (same && !force) {
    say(`Up to date: the GTFS of ${version.lastModified}.`);
  } else {
    await update(version, known);
  }
} catch (error) {
  say(`Update failed: ${error.message}`, true);
  process.exitCode = 1;
} finally {
  fs.rmSync(LOCK, { force: true });
}

// ---------- 2. download, swap in, build ----------
async function update(version, known) {
  say(`New GTFS at KORDIS (${version.lastModified}; ours: ${known.lastModified ?? "unknown"}).`);
  const zip = path.join(WORK, "gtfs.zip");
  const fresh = path.join(WORK, "gtfs");
  const previous = path.join(WORK, "gtfs-previous");
  const backup = path.join(WORK, "built");

  const response = await fetch(SOURCE);
  if (!response.ok) throw new Error(`Download failed: ${response.status}`);
  fs.writeFileSync(zip, Buffer.from(await response.arrayBuffer()));
  fs.rmSync(fresh, { recursive: true, force: true });
  fs.mkdirSync(fresh);
  unzip(zip, fresh);
  const missing = NEEDED.filter((file) => !fs.existsSync(path.join(fresh, file)));
  if (missing.length > 0) throw new Error(`The download has no ${missing.join(", ")}`);
  // which version it is goes with the files: build-data.mjs writes its date for the app, and on
  // a failure the old files come back with their own
  fs.writeFileSync(
    path.join(fresh, "SOURCE.json"),
    JSON.stringify({ ...version, source: SOURCE, downloaded: new Date().toISOString() }, null, 2),
  );

  // the old timetable and what was built from it, kept until the new one is built
  fs.rmSync(previous, { recursive: true, force: true });
  fs.rmSync(backup, { recursive: true, force: true });
  fs.mkdirSync(backup);
  for (const file of BUILT) {
    if (fs.existsSync(file)) fs.copyFileSync(file, path.join(backup, path.basename(file)));
  }
  fs.renameSync(GTFS, previous);
  fs.renameSync(fresh, GTFS);

  try {
    run("scripts/build-data.mjs");
    run("scripts/build-walk.mjs");
  } catch (error) {
    // back to the old timetable, and to what was built from it
    fs.rmSync(GTFS, { recursive: true, force: true });
    fs.renameSync(previous, GTFS);
    for (const file of BUILT) {
      const kept = path.join(backup, path.basename(file));
      if (fs.existsSync(kept)) fs.copyFileSync(kept, file);
    }
    throw new Error(`Building failed, the old timetable is back. ${error.message}`);
  }

  const { validFrom, validTo } = JSON.parse(fs.readFileSync("public/transit.json", "utf8"));
  // the download and the old timetable are of no use any more
  for (const done of [zip, previous, backup]) fs.rmSync(done, { recursive: true, force: true });
  say(`Timetable updated: valid ${validFrom} - ${validTo}.`, true);
}

// Unpacks a zip file: with unzip on a Mac and on Linux, with tar on Windows (10 and later),
// whose tar reads zip files.
function unzip(file, folder) {
  if (process.platform === "win32") execFileSync("tar", ["-xf", file, "-C", folder]);
  else execFileSync("unzip", ["-q", "-o", file, "-d", folder]);
}

function run(script) {
  execFileSync(process.execPath, [script], { stdio: "inherit" });
}

// To the log, and - when it matters - as a notification on a Mac, as the hourly run has no
// window of its own.
function say(message, notify = false) {
  console.log(`[${new Date().toISOString()}] ${message}`);
  if (notify && process.platform === "darwin") {
    // the message goes in as an argument, never into the script itself, so that nothing in it
    // (an error from the download, say) can be read as AppleScript
    const script =
      'on run argv\ndisplay notification (item 1 of argv) with title "ŠalinaGO"\nend run';
    try {
      execFileSync("osascript", ["-e", script, message]);
    } catch {
      // no notification then; the log has it
    }
  }
}
