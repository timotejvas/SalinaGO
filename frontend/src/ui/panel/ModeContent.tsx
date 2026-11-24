// The mode, kept under a station, a vehicle or a line opened over it. Hidden it stays drawn,
// only out of sight, so that coming back it is as it was left - the ways found already there,
// not each of them coming in again one after another - and it comes back as one piece, rising
// into place as the panel glides to its height. The same when you go back to a mode kept out
// of sight under the other (the journey under the lines).

import { useEffect, useRef, type ReactNode } from "react";
import { EASE, lessMotion } from "../../screen";
import type { Mode } from "./Panel";

type Props = {
  hidden: boolean;
  mode: Mode;
  children: ReactNode;
};

export default function ModeContent({ hidden, mode, children }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const was = useRef({ hidden, mode });
  useEffect(() => {
    const back = (was.current.hidden && !hidden) || (!hidden && was.current.mode !== mode);
    was.current = { hidden, mode };
    if (!back || !ref.current || lessMotion()) return;
    for (const part of ref.current.children) {
      if (part.hasAttribute("hidden")) continue;
      part.animate(
        [
          { opacity: 0, transform: "translateY(8px) scale(0.985)" },
          { opacity: 1, transform: "none" },
        ],
        { duration: 420, easing: EASE },
      );
    }
  }, [hidden, mode]);
  return (
    <div className="mode-content" ref={ref} hidden={hidden} inert={hidden}>
      {children}
    </div>
  );
}
