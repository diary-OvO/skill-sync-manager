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

// Wails 代码生成侧的返回类型带有它自己的类命名空间（main.xxx），
// 与前端 types.ts 中的 interface 结构一致但名称不同。
// 为避免在每个调用里重复写 `as unknown as Promise<T>`，
// 这里用一个泛型小工具统一做桥接。
const bridge = <T,>(p: unknown): Promise<T> => p as Promise<T>;

export const wailsApi = {
  loadSettings: (): Promise<AppSettings> => bridge(LoadSettings()),
  saveSettings: (settings: AppSettings): Promise<void> =>
    bridge(SaveSettings(settings as never)),
  selectRootFolder: (): Promise<string> => bridge(SelectRootFolder()),
  selectSkillFolder: (): Promise<string> => bridge(SelectSkillFolder()),
  openPath: (path: string): Promise<void> => bridge(OpenPath(path)),
  scanSkills: (root: string): Promise<SkillInfo[]> => bridge(ScanSkills(root)),
  importSkillFolder: (source: string, root: string): Promise<SkillInfo> =>
    bridge(ImportSkillFolder(source, root)),
  detectCliTools: (): Promise<ToolStatus[]> => bridge(DetectCliTools()),
  getGitStatus: (root: string): Promise<GitStatus> => bridge(GetGitStatus(root)),
  checkSyncStatus: (skill: SkillInfo, toolName: ToolName): Promise<SyncStatus> =>
    bridge(CheckSyncStatus(skill as never, toolName)),
  syncSkillToTool: (skill: SkillInfo, toolName: ToolName): Promise<SyncStatus> =>
    bridge(SyncSkillToTool(skill as never, toolName)),
  logHistory: (): Promise<LogEntry[]> => bridge(LogHistory()),

  scanCliTool: (toolName: SupportedTool, sharedRoot: string): Promise<CliSkillEntry[]> =>
    bridge(ScanCliTool(toolName, sharedRoot)),
  refreshSyncStatuses: (
    skills: SkillInfo[],
  ): Promise<Record<string, Record<string, SyncStatus>>> =>
    bridge(RefreshSyncStatuses(skills as never)),
  unlinkSkill: (toolName: SupportedTool, skillName: string): Promise<void> =>
    bridge(UnlinkSkill(toolName, skillName)),
  importSkillFromCli: (
    toolName: SupportedTool,
    cliSkillName: string,
    sharedRoot: string,
    origin: SkillOrigin,
  ): Promise<SkillInfo> =>
    bridge(ImportSkillFromCli(toolName, cliSkillName, sharedRoot, origin)),
  setSkillMetadata: (
    sharedRoot: string,
    skillName: string,
    patch: SkillMetadataPatch,
  ): Promise<RegistryEntry> =>
    bridge(SetSkillMetadata(sharedRoot, skillName, patch as never)),
  getRegistry: (sharedRoot: string): Promise<Registry> => bridge(GetRegistry(sharedRoot)),

  // 订阅后端 `log:entry` 事件；返回的函数可用于取消订阅。
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

  // quitApp 会走 Go 端完整的关闭流水线（runShutdown -> runtime.Quit）。
  // 优先使用本方法，未来在 runShutdown 中新增的清理逻辑也会被执行。
  quitApp: (): Promise<void> => bridge(QuitApp()),

  // quitImmediate 跳过 Go 端流水线，直接请求 Wails 销毁窗口。
  // 仅当后端已不可达（例如在 vite preview 等非 Wails 环境）时才使用。
  quitImmediate: (): void => {
    try {
      RuntimeQuit();
    } catch {
      /* 非 Wails 开发环境（如 vite preview）下 runtime 不可用 */
    }
  },
};
