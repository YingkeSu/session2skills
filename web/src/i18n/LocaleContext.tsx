import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { loadSavedLocale, saveLocale } from "./locale-storage.js";
import type { Locale } from "./messages.js";
import { createTranslator, type Translator } from "./translator.js";

const DEFAULT_LOCALE: Locale = "zh";

type LocaleContextValue = Translator & {
  locale: Locale;
  setLocale: (locale: Locale) => void;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({
  children,
}: {
  children: ReactNode;
}): JSX.Element {
  const [locale, setLocaleState] = useState<Locale>(
    () => loadSavedLocale() ?? DEFAULT_LOCALE,
  );

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    saveLocale(next);
  }, []);

  const value = useMemo<LocaleContextValue>(
    () => ({
      ...createTranslator(locale),
      locale,
      setLocale,
    }),
    [locale, setLocale],
  );

  return (
    <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
  );
}

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) {
    throw new Error("useLocale must be used within a LocaleProvider");
  }
  return ctx;
}
