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
        padding: "4px 12px",
        borderRadius: "4px",
        border: "1px solid #ced4da",
        background: "#fff",
        cursor: "pointer",
        fontSize: "13px",
        fontWeight: 600,
        lineHeight: 1,
      }}
    >
      {t("toggle.language")}
    </button>
  );
}
