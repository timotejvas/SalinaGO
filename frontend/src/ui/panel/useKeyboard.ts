// The keyboard of a phone covers the bottom of the page without making it any shorter (an
// iPhone), and the browser may move what is seen down the page as well. What is really left on
// the screen is the visual viewport. The panel is all the way up while a keyboard is out
// (Panel.tsx), and Panel.css fits it by two numbers written here: --keyboard, how much of the
// bottom of the page the keyboard covers - what is in the panel ends above it - and --view-top,
// how far down the page what is seen begins - the top of the panel is that far down too.

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
    // Only while a keyboard is up - while what is seen is shorter than the page. Otherwise the
    // panel goes by 1dvh, which the browser changes in the same moment the screen changes size
    // (turned, a keyboard that makes the page shorter on Android): a value written here would
    // come a few frames later. An iPhone may move what is seen down the page rather than cover
    // its bottom, so nothing looks covered then - and yet the top of the panel must follow.
    let was = "";
    const fit = () => {
      const up = view.height < root.clientHeight - 1;
      const covered = Math.max(0, Math.round(root.clientHeight - (view.height + view.offsetTop)));
      const now = up ? `${covered}px ${Math.round(view.offsetTop)}px` : "";
      if (now === was) return;
      movedAt = performance.now();
      was = now;
      if (up) {
        root.style.setProperty("--keyboard", `${covered}px`);
        root.style.setProperty("--view-top", `${Math.round(view.offsetTop)}px`);
      } else {
        root.style.removeProperty("--keyboard");
        root.style.removeProperty("--view-top");
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
