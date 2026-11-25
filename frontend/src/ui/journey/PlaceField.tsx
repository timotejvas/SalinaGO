// One field of the journey planner: type a part of a station name or an address and pick one
// of what matches. Each match says what it is with a round mark beside it, as maps do: a stop
// with the picture of what stops there, an address with a pin.
// logic/timetable/stations.ts finds the stations, logic/walk/addresses.ts the addresses; those
// are downloaded only once something is typed (hooks/useWalking.ts).

import { useRef, useState, type CSSProperties } from "react";
import { searchStations, type MapStation } from "../../logic/timetable/stations";
import { searchAddresses } from "../../logic/walk/addresses";
import { isStation, type Place } from "../../logic/walk/places";
import type { Kind } from "../../logic/timetable/lines";
import { useWalking } from "../../hooks/useWalking";
import { inkOn, KIND_COLORS } from "../../colors";
import KindIcon from "./KindIcon";
import { useWords } from "../language";
import "./PlaceField.css";

// ---------- settings ----------
const MATCHES = 6; // how many matches are offered at once
const STATIONS = 4; // of them at most this many stations, when addresses match too
// ------------------------------

type Props = {
  label: string; // what the field is, for a screen reader
  placeholder: string;
  stations: MapStation[]; // all stations, to search in
  place: Place | null; // the chosen one
  other: Place | null; // the other end, which cannot be chosen again
  onChange: (place: Place | null) => void;
};

export default function PlaceField({
  label,
  placeholder,
  stations,
  place,
  other,
  onChange,
}: Props) {
  const w = useWords();
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const walking = useWalking(text.trim().length >= 2) || null;

  const matches: Place[] = [];
  if (open) {
    const addresses = walking ? searchAddresses(walking.book, text, MATCHES) : [];
    const found = searchStations(stations, text, MATCHES);
    matches.push(...found.slice(0, Math.max(STATIONS, MATCHES - addresses.length)));
    matches.push(...addresses.slice(0, MATCHES - matches.length));
  }
  const offered = matches.filter((found) => found.id !== other?.id);

  function pick(found: Place) {
    // a street is the start of an address: it is written into the field, and you go on with
    // the number - picked again once it is written there, it is the street as a whole
    if (!isStation(found) && found.street && text !== `${found.name} `) {
      setText(`${found.name} `);
      setOpen(true);
      input.current?.focus({ preventScroll: true });
      return;
    }
    onChange(found);
    setText("");
    setOpen(false);
  }

  return (
    <div className="field">
      {place ? (
        <div className="field-chosen">
          <span className="field-name">
            {place.name}
            {!isStation(place) && place.area ? (
              <span className="field-area"> · {place.area}</span>
            ) : null}
          </span>
          <button
            className="field-clear"
            aria-label={w.clear(label)}
            onClick={() => onChange(null)}
          >
            ×
          </button>
        </div>
      ) : (
        <input
          ref={input}
          className="field-input"
          value={text}
          placeholder={placeholder}
          aria-label={label}
          onChange={(event) => {
            setText(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          // a click on a match would be lost if the list closed on blur at once
          onBlur={() => setTimeout(() => setOpen(false), 150)}
        />
      )}

      {offered.length > 0 && (
        // pressing a match does not take the focus from the field: after a street you go on
        // typing, and the list does not close and open again under your finger
        <ul className="field-matches" onMouseDown={(event) => event.preventDefault()}>
          {offered.map((found) => (
            <li key={found.id}>
              <button onClick={() => pick(found)}>
                <PlaceMark place={found} />
                <span className="field-what">
                  <span className="field-name">{found.name}</span>
                  <span className="field-more">
                    {isStation(found)
                      ? found.lines.map((l) => l.line).join(", ")
                      : found.area || w.address}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// What a match is: a stop, in the colour and with the picture of what mostly stops there - a
// tram where a tram stops - or an address, a grey pin.
export function PlaceMark({ place }: { place: Place }) {
  if (!isStation(place)) {
    return (
      <span className="place-mark address" aria-label="address">
        <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
          <path
            d="M8 1.2a5 5 0 0 0-5 5c0 3.6 5 8.6 5 8.6s5-5 5-8.6a5 5 0 0 0-5-5z"
            fill="currentColor"
          />
          <circle cx="8" cy="6.2" r="1.9" fill="var(--icon-hole)" />
        </svg>
      </span>
    );
  }
  const kinds = new Set(place.lines.map((line) => line.kind));
  const kind: Kind = kinds.has("tram") ? "tram" : kinds.has("trolleybus") ? "trolleybus" : "bus";
  const color = KIND_COLORS[kind];
  return (
    <span
      className="place-mark"
      aria-label="stop"
      style={{ background: color, color: inkOn(color), "--icon-hole": color } as CSSProperties}
    >
      <KindIcon kind={kind} />
    </span>
  );
}
