// What you ask for: where from, where to, when - and Search. The two ends are one block, a dot
// where you start, a dot where you end and a dotted line between them, with the button that
// turns them round; when you are leaving is chosen in LeaveWhen.tsx.
// On a phone, where the panel is a sheet, it also leads you through: a name being typed takes
// the panel all the way up (Panel.tsx), an end picked moves on to the other field, both ends
// there bring the panel down to half with Search in sight; and once the ways are found the
// whole form folds into one row that says what was asked, which opens it again.

import { useEffect, useRef, useState } from "react";
import type { TransitData } from "../../logic/timetable/loadData";
import { dayName, formatTime, type Now } from "../../logic/timetable/clock";
import type { MapStation } from "../../logic/timetable/stations";
import type { Place } from "../../logic/walk/places";
import { usePhone } from "../../screen";
import { movePanel, scrollPanelTo } from "../panel/control";
import { useWords } from "../language";
import LeaveWhen from "./LeaveWhen";
import PlaceField from "./PlaceField";
import "./JourneySearch.css";

type Props = {
  data: TransitData;
  now: Now;
  stations: MapStation[];
  from: Place | null;
  to: Place | null;
  later: Now | null; // when you are leaving, if not now
  arriving: boolean; // and whether that is when you arrive instead
  found: boolean; // the ways for these ends are shown: on a phone the form folds
  onFromChange: (place: Place | null) => void;
  onToChange: (place: Place | null) => void;
  onSwap: () => void;
  onLaterChange: (later: Now | null) => void;
  onArrivingChange: (arriving: boolean) => void;
  onSearch: () => void;
};

export default function JourneySearch({
  data,
  now,
  stations,
  from,
  to,
  later,
  arriving,
  found,
  onFromChange,
  onToChange,
  onSwap,
  onLaterChange,
  onArrivingChange,
  onSearch,
}: Props) {
  const w = useWords();
  const phone = usePhone();
  const fields = useRef<HTMLDivElement>(null); // the two fields of the ends
  const searchButton = useRef<HTMLButtonElement>(null);
  const [editing, setEditing] = useState(false); // the folded row was opened again

  // On a phone the panel stops at half the screen, and with the time chosen as well the form
  // is taller than that: Search is scrolled into sight when the time is opened, and when both
  // ends are there - it is what you press next. Once the panel has glided to its height.
  const laterOpen = later !== null;
  const bothEnds = from !== null && to !== null;
  useEffect(() => {
    if (!(laterOpen || bothEnds)) return;
    const wait = setTimeout(() => scrollPanelTo(searchButton.current, "nearest"), 400);
    return () => clearTimeout(wait);
  }, [laterOpen, bothEnds]);

  // An end picked, on a phone, where the panel stands over the whole screen while you type: the
  // other field next, if it is still empty, and the keyboard stays; with both there the
  // keyboard goes and the panel down to half, so that the map shows them and Search is at hand.
  function picked(place: Place | null, other: Place | null, otherField: number) {
    if (!phone || !place) return;
    // (without a scroll: the phone would move the page to the field as the panel stays)
    if (!other)
      return fields.current?.querySelectorAll("input")[otherField]?.focus({ preventScroll: true });
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    movePanel("half");
  }

  function search() {
    setEditing(false);
    // on a phone: the keyboard away, the panel to half the screen, the ways found at its top
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    movePanel("half");
    onSearch();
  }

  // what was asked, folded: the two ends and when, as one row
  if (phone && found && !editing && from && to) {
    return (
      <button className="ends-folded" onClick={() => setEditing(true)}>
        <span className="ends-marks" aria-hidden="true">
          <span className="ends-from" />
          <span className="ends-line" />
          <span className="ends-to" />
        </span>
        <span className="ends-folded-names">
          <span>{from.name}</span>
          <span>{to.name}</span>
        </span>
        <span className="ends-folded-when">
          {later
            ? `${arriving ? w.arriveBy : w.leaveAt} ${
                later.date === now.date ? "" : `${dayName(later.date, now.date, w)} `
              }${formatTime(later.seconds)}`
            : w.leaveNow}
        </span>
      </button>
    );
  }

  return (
    <>
      <div className="ends">
        <div className="ends-marks" aria-hidden="true">
          <span className="ends-from" />
          <span className="ends-line" />
          <span className="ends-to" />
        </div>
        <div className="ends-fields" ref={fields}>
          <PlaceField
            label={w.from}
            placeholder={w.from}
            stations={stations}
            place={from}
            other={to}
            onChange={(place) => {
              onFromChange(place);
              picked(place, to, 1);
            }}
          />
          <PlaceField
            label={w.to}
            placeholder={w.to}
            stations={stations}
            place={to}
            other={from}
            onChange={(place) => {
              onToChange(place);
              picked(place, from, 0);
            }}
          />
        </div>
        <button className="swap" onClick={onSwap} disabled={!from && !to} aria-label={w.swap}>
          ⇅
        </button>
      </div>

      <LeaveWhen
        now={now}
        later={later}
        arriving={arriving}
        validFrom={data.validFrom}
        validTo={data.validTo}
        onChange={onLaterChange}
        onArrivingChange={onArrivingChange}
      />

      <button className="search" onClick={search} disabled={!bothEnds} ref={searchButton}>
        {w.search}
      </button>
    </>
  );
}
