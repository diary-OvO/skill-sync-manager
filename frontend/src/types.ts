export type SyncState =
  | "missing"
  | "synced"
  | "conflict"
  | "invalid"
  | "unsupported"
  | "error";

export type SkillOrigin = "owned" | "vendored" | "unknown";

export interface SkillInfo {
  name: string;
  description: string;
  path: string;
  valid: boolean;
  errors: string[];
  frontmatter: Record<string, string>;
  bodyPreview: string;
  origin: SkillOrigin;
  hidden: boolean;
  frozen: boolean;
  importedFrom?: string;
  importedAtUnix?: number;
}

export interface ToolStatus {
  toolName: string;
  executablePath: string | null;
  detected: boolean;
  supported: boolean;
}

export interface GitStatus {
  gitAvailable: boolean;
  isRepo: boolean;
  hasRemote: boolean;
  remotes: string[];
  dirty: boolean;
  branch: string | null;
  error?: string;
}

export interface SyncStatus {
  targetName: string;
  targetPath: string;
  state: SyncState;
  message: string;
}

export interface AppSettings {
  sharedRoot: string | null;
}

export interface LogEntry {
  timestamp: string;
  action: string;
  result: "info" | "success" | "error";
  message: string;
}

export type CliSkillKind = "managed" | "stray-link" | "shadowing" | "external";

export interface CliSkillEntry {
  toolName: string;
  skillName: string;
  path: string;
  kind: CliSkillKind;
  isLink: boolean;
  linkTarget?: string;
  hasSkillMd: boolean;
  sharedRootPath?: string;
}

export interface RegistryEntry {
  origin?: SkillOrigin;
  hidden?: boolean;
  frozen?: boolean;
  importedFrom?: string;
  importedAtUnix?: number;
}

export interface Registry {
  version: number;
  skills: Record<string, RegistryEntry>;
}

export interface SkillMetadataPatch {
  hidden?: boolean;
  frozen?: boolean;
  origin?: SkillOrigin;
}

export const SUPPORTED_TOOLS = ["claude", "codex"] as const;
export const UNSUPPORTED_TOOLS = ["gemini", "opencode", "hermes"] as const;
export const ALL_TOOLS = [...SUPPORTED_TOOLS, ...UNSUPPORTED_TOOLS] as const;

export type SupportedTool = (typeof SUPPORTED_TOOLS)[number];
export type UnsupportedTool = (typeof UNSUPPORTED_TOOLS)[number];
export type ToolName = (typeof ALL_TOOLS)[number];

export function isSupportedTool(name: string): name is SupportedTool {
  return (SUPPORTED_TOOLS as readonly string[]).includes(name);
}
