// Settings: a pane of glass in the middle of the screen, over the map dimmed and blurred under
// it - the language, and what the app is built from: how current the timetable is, whether the
// live positions are coming, and whose data and work all of it is. A click beside it, Escape or
// the close button puts it away.

import { useEffect, useState } from "react";
import type { TransitData } from "../logic/timetable/loadData";
import { formatDate, TIME_ZONE } from "../logic/timetable/clock";
import type { LiveStatus } from "../logic/live/vehicles";
import type { Lang } from "../logic/words";
import { useLanguage } from "./language";
import Report from "./Report";
import { VERSION } from "../version";
import "./Settings.css";

// ---------- settings ----------
const LINKEDIN = "https://www.linkedin.com/in/timotejvasko/";
const LANGUAGES: { lang: Lang; label: string }[] = [
  { lang: "en", label: "English" },
  { lang: "cs", label: "Čeština" },
];
const CLOSE_MS = 220; // keep in sync with the way out in Settings.css
// ------------------------------

type Props = {
  data: TransitData;
  liveStatus: LiveStatus;
  vehicles: number; // how many are out there now
  context: string; // what is open, sent with a report
  onClose: () => void;
};

export default function Settings({ data, liveStatus, vehicles, context, onClose }: Props) {
  const { lang, words: w, setLang } = useLanguage();
  const on = LANGUAGES.findIndex((l) => l.lang === lang);
  const [closing, setClosing] = useState(false);
  const [reporting, setReporting] = useState(false);

  // it goes the way it came, and is taken off the page after
  function close() {
    setClosing(true);
    setTimeout(onClose, CLOSE_MS);
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className={`settings-veil ${closing ? "closing" : ""}`} onClick={close}>
      <div
        className="settings"
        role="dialog"
        aria-modal="true"
        aria-label={w.settings}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="settings-head">
          <h1>{w.settings}</h1>
          <button className="settings-close" aria-label={w.close} onClick={close}>
            ✕
          </button>
        </header>

        {reporting ? (
          <Report context={context} onBack={() => setReporting(false)} />
        ) : (
          <>
            <section>
              <h2>{w.language}</h2>
              <div className="segmented" role="group" aria-label={w.language} data-on={on}>
                {LANGUAGES.map((l) => (
                  <button
                    key={l.lang}
                    aria-pressed={l.lang === lang}
                    onClick={() => setLang(l.lang)}
                  >
                    {l.label}
                  </button>
                ))}
              </div>
            </section>

            <section>
              <h2>{w.aboutData}</h2>
              <dl className="about">
                <dt>{w.timetable}</dt>
                <dd>
                  KORDIS JMK
                  {/* which version: the day KORDIS published it, when that is known */}
                  {data.published &&
                    ` · ${w.timetablePublished(formatDate(dayOf(data.published), true, w))}`}
                </dd>
                <dt>{w.livePositions}</dt>
                <dd className={liveStatus === "live" ? "is-live" : ""}>
                  {w.liveStatus(liveStatus, vehicles)}
                </dd>
                <dt>{w.mapData}</dt>
                <dd>© OpenStreetMap contributors · © CARTO</dd>
                <dt>{w.sources}</dt>
                <dd>data.brno.cz · KORDIS JMK (CC BY 4.0)</dd>
              </dl>
            </section>

            <button className="report-open" onClick={() => setReporting(true)}>
              {w.report}
            </button>
          </>
        )}

        <p className="settings-foot">
          {w.madeBy} Timotej V. ·{" "}
          <a href={LINKEDIN} target="_blank" rel="noreferrer">
            LinkedIn
          </a>{" "}
          · {w.version} {VERSION}
        </p>
      </div>
    </div>
  );
}

// The day of a moment in Brno, as formatDate takes it: "2026-11-20T20:47:06Z" -> "20261120".
function dayOf(iso: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(new Date(iso));
  return parts.replaceAll("-", "");
}
