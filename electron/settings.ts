import fs from "node:fs";
import path from "node:path";
import { app } from "electron";

export type AppSettings = {
  projectDirectory: string;
  llmBaseUrl: string;
  llmModel: string;
  llmApiKey: string;
  adapter: string;
};

const DEFAULT_SETTINGS: AppSettings = {
  projectDirectory: "",
  llmBaseUrl: "",
  llmModel: "",
  llmApiKey: "",
  adapter: "sdk",
};

let cachedSettings: AppSettings | null = null;

function getSettingsPath(): string {
  return path.join(app.getPath("userData"), "settings.json");
}

export function loadSettings(): AppSettings {
  if (cachedSettings) return cachedSettings;

  try {
    const raw = fs.readFileSync(getSettingsPath(), "utf8");
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      cachedSettings = { ...DEFAULT_SETTINGS, ...(parsed as Partial<AppSettings>) };
      return cachedSettings;
    }
  } catch {}

  cachedSettings = { ...DEFAULT_SETTINGS };
  return cachedSettings;
}

export function saveSettings(partial: Partial<AppSettings>): AppSettings {
  const current = loadSettings();
  const merged = { ...current, ...partial };
  fs.writeFileSync(getSettingsPath(), JSON.stringify(merged, null, 2), "utf8");
  cachedSettings = merged;
  return merged;
}
