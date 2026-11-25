// Planning a journey in the panel: where you are, where you are going, when you are leaving
// (JourneySearch.tsx), and - once you press Search - what you can take: one list of the next
// few ways there, the one that gets you there first on top, each a card (JourneyWay.tsx).
// A way picked is drawn on the map (hooks/useJourneyOnMap.ts); once its vehicle picks you up
// the panel shows it alone, on the way (OnTheWay.tsx).
// It holds what you ask; the ways are found by hooks/useWays.ts, and where you are on the one
// you picked by hooks/useJourneyProgress.ts.

import { useEffect, useMemo, useRef, useState } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";
import type { TransitData } from "../../logic/timetable/loadData";
import type { Now } from "../../logic/timetable/clock";
import { mapStations } from "../../logic/timetable/stations";
import type { Journey } from "../../logic/journey/plan";
import { wayKey } from "../../logic/journey/options";
import { legsOf } from "../../logic/journey/leg";
import type { Place } from "../../logic/walk/places";
import type { Vehicle } from "../../logic/live/vehicles";
import { fitTo, focusOn, type Space } from "../../map/camera";
import { useWays } from "../../hooks/useWays";
import { useJourneyProgress } from "../../hooks/useJourneyProgress";
import { useJourneyOnMap, type DrawnLeg } from "../../hooks/useJourneyOnMap";
import { usePhone } from "../../screen";
import { movePanel } from "../panel/control";
import { useWords } from "../language";
import JourneySearch from "./JourneySearch";
import JourneyWay from "./JourneyWay";
import OnTheWay from "./OnTheWay";
import type { JourneyStop } from "./JourneyStrip";
import "./JourneyPlanner.css";

type Props = {
  map: MapLibreMap;
  data: TransitData;
  now: Now;
  from: Place | null;
  to: Place | null;
  onFromChange: (place: Place | null) => void;
  onToChange: (place: Place | null) => void;
  vehicles: Vehicle[]; // all live vehicles
  // the vehicles going the way of what is picked; App hands them to the map, which then
  // shows only those and dims the rest
  onVehiclesOnWay: (vehicles: Vehicle[] | null) => void;
  onMine: (id: number | null) => void; // the vehicle of the picked way, which the map marks
  onRiding: (riding: boolean) => void; // whether it shows the way you are on, alone
  // whether it is the mode shown: under the lines it stays, as you left it, but out of sight
  // and off the map
  active: boolean;
  space: () => Space; // the room the panel takes, so that the map keeps it free
};

const NO_LEGS: DrawnLeg[] = []; // nothing drawn, the same every time
const THERE_MS = 2500; // "You're there" stays this long - its tick drawn - and then it closes

