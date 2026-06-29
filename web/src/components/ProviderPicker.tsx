import type { ReactNode } from "react";

import type { AdapterInfo } from "../runs.js";

type ProviderOption = {
  value: string;
  label: string;
  icon: string;
};

// The OpenCode session history lives in opencode.db, which the backend serves
// via the `sqlite` adapter (the only OpenCode source that supports project
// discovery). The `sdk` adapter is a live @opencode-ai/sdk client with no
// on-disk projects, so it is intentionally not exposed here.
const options: ProviderOption[] = [
  { value: "all", label: "all", icon: "🌐" },
  { value: "sqlite", label: "opencode", icon: "🔧" },
  { value: "codex", label: "codex", icon: "🤖" },
  { value: "claude", label: "claude", icon: "✨" },
];

type ProviderPickerProps = {
  value: string;
  onChange: (value: string) => void;
  adapters?: AdapterInfo[];
};

export function ProviderPicker({
  value,
  onChange,
  adapters,
}: ProviderPickerProps): ReactNode {
  const availabilityMap = new Map(
    (adapters ?? []).map((a) => [a.type, a.available] as const),
  );
  const hasAvailabilityInfo = (adapters?.length ?? 0) > 0;

  return (
    <div style={styles.container} role="radiogroup" aria-label="Adapter selector">
      {options.map((option) => {
        const isActive = value === option.value;
        const isAvailable = !hasAvailabilityInfo || option.value === "all"
          ? true
          : availabilityMap.get(option.value) ?? false;
        const isDisabled = hasAvailabilityInfo && option.value !== "all" && !isAvailable;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={isActive}
            aria-disabled={isDisabled || undefined}
            data-available={hasAvailabilityInfo && option.value !== "all" ? isAvailable : undefined}
            disabled={isDisabled || undefined}
            title={
              hasAvailabilityInfo && option.value !== "all" && !isAvailable
                ? `${option.label} not detected`
                : undefined
            }
            style={{
              ...styles.button,
              ...(isActive ? styles.buttonActive : styles.buttonInactive),
              ...(isDisabled ? styles.buttonDisabled : {}),
            }}
            onClick={() => {
              if (!isDisabled) onChange(option.value);
            }}
          >
            <span style={styles.icon}>{option.icon}</span>
            <span>{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    flexWrap: "wrap",
    gap: "var(--space-2)",
    marginBottom: "var(--space-3)",
  },
  button: {
    border: "1px solid var(--border-strong)",
    borderRadius: "var(--radius)",
    padding: "var(--space-2) var(--space-3)",
    fontSize: "var(--text-sm)",
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    gap: "var(--space-2)",
    background: "transparent",
    color: "var(--ink-2)",
    transition: "background 0.15s ease, border-color 0.15s ease, color 0.15s ease",
  },
  buttonActive: {
    background: "var(--accent)",
    borderColor: "var(--accent)",
    color: "var(--ink-on-fill)",
  },
  buttonInactive: {
    background: "var(--surface)",
    borderColor: "var(--border-strong)",
    color: "var(--ink-2)",
  },
  buttonDisabled: {
    opacity: 0.4,
    cursor: "not-allowed",
  },
  icon: {
    fontSize: "var(--text-base)",
    lineHeight: 1,
  },
};
