// What is in the panel changes at once - a station opened, closed, a line, the way you are on -
// but its height glides from the old to the new, so that the panel grows and shrinks rather
// than jumps. On a phone also when it is let go or asked to a height - not while a finger moves
// it, which it follows as it is. Not at all for those who want less motion.

import { useEffect, type RefObject } from "react";
import { EASE, lessMotion } from "../../screen";

const GLIDE = { duration: 380, easing: EASE };

export function usePanelHeight(panelRef: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    let height = panel.getBoundingClientRect().height;
    let glide: Animation | null = null;

    // the observer sees the new height before it is painted, so the glide starts from the old
    const observer = new ResizeObserver(() => {
      if (glide) return; // its own frames; where it ends is looked at when it has
      const to = panel.getBoundingClientRect().height;
      const from = height;
      height = to;
      if (lessMotion() || panel.classList.contains("held") || Math.abs(to - from) < 2) return;
      panel.classList.add("gliding");
      // (its sizes include its padding and edge, as measured; and its highest, max-height,
      // would hold it down when it shrinks)
      glide = panel.animate(
        { height: [`${from}px`, `${to}px`], maxHeight: ["none", "none"] },
        GLIDE,
      );
      glide.onfinish = glide.oncancel = () => {
        glide = null;
        panel.classList.remove("gliding");
        // it may have changed again meanwhile: from where the glide ended to that
        const now = panel.getBoundingClientRect().height;
        if (Math.abs(now - to) >= 2) {
          height = to;
          observer.disconnect();
          observer.observe(panel); // observing again reports the size, and glides to it
        } else height = now;
      };
    });
    observer.observe(panel);
    return () => {
      observer.disconnect();
      glide?.cancel();
    };
  }, [panelRef]);
}
