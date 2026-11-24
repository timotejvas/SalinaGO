// The page: the map, the panel with its two modes, live vehicles, the clock, a loading screen
// and errors. What two parts of the page need is kept here: the timetable, the map, the time,
// the chosen line, the live vehicles, the ends of the journey and which vehicles the map shows.
//
// The timetable is downloaded here, as the page opens, so that it loads while the map loads
// its style and the stream is connected the moment it arrives. Nothing waits for anything it
// does not need.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";
import MapView from "./hooks/MapView";
import Panel, { type Mode } from "./ui/panel/Panel";
import ModeContent from "./ui/panel/ModeContent";
import { HEIGHT, type Height } from "./ui/panel/control";
import LinePicker from "./ui/lines/LinePicker";
import JourneyPlanner from "./ui/journey/JourneyPlanner";
import Corner from "./ui/Corner";
import LiveVehicles from "./hooks/LiveVehicles";
import LoadingScreen from "./ui/LoadingScreen";
import MadeBy from "./ui/MadeBy";
import Settings from "./ui/Settings";
import StationCard from "./ui/StationCard";
import VehicleCard from "./ui/VehicleCard";
import { firstLanguage, keepLanguage, LanguageContext } from "./ui/language";
import { WORDS, type Lang } from "./logic/words";
import { loadTransit, type TransitData } from "./logic/timetable/loadData";
import { brnoNow } from "./logic/timetable/clock";
import { linesLeaving } from "./logic/timetable/departures";
import type { Kind } from "./logic/timetable/lines";
import type { Place } from "./logic/walk/places";
import type { MapStation } from "./logic/timetable/stations";
import { closeStation, onStationChange, setStationsClickable } from "./map/transit/stationsLayer";
import { vehiclesOfLine, type LiveStatus, type Vehicle } from "./logic/live/vehicles";
import { arrive, keepInSight, type Space } from "./map/camera";
import { visibleHeight } from "./screen";
import { VERSION } from "./version";

// ---------- settings ----------
const REFRESH_MS = 30_000; // how often the time is updated
// ------------------------------

