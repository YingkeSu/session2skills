import { useMemo, useState, type JSX } from "react";

import { tokenizeJson } from "../lib/json-highlight.js";
import { useLocale } from "../i18n/LocaleContext.js";

/**
 * Inline disclosure that pretty-prints an arbitrary value as syntax-highlighted
 * JSON. Uses a dependency-free tokenizer (lib/json-highlight.ts) so it works on
 * raw API/report payloads without pulling in a highlighting library.
 *
 * Rendered as a native <details> (keyboard-accessible: Enter/Space toggles).
 * The JSON body is rendered lazily — only while open — so a collapsed drawer
 * does not dump its payload into the DOM (avoids polluting text search and
 * keeps large traces cheap until the user actually opens them).
 */
type RawJsonDrawerProps = {
  value: unknown;
  label?: string;
  testId?: string;
  defaultOpen?: boolean;
};

export function RawJsonDrawer({
  value,
  label,
  testId,
  defaultOpen = false,
}: RawJsonDrawerProps): JSX.Element {
  const { t } = useLocale();
  const [open, setOpen] = useState(defaultOpen);
  const tokens = useMemo(
    () => (open ? tokenizeJson(JSON.stringify(value, null, 2)) : []),
    [open, value],
  );

  return (
    <details
      className="raw-json-drawer"
      data-testid={testId}
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="s2s-btn s2s-btn-ghost raw-json-toggle">
        {label ?? t("rawJson.show")}
      </summary>
      {open && (
        <pre className="raw-json-pre">
          <code>
            {tokens.map((token, idx) =>
              token.type === "ws" ? (
                token.value
              ) : (
                <span key={idx} className={`json-${token.type}`}>
                  {token.value}
                </span>
              ),
            )}
          </code>
        </pre>
      )}
    </details>
  );
}
