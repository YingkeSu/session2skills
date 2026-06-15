import { messages } from "./messages.js";

export type { Locale } from "./messages.js";

import type { Locale } from "./messages.js";

export interface Translator {
  readonly locale: Locale;
  t(key: string, options?: Record<string, string | number>): string;
  tEnum(category: string, value: string): string;
}

export function createTranslator(locale: Locale): Translator {
  return {
    locale,
    t(key, options) {
      const value = messages[locale][key] ?? key;
      const template =
        typeof value === "string"
          ? value
          : (options && "count" in options
              ? Number(options.count) === 1
                ? value.one
                : value.other
              : value.other);
      if (!options) return template;
      return template.replace(/\{(\w+)\}/g, (_, name: string) =>
        name in options ? String(options[name]) : `{${name}}`,
      );
    },
    tEnum(category, value) {
      const entry = messages[locale][`enum.${category}.${value}`];
      return typeof entry === "string" ? entry : value;
    },
  };
}
