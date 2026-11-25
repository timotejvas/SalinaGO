# Data sources

<sub>← [Back to the README](../README.md) · [How it works](./ARCHITECTURE.md) · ŠalinaGO 1.0.1</sub>

Every shape and number on the map comes from the sources below: the timetable, the routes and
the paths to walk along from files prepared in advance, the vehicles on the way from a live
stream.

**Contents:** [Sources](#sources) · [Official or calculated?](#official-or-calculated) ·
[Files the app loads](#files-the-app-loads) · [Lines](#lines-in-the-panel) ·
[Journey planner](#what-the-journey-planner-uses) · [Walking and addresses](#walking-and-addresses) ·
[Following a journey live](#following-a-journey-live) · [Routes](#routes-between-the-stations) ·
[Live vehicles](#live-vehicles) · [How current](#how-current-is-it) · [Updating](#updating) ·
[What leaves the browser](#what-leaves-the-browser) · [Checks](#checks) · [Limits](#limits) ·
[Attribution](#attribution)

## Sources

| Data                           | Source                                                                                                                                                                                        | Licence                                                 | Used for                                                                        |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Timetable (GTFS)               | KORDIS JMK, https://kordis-jmk.cz/gtfs/gtfs.zip (copy on data.brno.cz: https://data.brno.cz/datasets/379d2e9a7907460c8ca7fda1f3e84328/about, refreshed weekly)                                | CC BY 4.0 (stated by KORDIS next to the download links) | stations, lines, directions, trip times, official walks between stations        |
| Live vehicle positions         | the stream of the city of Brno, `wss://gis.brno.cz/geoevent/ws/services/Kordis_stream/StreamServer/subscribe` (dataset "Polohy vozidel hromadné dopravy" on data.brno.cz, data of KORDIS JMK) | use in this app confirmed                               | the vehicles on the map and in the panel: position, line, delay, final stop     |
| Basemap                        | CARTO dark-matter, © OpenStreetMap contributors                                                                                                                                               | ODbL (data)                                             | background map, 3D buildings, the font of our labels                            |
| Routes of trips                | calculated with pfaedle (https://github.com/ad-freiburg/pfaedle) from the GTFS and OpenStreetMap (https://download.geofabrik.de/europe/czech-republic.html)                                   | ODbL (derived from OpenStreetMap)                       | the selected route and the faint network of all routes                          |
| Paths to walk along, addresses | OpenStreetMap of Czechia (https://download.geofabrik.de/europe/czech-republic-latest.osm.pbf), read by `scripts/build-walk.mjs`                                                               | ODbL (derived from OpenStreetMap)                       | addresses as the ends of a journey, walks to and between stations, slow changes |

## Official or calculated?

Everything about the transport comes from official data except one thing: the **lines of the
routes between the stations** (the selected route and the faint network). The GTFS timetable
has no routes (`shapes.txt`), so they are calculated, see [below](#routes-between-the-stations).
Walking is calculated too, from the paths of OpenStreetMap, alongside the official walks of the
timetable.

| On the map                                           | Origin                                                                                                                                                                                                |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stations: name, position                             | official, GTFS `stops.txt` (`location_type 1`, inside the Brno area)                                                                                                                                  |
| Lines serving a station                              | official, read from the timetable (`stop_times` -> `trips` -> `routes`); trains are left out                                                                                                          |
| Lines, line numbers, kind (tram / trolleybus / bus)  | official, GTFS `routes.txt`                                                                                                                                                                           |
| Directions and headsigns                             | official, GTFS `trips.txt` (`direction_id`, `trip_headsign`)                                                                                                                                          |
| Stations of a line and their order                   | official, GTFS `stop_times.txt` (a platform is replaced by its station)                                                                                                                               |
| Stops of the selected route                          | official: each stop is drawn at its platform (`stops.txt`, `location_type 0`) of a trip of the route, not in the middle of the station                                                                |
| Which routes run now                                 | official: `calendar.txt`, `calendar_dates.txt` (days) and `stop_times.txt` (times); the app compares them with the current time in Brno                                                               |
| Next trips, on which days and how often a route runs | official: the start times of the trips (`stop_times.txt`) and the calendar; the times are departures from the first stop of the route in Brno                                                         |
| Next trips at a station                              | official: the start of each trip plus its running time to that station (`stop_times.txt`, departures)                                                                                                 |
| Colour of a line                                     | official, GTFS `routes.txt` (`route_color`); where that colour is too dark for a dark map, its lettering (`route_text_color`) is taken instead - night buses are black with yellow letters            |
| Live vehicles: position, line, delay, final stop     | official, from the live stream; only lines that are in the timetable are shown, and a position is moved onto the route of its line                                                                    |
| Walking from one station to another                  | official and **calculated**: the pairs of two different stations from GTFS `transfers.txt` (about 90 in Brno), and every pair of stations within 500 m along the paths of OpenStreetMap (1 452 pairs) |
| Changing within one station                          | **calculated**: two minutes, or longer where the walk between the two platforms along the paths takes longer (1 600 pairs of platforms in 295 stations)                                               |
| Addresses                                            | **OpenStreetMap**: the houses with an address in and round Brno (about 121 000)                                                                                                                       |
| Walking from an address to a station                 | **calculated**: along the paths of OpenStreetMap, at 1.3 m/s                                                                                                                                          |
| Faint network of all lines                           | **calculated**: the routes of all variants drawn together (see below), so it always matches the timetable                                                                                             |
| Line of the selected route                           | **calculated**: pfaedle lays each trip onto the tracks and streets of OpenStreetMap (see below)                                                                                                       |

## Files the app loads

Four files, prepared in advance (`frontend/public/`), and nothing else of ours.

| File             | Size   | Made by                  | Loaded                                      | Holds                                                                                                              |
| ---------------- | ------ | ------------------------ | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `transit.json`   | 3.7 MB | `scripts/build-data.mjs` | as the page opens                           | `published`, `validFrom`, `validTo`, `active` (days), `lineColors`, `stations`, `transfers` (official), `variants` |
| `transfers.json` | 0.1 MB | `scripts/build-walk.mjs` | as the page opens; the app works without it | `transfers` (walks between stations along the paths), `changes` (slow walks between two platforms of one station)  |
| `walk.bin`       | 3.8 MB | `scripts/build-walk.mjs` | once something is typed into _From_ or _To_ | the graph of the paths to walk along, in binary (format in the head of `build-walk.mjs`)                           |
| `addresses.json` | 3.5 MB | `scripts/build-walk.mjs` | together with `walk.bin`                    | the streets, the municipalities and every address with its position                                                |

`transfers.json` names the stations by the ids of the GTFS it was built from, so it is always
built together with `transit.json` (see [Updating](#updating)). When it is missing, the official
walks of the timetable are used.

## Lines in the panel

A "variant" (route) is one sequence of stations of a line in one direction: the full route, a
short-turn, a trip to the depot. After choosing a line, the panel shows an overview of its
**main route** in the chosen direction: the longest route that at least 20 % of the trips of the
direction take (the whole line, not a short-turn, and not a rare trip to the depot, which can be
longer).

- The main route is drawn on the map; its stops are drawn at their platforms. The other routes
  of the line are drawn under it, thinner, with the stops only they have, so that every vehicle
  of the line is on a drawn line.
- "every N min" is the usual gap between the trips of the direction from an hour before to an
  hour after now; "today 4:52–22:22" is its first and last trip today. Both count all routes of
  the direction, so a line whose main route rests today does not read "no trips today".
- **Next** are its departures from its first stop in Brno within the next 6 hours, or the day and
  time of the next one.
- The stops of the route are listed under it. A click on a stop moves the map to it and shows
  its next departures, counted for all routes of the direction.
- **N live** is how many vehicles of the line the stream reports right now; they are shown on
  the map and between the stops they passed last.
- **Running** means a trip of the line (any direction, any route) is on the way or starts within
  the next hour; otherwise the line number is faded.
- Where other routes start or end is mentioned under the stops.

A **station** opened on the map lists every line that stops there with its next departure, the
ones within the hour first; every route through it grows out of it on the map. A **vehicle**
opened on the map lists the stops still ahead of it, with the time it is there: the running
times of its route from where the vehicle is now, so its delay is in them.

## What the journey planner uses

Nothing beyond the files above. The lines that go from A to B without a change, and the ways
there with one or two, are worked out in the browser from `transit.json`: the stations of every
route, the times of their trips and, for walking, the pairs of stations a short walk apart.

**Without a change** (`logic/journey/direct.ts`): every route that passes the stop you start
from and then the one you are going to is a line you can take. The rides are grouped by line,
because that is the choice a passenger makes; a line often serves the same pair with several
routes, each with its own running time, so the minutes and the stops belong to the ride, not to
the line.

**With a change** (`logic/journey/plan.ts`) is RAPTOR (Delling, Pajor and Werneck, 2012). It
works in rounds: after the first round every station holds the earliest time one trip can get
you there, after the second the earliest with one change, after the third with two. At the end
of a round it also walks, to the stations a walk away - RAPTOR's foot-path step. The trips
looked at are the rest of today and tomorrow. A journey is kept only when its round arrives
earlier than every round before it, so the list is the choice between fewer changes and an
earlier arrival. Afterwards every change is moved as late as the same trips allow, so that you
are not left standing at a stop while the tram you were on drives the same way.

**The ways offered** (`logic/journey/options.ts`): the next five, whatever each of them is, in
the order they get you there. To leave at a time, the planner is asked again from just after the
first way it found, up to six times. To arrive by a time, it is asked from 20 minutes earlier
each time, up to eight times (two hours and forty minutes back).

**Walking.** `transfers.txt` has 133 830 rows, but almost all of them are transfers between two
platforms of the same station - Česká tram 1 to Česká tram 4 - which this app does not need as
such, because a station here is the whole stop. What is left are the pairs of two different
stations in Brno, such as Česká to Komenského náměstí in five minutes. They are joined by the
walks `build-walk.mjs` measures along the paths of OpenStreetMap: every pair of stations within
500 m, at 1.3 m/s plus a minute to find the platform. Where both know a pair, the walk along the
paths is used.

**Changing within a station** is given two minutes, or the walk between the two platforms along
the paths where that takes longer (at 1.3 m/s plus 30 s). KORDIS also gives a minimum transfer
time inside a station (most often 0, 180 or 240 seconds); the planner uses the measured walks
instead.

## Walking and addresses

`scripts/build-walk.mjs` reads OpenStreetMap of Czechia directly (`scripts/osm/pbf.mjs`, no
library) and keeps the area of the stations of the timetable with 0.02° round it (about 1.5–2 km).

- **The paths** are the roads and paths people walk along - footways, paths, steps, residential
  streets and the like; motorways and trunk roads are left out. They become a graph of 218 696
  points and 511 420 links (`walk.bin`, numbers in hundred-thousandths of a degree from one
  corner, about a metre).
- **The addresses** are every place with a street (or a place name) and a house number: 120 936
  addresses in 2 613 streets and 137 municipalities (`addresses.json`). Czech houses have two
  numbers - 255/17 is house 255, number 17 in its street - and an address is found by either.
- **From an address** a journey starts with a walk to one of the stations near it, and to one it
  ends with a walk from one: the 4 nearest within 1.2 km along the paths, or within 2.5 km when
  there are none, found with Dijkstra's algorithm (`logic/walk/graph.ts`, `places.ts`), at
  1.3 m/s. The walk counts in the time of the journey.
- Both files are downloaded only when the first letter is typed into _From_ or _To_; until then
  the app does not pay for them.

## Following a journey live

The live stream is used for the journey as well. A vehicle is never tied to a departure,
because the stream does not say which trip it is running (see [Live vehicles](#live-vehicles)):
the times shown are always the timetable's, and the delay stands beside them.

| What                       | Rule (`logic/journey/incoming.ts`, `progress.ts`, `hooks/useJourneyProgress.ts`)                                                                                                                                                                                                                                                                                                                                            |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The vehicle coming for you | a vehicle of the line on the route of the ride, before your stop and still to drive past it; only for a ride leaving within **30 minutes** - one driving past now says nothing about a ride two hours from now                                                                                                                                                                                                              |
| How long it is looked for  | until **5 minutes** after the timetable's departure, so one running late is still coming                                                                                                                                                                                                                                                                                                                                    |
| Yours                      | once found, it is remembered **by its number**; the next vehicle of the line is never taken for it - unless yours drops out of the stream while you still wait                                                                                                                                                                                                                                                              |
| Arriving                   | closer than **45 s** it is "arriving" rather than minutes away                                                                                                                                                                                                                                                                                                                                                              |
| On the way                 | once your vehicle is at your stop, the panel shows only your way                                                                                                                                                                                                                                                                                                                                                            |
| Nearing a change           | **3 stops** before the stop where you change - or **6 minutes** by the timetable without a live vehicle - the vehicle of the next ride is shown, coming along its route                                                                                                                                                                                                                                                     |
| The ride is over           | your vehicle has reached the stop where you get off - or, without a live vehicle, a **minute** after the timetable has you there; the next ride becomes the one followed                                                                                                                                                                                                                                                    |
| There                      | the last ride is over - your vehicle is at the stop where you get off, or without a live vehicle the timetable has had you there for a minute: the panel says **You're there** (or **The rest on foot · N min** with a walk to an address) and closes by itself **a minute** later, plus the walk. Until then the way is kept at least **10 minutes** past the timetable's arrival, so that a late vehicle does not lose it |

Live information always keeps the real clock: a way planned for the evening does not claim a
tram leaves in four minutes, and the notes of the stream stay silent for a departure that is
hours away - nothing is coming for it yet.

## Routes between the stations

`npm run data` gives the official timetable and OpenStreetMap to
[pfaedle](https://github.com/ad-freiburg/pfaedle), which finds for every trip the path along the
real tracks and streets that best connects its stops. It respects one-way streets and turn
restrictions and prefers the routes of the lines mapped in OpenStreetMap; it is not simply the
shortest path. pfaedle has no mode for trolleybuses (GTFS type 800), so they are matched as buses
(they drive on the same streets). The script then cuts each route to its part in Brno and leaves
out points that lie almost on a straight line (2 m). pfaedle's own files are deleted afterwards;
only the routes are kept, in `transit.json`.

The **faint network** in the background is all these routes drawn together. It replaced the
official route network file ("Trasy linek IDS JMK", data.brno.cz), which is from 2020 and is no
longer updated, so the map now always shows the network of the current timetable.

The result is calculated and can be wrong where OpenStreetMap is wrong or incomplete, or where a
line takes an unusual detour that is not mapped.

Accuracy checks (10 Nov 2026, all 1 033 routes in Brno):

- **The routes follow the official network.** 98.7 % of the length of the tram routes, 98.4 % of
  the trolleybus routes and 97.4 % of the bus routes lie within 15 m of the official route network
  of 2020.
  Most of the rest are new sections the 2020 network does not have yet (e.g. tram 8 to Nemocnice
  Bohunice) and replacement buses (lines starting with x).
- **The routes pass the platforms.** The official platform position is 3.7 m from the route in
  the middle case, 8 m for 90 % and 33 m for 99 % of the stops (trams: 0.9 m and 3.3 m). The few
  larger gaps are mostly at bus terminals and loops. Check (10 Nov 2026): of 14 505 sections between
  two stations in Brno, none fell back to a straight line and 59 (0.4 %) are much longer than the
  direct distance, mostly loops of a few bus lines (302, 701, 702).

Because the routes are derived from OpenStreetMap, they are licensed under the ODbL and
OpenStreetMap must be credited (it is, in the corner of the map and in Settings).

## Live vehicles

The stream sends every vehicle in service again and again, one message per vehicle, in Esri
JSON. A message carries the vehicle number, the line (`LineName`), the position, the bearing in
45° steps, the delay in minutes, the last stop passed and the final stop (`LastStopID`,
`FinalStopID`, the same station numbers as in `stops.txt`), and when the position was taken
(`TimeUpdated`). The app keeps the vehicles of the lines that are in the timetable, ignores
messages without finite coordinates, drops a vehicle it has not heard of for two minutes, and
connects again five seconds after the connection drops.

Measured on 13 Nov 2026:

- a new set of positions every **10 s** (10.1 s on average), and it arrives about **15 s** after
  the time it is stamped with, so a vehicle on the map is some 15–25 s behind the real one;
- about 420 vehicles of our lines are on the way at the same time in the afternoon;
- half of the positions are within **4 m** of the route of their line and 76 % within 40 m.
  Those are moved onto the route; the rest (regional buses outside Brno, where our routes end,
  and vehicles in the depots) stay where they are.

**Between two positions** (`logic/live/motion.ts`) a vehicle is not shown standing still: it
drives on along its route at the speed it drove between its last two positions, for as long as
the next position takes to come, and only a position that is late makes the guess slow down. It
brakes over the last 30 m before a stop, is never shown beyond its next stop, and one standing at
a stop is drawn on the platform. On the map, the dot follows that guess along the route, never
jumping and never going backwards.

**Which vehicles are shown.** Only those on a trip with a route of ours to ride along
(`inService`, `logic/live/trip.ts`). The others still send where they are, but are left out:

- a vehicle whose last stop is its final stop - its trip is over, it waits at the end or drives
  to the depot;
- a vehicle outside Brno, whose last stop is on none of our routes (a regional bus before it
  reaches the city);
- a vehicle whose final stop is outside Brno and that is on no stretch of its line's routes
  (most often one driving to the depot).

A regional bus leaving Brno, whose final stop is outside it, is shown: its route is the one whose
next stretch it is on (within 150 m). Measured on 25 Nov 2026 around noon: 56 of 405 vehicles
left out - 37 outside Brno, 15 at the end of their trip, 4 to the depot - and 15 regional buses
leaving Brno, which had no route before, now have one.

What is **not** taken from the live data: which trip a vehicle is on. The official GTFS Realtime
feed of KORDIS (`gtfsReal.dat`, CC BY 4.0) does say it, but its trip ids do not match any
published GTFS (checked against two versions on 12 Nov 2026; the same was found in the
[tripscope notes](https://gitlab.kam.mff.cuni.cz/jirikalvoda/tripscope/-/blob/master/docs/REGIONAL_REALTIME.md)),
so delays are shown as the stream reports them and are not matched to a timetabled trip.

**Licence.** The use of the live stream in this app is confirmed. The positions are credited to
KORDIS JMK and data.brno.cz, in the corner of the map and in Settings.

## How current is it

- GTFS: the version is in `data/gtfs/SOURCE.json` (the date KORDIS gives its file). The app shows
  that **publication date** in Settings (`published` in `transit.json`); the validity is in
  `transit.json` (`validFrom`, `validTo`), and the panel warns when today is outside it. Only
  the days inside it can be picked as the day of a journey. Kept current by
  `npm run data:update`, see below.
- At the time of version 1.0: the GTFS published **20 Nov 2026** (21:47 in Brno), valid
  20 Nov – 13 Dec 2026.
- OpenStreetMap file: downloaded 12 Nov 2026. Download again from time to time, so that the
  routes, the paths and the addresses follow changes of streets and tracks.
- Live positions: always current; nothing is stored.
- Stop ids (`U1703N27`) change between GTFS versions. Never mix files from different GTFS
  versions: `transit.json` and `transfers.json` are always built together.

## Updating

KORDIS publishes no schedule for its GTFS: a new file comes when the timetable changes, often
with diversions, at any day and hour (the one checked on 24 Nov 2026 was dated Fri 20 Nov,
21:47). The copy on data.brno.cz follows it once a week, in the night to Monday. So the app takes
the file from KORDIS directly, and asks for it often.

**On GitHub, by itself.** `.github/workflows/update-data.yml` runs every hour, on GitHub's
servers - no computer of ours needs to be on:

1. It asks KORDIS for the date of its file (`Last-Modified`, `ETag`): one small request, a few
   seconds. Ours is the date `public/transit.json` was built from (`published`).
2. Only when KORDIS has a newer one, it downloads it and OpenStreetMap of Czechia (about 900 MB,
   so the routes, the paths and the addresses are always as fresh as the timetable), calculates
   the routes with pfaedle in Docker, and builds the four files of `frontend/public/`.
3. It commits them as `github-actions[bot]` ("Timetable of 2026-11-20") and starts
   `deploy.yml`, which puts them online. A new timetable is usually on the site within an hour or so of KORDIS publishing it.
4. The download, the map and pfaedle's files are thrown away with the run; only what the site
   loads is kept in the repository.

When KORDIS does not answer, the run only notes a warning and the next hour asks again. When a
build fails, the old files stay and the site keeps working with them; GitHub emails the owner of
the repository. By hand: **Actions → Update data → Run workflow**, with _Build again_ to build
even without a new timetable.

**On a computer** (run from `frontend/`), the same script:

- `npm run data:update` asks KORDIS for the date of its file. When it is newer than ours - the
  one in `data/gtfs/SOURCE.json`, or without it the one `public/transit.json` was built from -
  it downloads it into `data/gtfs/`, builds `public/transit.json` (`build-data.mjs`) and then
  `public/transfers.json` (`build-walk.mjs`, which names stations by the ids of this GTFS), and
  writes the new date. When anything fails, the old timetable and the old files are put back and
  it says why. `-- --force` builds again without a new file; `-- --check` only says whether there
  is one. Only one update runs at a time (`data/.update/lock`; a lock older than two hours is
  left from a run that was stopped).
- While it runs, the app keeps working with the files it has: each one is replaced only when it
  is built.
- Building needs Docker running (pfaedle) and `data/osm/czech-republic.osm.pbf`, from
  https://download.geofabrik.de/europe/czech-republic-latest.osm.pbf. `build-walk.mjs` reads the
  same file, so the paths and the addresses are refreshed with it.

## What leaves the browser

The app has no server of its own. Besides its own files, the page connects to exactly these
hosts - the Content Security Policy of the built page (`frontend/vite.config.ts`) allows nothing
else:

| Host                                                      | Why                                                                                | What is sent                                                                                                                                                                                                              |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `basemaps.cartocdn.com`, `tiles.basemaps.cartocdn.com`    | the basemap: style, tiles, fonts                                                   | ordinary requests for map tiles                                                                                                                                                                                           |
| `gis.brno.cz` (WebSocket)                                 | the live positions                                                                 | nothing; the app only listens                                                                                                                                                                                             |
| `api.web3forms.com`                                       | Report a problem                                                                   | only when you press Send: what you wrote, your email if you gave one, and what you have open - the mode, the line or the ends of the journey, the version, the time, the language, the size of the screen and the browser |
| `static.cloudflareinsights.com`, `cloudflareinsights.com` | counting visits, only when the site is built with a token (`VITE_ANALYTICS_TOKEN`) | that a page was opened, from what kind of device and country, how fast it loaded; no cookies and nothing that identifies you                                                                                              |

No cookies and nothing that identifies you. The only thing kept in the browser is the language you
chose.

## Checks

At the release of version 1.0 (24 Nov 2026, the GTFS of 20 Nov 2026):

| What                            | Count                                                  |
| ------------------------------- | ------------------------------------------------------ |
| Stations in the Brno area       | 848                                                    |
| Lines / variants                | 130 / 1 048                                            |
| Official walks between stations | about 90 pairs                                         |
| Walks along the paths           | 1 452 pairs from 636 stations (the longest 7 min 20 s) |
| Slow changes within a station   | 1 600 pairs of platforms in 295 stations               |
| Walking graph                   | 218 696 points, 511 420 links                          |
| Addresses                       | 120 936 in 2 613 streets and 137 municipalities        |

Earlier checks (13 Nov 2026):

- 848 stations inside the Brno area (`lon 16.4–16.8`, `lat 49.08–49.32`), all served by at least
  one tram, trolleybus or bus line.
- 131 lines in 1 080 variants; every variant has a calculated route, none fell back to a
  straight line.
- Running times: for every trip in the file, the last time of its pattern equals the end of the
  trip, so the times at the stations and the times of the trips agree.
- The trip of line N95 at 23:35 from Chrlice was compared with the same trip on the official map
  (mapa.idsjmk.cz): the same 34 stops in the same order and the same times to the minute.
- Trips: all tram and trolleybus trips are covered. Bus trips with fewer than 2 stations in Brno
  (regional lines outside the city) are not shown.
- The time logic was checked against the timetable: Saturday 15:30 → 194 variants of 89 lines
  run; Monday 8:30 → 298 variants of 107 lines; a date outside the timetable → none.
- The live stream was measured as described above (rate, delay, distance from the routes).

## Limits

- Only the part of a line inside Brno is marked.
- The line of a route is calculated from OpenStreetMap, not official (see above); so are the
  walks along the paths and the addresses, which are as complete as OpenStreetMap is.
- Which trips run on a day is read from the calendar. Cancelled single trips are not in it.
- The live stream does not say which trip a vehicle is on, so on the list of stops a vehicle is
  placed after the last stop it passed, its delay is the one the stream reports, and the vehicle
  coming for you is matched by its route and time, not by its trip.
- Regional buses are followed only inside Brno, because the routes end at the city boundary;
  outside it their position is shown where the stream puts it.
- Journeys have at most two changes and look at the rest of today and tomorrow.
- Vehicles outside Brno, and those that have finished their trip, are not shown (see
  "Which vehicles are shown").
- Trains are not shown.

## Attribution

"Data: KORDIS JMK (CC BY 4.0), data.brno.cz. Routes, paths and addresses © OpenStreetMap
contributors (ODbL). Basemap © OpenStreetMap contributors, © CARTO."
