// What walking needs (logic/walk/load.ts), as soon as something wants it: null until then and
// while it downloads, false when it could not be downloaded. Every part of the app that asks
// gets the same download.

import { useEffect, useState } from "react";
import { loadWalking, type Walking } from "../logic/walk/load";

export function useWalking(wanted: boolean): Walking | null | false {
  const [walking, setWalking] = useState<Walking | null | false>(null);
  useEffect(() => {
    if (!wanted || walking) return;
    let current = true;
    loadWalking()
      .then((loaded) => current && setWalking(loaded))
      .catch(() => current && setWalking(false)); // stations are still offered, not addresses
    return () => {
      current = false;
    };
  }, [wanted, walking]);
  return walking;
}