export default function JourneyPlanner({
  map,
  data,
  now,
  from,
  to,
  onFromChange,
  onToChange,
  vehicles,
  onVehiclesOnWay,
  onMine,
  onRiding,
  active,
  space,
}: Props) {
  const w = useWords();
  const phone = usePhone();
  const stations = useMemo(() => mapStations(data), [data]);
  const [later, setLater] = useState<Now | null>(null); // when you are leaving, if not now
  const [arriving, setArriving] = useState(false); // and whether that is when you arrive instead
  const [opening, setOpening] = useState(false); // Search was pressed: the list is to be shown
  const [closed, setClosed] = useState<string | null>(null); // the way whose ride you closed
  const rides = useRef<HTMLUListElement>(null); // the list of the ways found

  const ways = useWays({ data, now, stations, from, to, later, arriving });
  const legs = ways.picked?.legs ?? NO_LEGS;
  const live = later === null;
  const progress = useJourneyProgress({ data, now, vehicles, way: ways.way, legs, live });

  // the vehicle of what is picked, for the map to mark
  useEffect(() => {
    onMine(progress.mine);
    return () => onMine(null);
  }, [progress.mine, onMine]);

  // You are on it: its vehicle stands at the stop you get on at, or has left it. The panel then
  // shows that way alone until you close it (×) or are there; the search stays under it.
  const riding = Boolean(ways.picked) && progress.onWay && closed !== ways.way;

  // there - off the last vehicle: the way says so a moment, and closes by itself, back to the
  // search (the panel glides down to it)
  useEffect(() => {
    if (!riding || !progress.arrived) return;
    const done = setTimeout(() => ways.forget(), THERE_MS);
    return () => clearTimeout(done);
  }, [riding, progress.arrived]);
  useEffect(() => {
    onRiding(riding && active);
    return () => onRiding(false);
  }, [riding, active, onRiding]);

  useJourneyOnMap({
    map,
    data,
    from: active ? from : null,
    to: active ? to : null,
    legs: active ? legs : NO_LEGS,
    walkFirst: active ? ways.picked?.walkFirst : undefined,
    walkLast: active ? ways.picked?.walkLast : undefined,
    vehicles,
    now,
    mine: progress.mine,
    leg: progress.leg,
    next: progress.next?.vehicle.id ?? null,
    onVehiclesOnWay,
  });

  // After Search the ways are listed, none of them open - you pick the one you want to see;
  // the map shows the two ends meanwhile. The list is there in the render after the one
  // Search was pressed in, once the walks from an address are known.
  useEffect(() => {
    if (!opening || !ways.ready) return;
    setOpening(false);
    // on a phone the form has folded into one row above them: the panel from its top
    rides.current?.closest(".panel-body")?.scrollTo({ top: 0, behavior: "smooth" });
    showEnds(from, to);
  }, [opening, ways.ready]);

  // both ends of the journey on the map, as far as they are known
  function showEnds(a: Place | null, b: Place | null) {
    const ends = [a, b].filter((place) => place !== null);
    if (ends.length > 0) fitTo(map, ends, space());
  }

  // An end chosen or changed: what was found no longer fits it; the map moves once the panel
  // has (on a phone it may just have gone down). Not while the other end is still being typed
  // on a phone: the panel and the keyboard cover the map then, and a camera flying unseen only
  // made the typing stutter - it moves when the panel comes down, with both ends.
  function changeEnd(place: Place | null, end: "from" | "to") {
    (end === "from" ? onFromChange : onToChange)(place);
    ways.forget();
    requestAnimationFrame(() => {
      if (phone && document.activeElement instanceof HTMLInputElement) return;
      if (end === "from") showEnds(place, to);
      else showEnds(from, place);
    });
  }

  // A click shows what was picked on the map, a second click takes it off again. On a phone
  // the panel goes down to half the screen and the camera goes to the stop you get on at,
  // where you are going now - on so small a map the whole way would be too far out to find
  // it. A wide screen shows the whole way. The camera moves once the panel has.
  function pickWay(way: Journey) {
    if (!ways.pick(way)) return showEnds(from, to);
    const { stops } = legsOf(
      data,
      way.legs.map((leg) => leg.ride),
    );
    // the ends too, when the way walks to the first stop or from the last one
    const walked = [...(way.walkFirst?.path ?? []), ...(way.walkLast?.path ?? [])];
    const places = [...stops, ...walked.map(([lon, lat]) => ({ lon, lat })), ...(to ? [to] : [])];
    if (phone) movePanel("half");
    requestAnimationFrame(() =>
      phone && stops.length > 0 ? focusOn(map, stops[0], space()) : fitTo(map, places, space()),
    );
  }

  // a click on a stop of a strip moves the map to it
  const pickStop = (stop: JourneyStop) => focusOn(map, stop, space());

  if (riding && ways.picked) {
    return (
      <OnTheWay
        data={data}
        now={now}
        way={ways.picked}
        vehicles={vehicles}
        leg={progress.leg}
        mine={progress.mine}
        yours={progress.yours}
        where={progress.where}
        next={progress.next}
        nearing={progress.nearing}
        arrived={progress.arrived}
        hidden={!active}
        onClose={() => setClosed(ways.way)}
        onPickStop={pickStop}
      />
    );
  }

  return (
    <div className="journey" hidden={!active}>
      <JourneySearch
        data={data}
        now={now}
        stations={stations}
        from={from}
        to={to}
        later={later}
        arriving={arriving}
        found={ways.shown}
        onFromChange={(place) => changeEnd(place, "from")}
        onToChange={(place) => changeEnd(place, "to")}
        onSwap={() => {
          onFromChange(to);
          onToChange(from);
          ways.forget();
        }}
        onLaterChange={(moment) => {
          setLater(moment);
          ways.forget();
        }}
        onArrivingChange={(choice) => {
          setArriving(choice);
          ways.forget();
        }}
        onSearch={() => {
          ways.search();
          setOpening(true);
        }}
      />

      {/* an address: its walks are found once the paths are downloaded, which takes a moment */}
      {ways.shown && !ways.ready ? (
        <div className="journey-loading" role="status">
          {w.findingWalks}
        </div>
      ) : null}

      {ways.shown && ways.ready && ways.ways.length > 0 ? (
        <ul className="rides scroll-list" ref={rides}>
          {ways.ways.map((way) => {
            const picked = wayKey(way) === ways.way;
            return (
              <JourneyWay
                key={wayKey(way)}
                data={data}
                now={now}
                way={way}
                vehicles={vehicles}
                picked={picked}
                mine={picked ? progress.mine : null}
                leg={picked ? progress.leg : 0}
                onPick={() => pickWay(way)}
                live={live}
                onPickStop={pickStop}
              />
            );
          })}
        </ul>
      ) : null}

      {ways.shown && ways.ready && ways.ways.length === 0 ? (
        <div className="journey-empty">
          <strong>{w.noConnection}</strong>
          <span>{w.tryAnother}</span>
        </div>
      ) : null}
    </div>
  );
}
