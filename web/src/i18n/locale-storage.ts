import type { Locale } from "./messages.js";

const STORAGE_KEY = "session2skills-locale";

export function loadSavedLocale(): Locale | null {
  try {
    if (typeof localStorage === "undefined") return null;
    const value = localStorage.getItem(STORAGE_KEY);
    if (value === "zh" || value === "en") return value;
    return null;
  } catch {
    return null;
  }
}

export function saveLocale(locale: Locale): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // localStorage may be unavailable (private mode, quota, etc.)
  }
}