export default function App() {
  const panel = useRef<HTMLDivElement>(null);
  // the room the panel takes; the same function on every render, so that the map does not
  // draw again for it
  const space = useCallback(() => panelSpace(panel.current), []);
  const [transit, setTransit] = useState<TransitData | null>(null); // the timetable
  const [map, setMap] = useState<MapLibreMap | null>(null); // the map, once it has its layers
  const [error, setError] = useState<"timetable" | "map" | null>(null); // what failed to load
  const [settings, setSettings] = useState(false); // the settings are open
  const [lang, setLang] = useState<Lang>(firstLanguage);
  const language = useMemo(() => {
    const choose = (chosen: Lang) => {
      setLang(chosen);
      keepLanguage(chosen);
    };
    return { lang, words: WORDS[lang], setLang: choose };
  }, [lang]);
  const w = language.words;
  const [liveLoaded, setLiveLoaded] = useState(false);
  const [now, setNow] = useState(() => brnoNow());
  const [mode, setMode] = useState<Mode>("journey");
  const [line, setLine] = useState<string | null>(null); // the chosen line, null for none
  const [kind, setKind] = useState<Kind>("tram"); // of the lines the panel offers
  const [from, setFrom] = useState<Place | null>(null); // the ends of the journey: a station
  const [to, setTo] = useState<Place | null>(null); // or an address
  // the vehicles the map shows while a journey is picked, null for all of them
  const [onWay, setOnWay] = useState<Vehicle[] | null>(null);
  const [mine, setMine] = useState<number | null>(null); // the vehicle of the picked journey
  const [riding, setRiding] = useState(false); // the journey shows the way you are on, alone
  const [vehicles, setVehicles] = useState<Vehicle[]>([]); // all live vehicles
  const [liveStatus, setLiveStatus] = useState<LiveStatus>("connecting");
  // a click on a vehicle on the map opens it in the panel, with the stops still ahead of it
  const [openId, setOpenId] = useState<number | null>(null);
  const openVehicle = vehicles.find((vehicle) => vehicle.id === openId) ?? null;
  // the station opened on the map: while it is, the map shows the vehicles of its lines only
  const [station, setStation] = useState<MapStation | null>(null);
  useEffect(() => onStationChange(setStation), []);
  // and it closes when you go on with something else: another mode, a line, a journey picked
  const journeyPicked = onWay !== null;
  // the lines that really leave it: some are listed at a station for a few diversions a year
  const stationLines = useMemo(
    () => (station && transit ? linesLeaving(transit, station.id, station.lines, now) : []),
    [station, transit, now],
  );
  useEffect(() => {
    closeStation();
    setOpenId(null);
  }, [mode, line, journeyPicked]);
  // one of them at a time: a station opened closes a vehicle
  useEffect(() => {
    if (station) setOpenId(null);
  }, [station]);
  // what was opened on the map stays in sight, not under the panel (once the panel has
  // settled at its height: on a phone it rises to half the screen)
  useEffect(() => {
    if (!station || !map) return;
    requestAnimationFrame(() => keepInSight(map, station, space()));
  }, [station, map, space]);
  useEffect(() => {
    const vehicle = vehicles.find((one) => one.id === openId);
    if (!vehicle || !map) return;
    requestAnimationFrame(() => keepInSight(map, vehicle, space()));
  }, [openId, map, space]); // once, when it is opened: not again as it moves
  // stations open on a click only while nothing else is open: a journey, a line, a vehicle
  const busy = onWay !== null || (mode === "lines" && line !== null) || openId !== null;
  useEffect(() => setStationsClickable(!busy), [busy]);
  // one thing open at a time: a vehicle opened closes the station that was open
  // - but not while a journey is picked: its vehicle is shown on the way already
  const pickVehicle = useCallback(
    (vehicle: Vehicle) => {
      if (journeyPicked) return;
      closeStation();
      setOpenId(vehicle.id);
    },
    [journeyPicked],
  );
  // a line of a station or of a vehicle, opened in the lines mode, which closes them
  const openLine = useCallback((chosen: string, chosenKind: Kind) => {
    setMode("lines");
    setKind(chosenKind);
    setLine(chosen);
    setOpenId(null);
    closeStation(); // also when that line was open already
  }, []);
  const onLiveLoaded = useCallback(() => setLiveLoaded(true), []);

  // the timetable, from the moment the page opens
  useEffect(() => {
    loadTransit().then(setTransit, (reason) => {
      console.error("Loading the timetable failed:", reason);
      setError("timetable");
    });
  }, []);

  // everything the first screen needs is here; the loading screen fades, the map stands up
  // and the panel comes in, all at the same moment
  const loading = !error && (!map || !transit || !liveLoaded);
  useEffect(() => {
    if (!loading && map) arrive(map, space());
  }, [loading, map]);

  // keep the time current, so that the panel follows what runs
  useEffect(() => {
    const id = setInterval(() => setNow(brnoNow()), REFRESH_MS);
    return () => clearInterval(id);
  }, []);

  // the vehicles the map draws brightly, null for all of them: those of what is open - a
  // vehicle, a station, a line, a journey. The same list until one of those changes, so that
  // the map does not draw them all again whenever anything else on the page does.
  const shownOnMap = useMemo(
    () =>
      openVehicle
        ? [openVehicle]
        : station
          ? vehiclesAt(vehicles, stationLines)
          : mode === "lines"
            ? line
              ? vehiclesOfLine(vehicles, line)
              : null
            : onWay,
    [openVehicle, station, vehicles, stationLines, mode, line, onWay],
  );
  const lineVehicles = useMemo(() => vehiclesOfLine(vehicles, line), [vehicles, line]);

  // the words of the page follow the language, the Czech name of a page in Czech
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  return (
    <LanguageContext.Provider value={language}>
      <MapView transit={transit} onReady={setMap} onError={() => setError("map")} />
      {!loading && map && transit && (
        <Panel
          ref={panel}
          mode={mode}
          onModeChange={setMode}
          // the modes step aside while one thing fills the panel, with its own × to go back
          modesHidden={
            Boolean(station || openVehicle) ||
            (mode === "lines" && line !== null) ||
            (mode === "journey" && riding)
          }
          data={transit}
          now={now}
        >
          {/* a station or a vehicle opened on the map stands over the mode until it is closed;
              the mode stays as it was under it. A line of them opens in the lines mode. */}
          {station ? (
            <StationCard
              data={transit}
              station={station}
              now={now}
              onClose={closeStation}
              onLine={openLine}
            />
          ) : openVehicle ? (
            <VehicleCard
              map={map}
              data={transit}
              vehicle={openVehicle}
              now={now}
              space={space}
              onClose={() => setOpenId(null)}
              onLine={openLine}
            />
          ) : null}
          <ModeContent hidden={Boolean(station || openVehicle)} mode={mode}>
            {mode === "lines" && (
              <LinePicker
                map={map}
                data={transit}
                now={now}
                kind={kind}
                onKindChange={setKind}
                line={line}
                onLineChange={setLine}
                vehicles={lineVehicles}
                liveStatus={liveStatus}
                space={space}
              />
            )}
            {/* the journey stays under the lines, so that it is there as you left it */}
            <JourneyPlanner
              map={map}
              data={transit}
              now={now}
              from={from}
              to={to}
              onFromChange={setFrom}
              onToChange={setTo}
              vehicles={vehicles}
              onVehiclesOnWay={setOnWay}
              onMine={setMine}
              onRiding={setRiding}
              active={mode === "journey"}
              space={space}
            />
          </ModeContent>
        </Panel>
      )}
      {transit && (
        <LiveVehicles
          map={map}
          data={transit}
          shown={shownOnMap}
          revealed={!loading}
          mine={openVehicle ? openVehicle.id : mode === "journey" && !station ? mine : null}
          vehicles={vehicles}
          onVehicles={setVehicles}
          onStatus={setLiveStatus}
          onLoaded={onLiveLoaded}
          onPick={pickVehicle}
        />
      )}
      {settings && transit && (
        <Settings
          data={transit}
          liveStatus={liveStatus}
          vehicles={vehicles.length}
          context={[
            `mode: ${mode}`,
            mode === "lines"
              ? `line: ${line ?? "-"} (${kind})`
              : `from: ${from?.name ?? "-"} → to: ${to?.name ?? "-"}`,
            `version: ${VERSION}`,
            `time: ${new Date().toISOString()}`,
            `language: ${lang}`,
            `screen: ${window.innerWidth}×${window.innerHeight}`,
            `browser: ${navigator.userAgent}`,
          ].join("\n")}
          onClose={() => setSettings(false)}
        />
      )}
      <Corner
        // the settings tell about the timetable: there to open once it is loaded
        onSettings={transit ? () => setSettings(true) : undefined}
        status={loading ? null : liveStatus}
        count={vehicles.length}
      />
      {!loading && <MadeBy />}
      {/* what failed, and a way to try again: the page loaded afresh */}
      {error && (
        <div className="app-error" role="alert">
          {error === "map" ? w.mapFailed : w.timetableFailed}
          <button onClick={() => location.reload()}>{w.retry}</button>
        </div>
      )}
      <LoadingScreen
        loading={loading}
        steps={[
          { label: w.loadingTimetable, done: transit !== null },
          { label: w.loadingMap, done: map !== null },
          { label: w.loadingVehicles, done: liveLoaded },
        ]}
      />
    </LanguageContext.Provider>
  );
}

