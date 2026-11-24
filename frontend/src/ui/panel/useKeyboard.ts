// The keyboard of a phone covers the bottom of the page without making it any shorter (an
// iPhone), and the browser may scroll the page up under it as well: the panel, fixed to the
// bottom of the page, ended up half under the keyboard with an empty gap above it. What is
// really left on the screen is the visual viewport; the panel stands on its bottom edge and
// measures its heights by it: --keyboard and --screen-1 (a hundredth of its height), which
// Panel.css uses.

import { useEffect } from "react";

export function useKeyboard() {
  useEffect(() => {
    const view = window.visualViewport;
    if (!view) return;
    const root = document.documentElement;
    const fit = () => {
      const covered = root.clientHeight - (view.height + view.offsetTop);
      root.style.setProperty("--keyboard", `${Math.max(0, Math.round(covered))}px`);
      root.style.setProperty("--screen-1", `${view.height / 100}px`);
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
