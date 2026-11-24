// A small picture of how you travel a part of a journey: a tram, a trolleybus, a bus, or on
// foot. Drawn in the colour of the text around it.

import type { Kind } from "../../logic/timetable/lines";
import "./KindIcon.css";

export default function KindIcon({ kind }: { kind: Kind | "walk" }) {
  return (
    <svg className="kind-icon" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      {PICTURES[kind]}
    </svg>
  );
}

const PICTURES = {
  // a tram: a tall body, its windows, and the pantograph up to the wire
  tram: (
    <>
      <path d="M5 1.5h6M8 1.5V4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <rect x="3" y="4" width="10" height="9" rx="2" fill="currentColor" />
      <rect x="4.5" y="5.5" width="7" height="3.5" rx="0.8" fill="var(--icon-hole, #1d1d25)" />
      <path
        d="M5 15l1-2M11 15l-1-2"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </>
  ),
  // a bus: a long body, the windscreen and two wheels
  bus: (
    <>
      <rect x="2" y="2.5" width="12" height="10" rx="2.2" fill="currentColor" />
      <rect x="3.5" y="4" width="9" height="4" rx="0.8" fill="var(--icon-hole, #1d1d25)" />
      <circle cx="5" cy="13.5" r="1.5" fill="currentColor" />
      <circle cx="11" cy="13.5" r="1.5" fill="currentColor" />
    </>
  ),
  // a trolleybus: a bus with its two poles up to the wires
  trolleybus: (
    <>
      <path
        d="M6 5l3-4.5M8.5 5l3-4.5"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <rect x="2" y="5" width="12" height="8" rx="2" fill="currentColor" />
      <rect x="3.5" y="6.3" width="9" height="3" rx="0.8" fill="var(--icon-hole, #1d1d25)" />
      <circle cx="5" cy="13.8" r="1.4" fill="currentColor" />
      <circle cx="11" cy="13.8" r="1.4" fill="currentColor" />
    </>
  ),
  // on foot: a walking figure
  walk: (
    <>
      <circle cx="9" cy="2.3" r="1.6" fill="currentColor" />
      <path
        d="M8.5 5L6.5 9.5l-2 1.5M8.5 5l1 4 2.5 1M9.5 9l-1.5 6M7.5 9.5l1.5 5.5M8.5 5l-2.5 1-1 2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>
  ),
};