// The room the panel takes on the screen, so that the map does not hide stations under it.
// On a wide screen the panel is on the left; on a phone it lies over the bottom of the map.
function panelSpace(panel: HTMLElement | null): Space {
  if (!panel) return { left: 0, top: 0, bottom: 0 };
  const rect = panel.getBoundingClientRect();
  const atBottom = rect.width > window.innerWidth / 2;
  if (!atBottom) return { left: rect.right, top: 0, bottom: 0 };
  // a sheet: as tall as it is going to stand - it may still be gliding there. The map is as
  // tall as the page; what is left of the screen above a keyboard is the visual viewport, by
  // which the sheet measures its heights (ui/panel/useKeyboard.ts)
  const page = document.documentElement.clientHeight;
  const share = HEIGHT[panel.dataset.height as Height] ?? 0;
  const going = Math.min(panel.scrollHeight, (share / 100) * visibleHeight());
  return { left: 0, top: 0, bottom: Math.max(going, page - rect.top) };
}

// The vehicles of the lines that leave a station.
function vehiclesAt(vehicles: Vehicle[], lines: { line: string; kind: Kind }[]): Vehicle[] {
  return vehicles.filter((vehicle) =>
    lines.some(({ line, kind }) => line === vehicle.line && kind === vehicle.kind),
  );
}
