import type { ReactNode } from "react";

import type { AdapterInfo } from "../runs.js";

type ProviderOption = {
  value: string;
  label: string;
  icon: string;
};

const options: ProviderOption[] = [
  { value: "all", label: "all", icon: "🌐" },
  { value: "sdk", label: "opencode", icon: "🔧" },
  { value: "codex", label: "codex", icon: "🤖" },
  { value: "claude", label: "claude", icon: "✨" },
  { value: "sqlite", label: "sqlite", icon: "🗄️" },
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
    gap: 8,
    marginBottom: 12,
  },
  button: {
    border: "1px solid #d0d5dd",
    borderRadius: 8,
    padding: "6px 12px",
    fontSize: 13,
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    background: "transparent",
    color: "#374151",
    transition: "background 0.15s ease, border-color 0.15s ease",
  },
  buttonActive: {
    background: "#111827",
    borderColor: "#111827",
    color: "#f9fafb",
  },
  buttonInactive: {
    background: "#ffffff",
    borderColor: "#d0d5dd",
    color: "#374151",
  },
  buttonDisabled: {
    opacity: 0.4,
    cursor: "not-allowed",
  },
  icon: {
    fontSize: 14,
    lineHeight: 1,
  },
};
