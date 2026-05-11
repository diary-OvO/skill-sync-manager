import type {
  AppSettings,
  GitStatus,
  LogEntry,
  SkillInfo,
  SyncStatus,
  ToolName,
  ToolStatus,
} from "../types";

type ImportResult =
  | { ok: true; skill: SkillInfo }
  | { ok: false; message: string };

type OpenPathResult = { ok: boolean; message?: string };

export interface SkillSyncApi {
  loadSettings(): Promise<AppSettings>;
  saveSettings(settings: AppSettings): Promise<AppSettings>;
  selectRoot(): Promise<string | null>;
  selectSkillFolder(): Promise<string | null>;
  scanSkills(root: string): Promise<SkillInfo[]>;
  importSkillFolder(source: string, root: string): Promise<ImportResult>;
  detectCliTools(): Promise<ToolStatus[]>;
  getGitStatus(root: string): Promise<GitStatus>;
  checkSyncStatus(skill: SkillInfo, toolName: ToolName): Promise<SyncStatus>;
  syncSkill(skill: SkillInfo, toolName: ToolName): Promise<SyncStatus>;
  openPath(path: string): Promise<OpenPathResult>;
  logHistory(): Promise<LogEntry[]>;
  onLog(listener: (entry: LogEntry) => void): () => void;
}

declare global {
  interface Window {
    skillSync: SkillSyncApi;
  }
}

export const api: SkillSyncApi = window.skillSync;
