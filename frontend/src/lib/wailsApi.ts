import {
  CheckSyncStatus,
  DetectCliTools,
  GetGitStatus,
  ImportSkillFolder,
  LoadSettings,
  LogHistory,
  OpenPath,
  SaveSettings,
  ScanSkills,
  SelectRootFolder,
  SelectSkillFolder,
  SyncSkillToTool,
} from "../../wailsjs/go/main/App";
import { EventsOff, EventsOn } from "../../wailsjs/runtime/runtime";

import type {
  AppSettings,
  GitStatus,
  LogEntry,
  SkillInfo,
  SyncStatus,
  ToolName,
  ToolStatus,
} from "../types";

export const wailsApi = {
  loadSettings: (): Promise<AppSettings> =>
    LoadSettings() as unknown as Promise<AppSettings>,
  saveSettings: (settings: AppSettings): Promise<void> =>
    SaveSettings(settings as any) as unknown as Promise<void>,
  selectRootFolder: (): Promise<string> =>
    SelectRootFolder() as unknown as Promise<string>,
  selectSkillFolder: (): Promise<string> =>
    SelectSkillFolder() as unknown as Promise<string>,
  openPath: (path: string): Promise<void> =>
    OpenPath(path) as unknown as Promise<void>,
  scanSkills: (root: string): Promise<SkillInfo[]> =>
    ScanSkills(root) as unknown as Promise<SkillInfo[]>,
  importSkillFolder: (source: string, root: string): Promise<SkillInfo> =>
    ImportSkillFolder(source, root) as unknown as Promise<SkillInfo>,
  detectCliTools: (): Promise<ToolStatus[]> =>
    DetectCliTools() as unknown as Promise<ToolStatus[]>,
  getGitStatus: (root: string): Promise<GitStatus> =>
    GetGitStatus(root) as unknown as Promise<GitStatus>,
  checkSyncStatus: (skill: SkillInfo, toolName: ToolName): Promise<SyncStatus> =>
    CheckSyncStatus(skill as any, toolName) as unknown as Promise<SyncStatus>,
  syncSkillToTool: (skill: SkillInfo, toolName: ToolName): Promise<SyncStatus> =>
    SyncSkillToTool(skill as any, toolName) as unknown as Promise<SyncStatus>,
  logHistory: (): Promise<LogEntry[]> =>
    LogHistory() as unknown as Promise<LogEntry[]>,

  onLog(listener: (entry: LogEntry) => void): () => void {
    const unsubscribe = EventsOn("log:entry", (entry: LogEntry) => listener(entry));
    return () => {
      try {
        unsubscribe();
      } catch {
        EventsOff("log:entry");
      }
    };
  },
};
