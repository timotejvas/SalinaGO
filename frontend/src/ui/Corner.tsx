// The corners of the map: at the top right one pane of glass as a widget is, with the time and
// the day, and under it a smaller one saying whether the vehicles are live and how many; at the
// bottom right, out of the way, the button that opens the settings.

import { useEffect, useState } from "react";
import Clock from "./Clock";
import LiveWaves from "./LiveWaves";
import type { LiveStatus } from "../logic/live/vehicles";
import { useWords } from "./language";
import "./Corner.css";

const OPEN_MS = 4000; // how long the live status stays open on a phone after a tap

type Props = {
  onSettings?: () => void; // not there yet while the page loads: no gear then
  status: LiveStatus | null; // of the stream; null while the app is still loading
  count: number; // vehicles on the way right now
};

export default function Corner({ onSettings, status, count }: Props) {
  const w = useWords();
  const offline = status === "offline";
  // On a phone the live status is only its signal, a small round pane: a tap opens it to say
  // how many vehicles are live, and it folds again after a while. A wide screen always says it.
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const fold = setTimeout(() => setOpen(false), OPEN_MS);
    return () => clearTimeout(fold);
  }, [open]);
  return (
    <>
      <div className="corner">
        <div className="widget">
          <Clock />
        </div>
        {status === null || status === "connecting" ? null : (
          <button
            className={`widget-live ${offline ? "off" : ""} ${open ? "open" : ""}`}
            onClick={() => setOpen((was) => !was)}
          >
            {offline ? <span className="live-off-dot" /> : <LiveWaves />}
            <span className="widget-live-text" role="status" aria-live="polite">
              {offline ? w.noLiveData : w.liveVehicles(count)}
            </span>
          </button>
        )}
      </div>
      {onSettings ? (
        <button className="gear" aria-label={w.settings} onClick={onSettings}>
          {/* a cog: a wheel with eight square teeth and a hole in the middle */}
          <svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true">
            <mask id="gear-hole">
              <rect width="24" height="24" fill="#fff" />
              <circle cx="12" cy="12" r="3" fill="#000" />
            </mask>
            <g fill="currentColor" mask="url(#gear-hole)">
              <circle cx="12" cy="12" r="7" />
              {[0, 45, 90, 135, 180, 225, 270, 315].map((turn) => (
                <rect
                  key={turn}
                  x="10.2"
                  y="2"
                  width="3.6"
                  height="4.5"
                  rx="1"
                  transform={`rotate(${turn} 12 12)`}
                />
              ))}
            </g>
          </svg>
        </button>
      ) : null}
    </>
  );
}
