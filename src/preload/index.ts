import { contextBridge, ipcRenderer } from "electron";
import type {
  AppSettings,
  GitStatus,
  LogEntry,
  SkillInfo,
  SyncStatus,
  ToolName,
  ToolStatus,
} from "../shared/types";

type ImportResult =
  | { ok: true; skill: SkillInfo }
  | { ok: false; message: string };

type OpenPathResult = { ok: boolean; message?: string };

const api = {
  loadSettings: (): Promise<AppSettings> => ipcRenderer.invoke("settings:load"),

  saveSettings: (settings: AppSettings): Promise<AppSettings> =>
    ipcRenderer.invoke("settings:save", settings),

  selectRoot: (): Promise<string | null> => ipcRenderer.invoke("dialog:select-root"),

  selectSkillFolder: (): Promise<string | null> =>
    ipcRenderer.invoke("dialog:select-skill-folder"),

  scanSkills: (root: string): Promise<SkillInfo[]> =>
    ipcRenderer.invoke("skills:scan", root),

  importSkillFolder: (source: string, root: string): Promise<ImportResult> =>
    ipcRenderer.invoke("skills:import", source, root),

  detectCliTools: (): Promise<ToolStatus[]> => ipcRenderer.invoke("tools:detect"),

  getGitStatus: (root: string): Promise<GitStatus> =>
    ipcRenderer.invoke("git:status", root),

  checkSyncStatus: (skill: SkillInfo, toolName: ToolName): Promise<SyncStatus> =>
    ipcRenderer.invoke("sync:check", skill, toolName),

  syncSkill: (skill: SkillInfo, toolName: ToolName): Promise<SyncStatus> =>
    ipcRenderer.invoke("sync:skill", skill, toolName),

  openPath: (path: string): Promise<OpenPathResult> =>
    ipcRenderer.invoke("shell:open-path", path),

  logHistory: (): Promise<LogEntry[]> => ipcRenderer.invoke("log:history"),

  onLog: (listener: (entry: LogEntry) => void): (() => void) => {
    const handler = (_evt: unknown, entry: LogEntry) => listener(entry);
    ipcRenderer.on("log:entry", handler);
    return () => {
      ipcRenderer.removeListener("log:entry", handler);
    };
  },
};

contextBridge.exposeInMainWorld("skillSync", api);

export type SkillSyncApi = typeof api;
