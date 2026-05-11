import {
  CheckSyncStatus,
  DetectCliTools,
  GetGitStatus,
  GetRegistry,
  ImportSkillFolder,
  ImportSkillFromCli,
  LoadSettings,
  LogHistory,
  OpenPath,
  QuitApp,
  RefreshSyncStatuses,
  SaveSettings,
  ScanCliTool,
  ScanSkills,
  SelectRootFolder,
  SelectSkillFolder,
  SetSkillMetadata,
  SyncSkillToTool,
  UnlinkSkill,
} from "../../wailsjs/go/main/App";
import { EventsOff, EventsOn, Quit as RuntimeQuit } from "../../wailsjs/runtime/runtime";

import type {
  AppSettings,
  CliSkillEntry,
  GitStatus,
  LogEntry,
  Registry,
  RegistryEntry,
  SkillInfo,
  SkillMetadataPatch,
  SkillOrigin,
  SupportedTool,
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

  scanCliTool: (toolName: SupportedTool, sharedRoot: string): Promise<CliSkillEntry[]> =>
    ScanCliTool(toolName, sharedRoot) as unknown as Promise<CliSkillEntry[]>,
  refreshSyncStatuses: (
    skills: SkillInfo[],
  ): Promise<Record<string, Record<string, SyncStatus>>> =>
    RefreshSyncStatuses(skills as any) as unknown as Promise<
      Record<string, Record<string, SyncStatus>>
    >,
  unlinkSkill: (toolName: SupportedTool, skillName: string): Promise<void> =>
    UnlinkSkill(toolName, skillName) as unknown as Promise<void>,
  importSkillFromCli: (
    toolName: SupportedTool,
    cliSkillName: string,
    sharedRoot: string,
    origin: SkillOrigin,
  ): Promise<SkillInfo> =>
    ImportSkillFromCli(toolName, cliSkillName, sharedRoot, origin) as unknown as Promise<SkillInfo>,
  setSkillMetadata: (
    sharedRoot: string,
    skillName: string,
    patch: SkillMetadataPatch,
  ): Promise<RegistryEntry> =>
    SetSkillMetadata(sharedRoot, skillName, patch as any) as unknown as Promise<RegistryEntry>,
  getRegistry: (sharedRoot: string): Promise<Registry> =>
    GetRegistry(sharedRoot) as unknown as Promise<Registry>,

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

  // quitApp triggers the full shutdown pipeline on the Go side
  // (runShutdown -> runtime.Quit). Prefer this over RuntimeQuit so any future
  // cleanup added in runShutdown is honored.
  quitApp: (): Promise<void> => QuitApp() as unknown as Promise<void>,

  // quitImmediate bypasses the Go-side pipeline and asks Wails to tear down
  // directly. Use only when the backend is already gone or not reachable.
  quitImmediate: (): void => {
    try {
      RuntimeQuit();
    } catch {
      /* runtime unavailable in non-Wails dev context (e.g. vite preview) */
    }
  },
};
