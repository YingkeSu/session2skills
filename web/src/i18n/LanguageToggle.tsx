import type { JSX } from "react";
import { useLocale } from "./LocaleContext.js";

export function LanguageToggle(): JSX.Element {
  const { locale, setLocale, t } = useLocale();
  const next = locale === "zh" ? "en" : "zh";

  return (
    <button
      type="button"
      onClick={() => setLocale(next)}
      style={{
        padding: "var(--space-1) var(--space-3)",
        borderRadius: "var(--radius-sm)",
        border: "1px solid var(--border-strong)",
        background: "var(--surface)",
        color: "var(--ink-2)",
        cursor: "pointer",
        fontSize: "var(--text-sm)",
        fontWeight: 600,
        lineHeight: 1,
      }}
    >
      {t("toggle.language")}
    </button>
  );
}
