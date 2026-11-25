// The keyboard of a phone covers the bottom of the page without making it any shorter (an
// iPhone), and the browser may scroll the page up under it as well: the panel, fixed to the
// bottom of the page, ended up half under the keyboard with an empty gap above it. What is
// really left on the screen is the visual viewport; the panel stands on its bottom edge and
// measures its heights by it: --keyboard and --screen-1 (a hundredth of its height), which
// Panel.css uses.

import { useEffect } from "react";

// When the keyboard last changed what is left of the screen: the panel follows it at once then,
// rather than glide (usePanelHeight.ts) - the keyboard moves its bottom edge in one step, and a
// height still gliding to the size it had before would carry its top off the screen.
let movedAt = -Infinity;
export function keyboardJustMoved(): boolean {
  return performance.now() - movedAt < 600;
}

export function useKeyboard() {
  useEffect(() => {
    const view = window.visualViewport;
    if (!view) return;
    const root = document.documentElement;
    // Only while a keyboard covers part of the page. Otherwise the panel goes by 1dvh, which
    // the browser changes in the same moment the screen changes size (turned, a keyboard that
    // makes the page shorter on Android): a value written here would come a few frames later.
    let was = "";
    const fit = () => {
      const covered = Math.round(root.clientHeight - (view.height + view.offsetTop));
      const now = covered > 0 ? `${covered}px ${view.height / 100}px` : "";
      if (now === was) return;
      movedAt = performance.now();
      was = now;
      if (covered > 0) {
        root.style.setProperty("--keyboard", `${covered}px`);
        root.style.setProperty("--screen-1", `${view.height / 100}px`);
      } else {
        root.style.removeProperty("--keyboard");
        root.style.removeProperty("--screen-1");
      }
    };
    fit();
    view.addEventListener("resize", fit);
    view.addEventListener("scroll", fit);
    return () => {
      view.removeEventListener("resize", fit);
      view.removeEventListener("scroll", fit);
    };
  }, []);
}
