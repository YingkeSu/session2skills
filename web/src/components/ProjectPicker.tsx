import type { ReactNode } from "react";

import type { DiscoveredProject } from "../runs.js";
import { useLocale } from "../i18n/LocaleContext.js";
import type { Translator } from "../i18n/translator.js";

type ProjectPickerProps = {
  adapter: string | null;
  projects?: DiscoveredProject[];
  projectsLoading: boolean;
  directory: string;
  onDirectoryChange: (directory: string) => void;
};

export function ProjectPicker({
  adapter,
  projects,
  projectsLoading,
  directory,
  onDirectoryChange,
}: ProjectPickerProps): ReactNode {
  const { t } = useLocale();
  const supportsDiscovery = adapter === "claude" || adapter === "sqlite" || adapter === "codex";
  const sorted = (projects ?? []).slice().sort((a, b) => {
    if (b.sessionCount !== a.sessionCount) return b.sessionCount - a.sessionCount;
    const at = a.lastModified ? Date.parse(a.lastModified) : 0;
    const bt = b.lastModified ? Date.parse(b.lastModified) : 0;
    return bt - at;
  });
  const hasProjects = sorted.length > 0;
  const showDiscovery = supportsDiscovery && (projectsLoading || hasProjects);
  const matched = sorted.find((p) => p.projectPath === directory);

  if (!showDiscovery) {
    return (
      <input
        id="generate-directory"
        aria-label={t("generate.directory")}
        autoComplete="off"
        value={directory}
        onChange={(event) => onDirectoryChange(event.currentTarget.value)}
        placeholder={t("generate.directoryPlaceholder")}
        style={styles.input}
      />
    );
  }

  if (projectsLoading) {
    return (
      <div style={styles.hint} aria-live="polite">
        {t("generate.directoryDetectedLoading")}
      </div>
    );
  }

  return (
    <select
      id="generate-directory"
      aria-label={t("generate.directory")}
      value={matched ? matched.projectPath : "__manual__"}
      onChange={(event) => {
        const next = event.currentTarget.value;
        if (next === "__manual__") {
          onDirectoryChange("");
        } else {
          onDirectoryChange(next);
        }
      }}
      style={styles.select}
    >
      {!matched && (
        <option value="__manual__">{t("generate.directoryManual")}</option>
      )}
      {sorted.map((project) => (
        <option key={project.encodedDir} value={project.projectPath}>
          {labelFor(project, t)}
        </option>
      ))}
    </select>
  );
}

function labelFor(
  project: DiscoveredProject,
  t: Translator["t"],
): string {
  const name = project.projectPath.split("/").pop() || project.projectPath;
  const sessions = t("generate.directorySessionCount", { count: project.sessionCount });
  return `${name}  (${sessions})`;
}

const styles: Record<string, React.CSSProperties> = {
  input: {
    width: "100%",
    padding: "6px 10px",
    border: "1px solid #d1d5db",
    borderRadius: 6,
    fontSize: 13,
  },
  select: {
    width: "100%",
    padding: "6px 10px",
    border: "1px solid #d1d5db",
    borderRadius: 6,
    fontSize: 13,
    background: "#ffffff",
  },
  hint: {
    width: "100%",
    padding: "6px 10px",
    border: "1px solid #e5e7eb",
    borderRadius: 6,
    fontSize: 13,
    color: "#6b7280",
    background: "#f9fafb",
  },
};
