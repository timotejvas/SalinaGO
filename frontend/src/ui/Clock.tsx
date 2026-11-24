// Current time in Brno (top right), the same time the line panel works with.

import { useEffect, useState } from "react";
import { TIME_ZONE } from "../logic/timetable/clock";
import { useLanguage } from "./language";
import "./Clock.css";

// the time the same in both languages; the date the way each of them writes it
const timeFormat = new Intl.DateTimeFormat("cs-CZ", {
  timeZone: TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const dateFormats = {
  cs: new Intl.DateTimeFormat("cs-CZ", {
    timeZone: TIME_ZONE,
    weekday: "short",
    day: "numeric",
    month: "numeric",
    year: "numeric",
  }),
  en: new Intl.DateTimeFormat("en-GB", {
    timeZone: TIME_ZONE,
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  }),
};

export default function Clock() {
  const { lang } = useLanguage();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="clock">
      <div className="clock-time">{timeFormat.format(now)}</div>
      <div className="clock-date">{dateFormats[lang].format(now)}</div>
    </div>
  );
}
