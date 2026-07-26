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
    <div
      className="s2s-seg"
      role="radiogroup"
      aria-label="Adapter selector"
      style={{ marginBottom: "var(--space-3)" }}
    >
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
            className="s2s-seg-btn"
            onClick={() => {
              if (!isDisabled) onChange(option.value);
            }}
          >
            <span className="s2s-seg-icon">{option.icon}</span>
            <span>{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
