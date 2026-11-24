// When you are leaving: now, or at a time you pick - on a day said in words ("Today", "Tomorrow",
// "Tue 24 Nov") and at a time that can be typed or stepped by a quarter of an hour.
// Only the days the timetable covers can be picked. The moment itself is kept by
// JourneyPlanner.tsx; the days and the times are worked out in logic/timetable/clock.ts.

import { useState } from "react";
import {
  dayName,
  daysAhead,
  formatTime,
  momentAt,
  readClock,
  stepQuarter,
  type Now,
} from "../../logic/timetable/clock";
import { useWords } from "../language";
import "./LeaveWhen.css";

type Props = {
  now: Now;
  later: Now | null; // null: leaving now
  arriving: boolean; // the time picked is when you want to be there, not when you leave
  validFrom: string; // the days the timetable covers
  validTo: string;
  onChange: (later: Now | null) => void;
  onArrivingChange: (arriving: boolean) => void;
};

export default function LeaveWhen({
  now,
  later,
  arriving,
  validFrom,
  validTo,
  onChange,
  onArrivingChange,
}: Props) {
  const w = useWords();
  const [typed, setTyped] = useState<string | null>(null); // what is being typed into the time
  const days = daysAhead(now.date, validFrom, validTo);

  // a moment on a day the timetable does not cover is not taken
  function pick(moment: Now) {
    if (days.includes(moment.date)) onChange(moment);
  }

  // what was typed is taken when the field is left; anything that is not a time is forgotten
  function takeTyped() {
    const seconds = typed === null ? undefined : readClock(typed);
    if (later && seconds !== undefined) pick(momentAt(later.date, seconds));
    setTyped(null);
  }

  return (
    <div className="when">
      <div className="when-row">
        <div
          className="when-mode"
          role="group"
          aria-label={w.whenLeaving}
          data-on={later === null ? 0 : 1}
        >
          <button aria-pressed={later === null} onClick={() => onChange(null)}>
            {w.leaveNow}
          </button>
          <button
            aria-pressed={later !== null}
            onClick={() => later ?? onChange(stepQuarter(now, 1))}
          >
            {w.pickTime}
          </button>
        </div>
      </div>

      {later ? (
        // leave at the time picked, or be there by it
        <div className="segmented when-kind" role="group" data-on={arriving ? 1 : 0}>
          <button aria-pressed={!arriving} onClick={() => onArrivingChange(false)}>
            {w.leaveAt}
          </button>
          <button aria-pressed={arriving} onClick={() => onArrivingChange(true)}>
            {w.arriveBy}
          </button>
        </div>
      ) : null}

      {later ? (
        <div className="when-row when-later">
          <select
            className="when-day"
            aria-label={w.day}
            value={later.date}
            onChange={(event) => pick(momentAt(event.target.value, later.seconds))}
          >
            {days.map((day) => (
              <option key={day} value={day}>
                {dayName(day, now.date, w)}
              </option>
            ))}
          </select>
          <div className="when-clock">
            <button aria-label={w.earlier} onClick={() => pick(stepQuarter(later, -1))}>
              −
            </button>
            <input
              aria-label={w.time}
              inputMode="numeric"
              value={typed ?? formatTime(later.seconds)}
              onFocus={(event) => event.target.select()}
              onChange={(event) => setTyped(event.target.value)}
              onBlur={takeTyped}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur();
                if (event.key === "Escape") {
                  setTyped(null);
                  event.currentTarget.blur();
                }
              }}
            />
            <button aria-label={w.laterBy} onClick={() => pick(stepQuarter(later, 1))}>
              +
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
