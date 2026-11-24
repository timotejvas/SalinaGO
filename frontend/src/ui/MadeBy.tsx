// Whose work this is: a quiet line at the foot of the map, in the middle, out of the way of
// everything else. The name links to its author's LinkedIn.

import { useWords } from "./language";
import "./MadeBy.css";

// ---------- settings ----------
const LINKEDIN = "https://www.linkedin.com/in/timotejvasko/";
// ------------------------------

export default function MadeBy() {
  const w = useWords();
  return (
    <p className="made-by">
      {w.madeBy}{" "}
      <a href={LINKEDIN} target="_blank" rel="noreferrer">
        Timotej V.
      </a>
    </p>
  );
}
