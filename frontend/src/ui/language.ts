// The language the app speaks: chosen in Settings, remembered in this browser, and at first the
// one the browser asks for (Czech or Slovak gets Czech, everything else English). Every part of
// the panel takes its words from here; the words themselves are in logic/words.ts.

import { createContext, useContext } from "react";
import { WORDS, type Lang, type Words } from "../logic/words";

const KEY = "salinago-lang";

type Language = { lang: Lang; words: Words; setLang: (lang: Lang) => void };

export const LanguageContext = createContext<Language>({
  lang: "en",
  words: WORDS.en,
  setLang: () => {},
});

// The words of the language chosen.
export const useWords = () => useContext(LanguageContext).words;
export const useLanguage = () => useContext(LanguageContext);

// The language to start with: the one chosen before, or the one of the browser.
export function firstLanguage(): Lang {
  try {
    const kept = localStorage.getItem(KEY);
    if (kept === "en" || kept === "cs") return kept;
  } catch {
    // no storage (a private window): the browser's language decides
  }
  return /^(cs|sk)\b/i.test(navigator.language) ? "cs" : "en";
}

// Remembers the language chosen, where the browser lets it.
export function keepLanguage(lang: Lang) {
  try {
    localStorage.setItem(KEY, lang);
  } catch {
    // nothing to keep it in; it is chosen again next time
  }
}
