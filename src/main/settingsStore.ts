import { app } from "electron";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { AppSettings } from "./types";

const DEFAULT_SETTINGS: AppSettings = {
  sharedRoot: null,
};

function getSettingsPath(): string {
  return path.join(app.getPath("userData"), "settings.json");
}

export async function loadSettings(): Promise<AppSettings> {
  const file = getSettingsPath();
  try {
    const raw = await fs.readFile(file, "utf8");
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return {
      sharedRoot: typeof parsed.sharedRoot === "string" ? parsed.sharedRoot : null,
    };
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e.code === "ENOENT") {
      return { ...DEFAULT_SETTINGS };
    }
    return { ...DEFAULT_SETTINGS };
  }
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  const file = getSettingsPath();
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(settings, null, 2), "utf8");
}
