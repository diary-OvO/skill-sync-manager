import { app } from "electron";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { SkillInfo, SyncStatus, ToolName } from "./types";
import { isSupportedTool } from "./types";
import {
  createDirectoryJunction,
  isLinkPath,
  isWindows,
  pathExists,
  readLinkIfAny,
} from "./symlinkWindows";

function getHomeDir(): string {
  try {
    return app.getPath("home");
  } catch {
    return process.env.USERPROFILE || process.env.HOME || "";
  }
}

export function getClaudeSkillsDir(): string {
  return path.join(getHomeDir(), ".claude", "skills");
}

export function getCodexSkillsDir(): string {
  return path.join(getHomeDir(), ".agents", "skills");
}

export function getTargetDir(toolName: ToolName): string {
  switch (toolName) {
    case "claude":
      return getClaudeSkillsDir();
    case "codex":
      return getCodexSkillsDir();
    default:
      // Unsupported tools don't have a real target; return something so paths
      // can still be shown in the UI, but callers should guard on isSupportedTool.
      return path.join(getHomeDir(), `.${toolName}`, "skills");
  }
}

export function getTargetPath(toolName: ToolName, skillName: string): string {
  return path.join(getTargetDir(toolName), skillName);
}

export async function checkSyncStatus(
  skill: SkillInfo,
  toolName: ToolName,
): Promise<SyncStatus> {
  const targetPath = getTargetPath(toolName, skill.name);
  const base = { targetName: toolName, targetPath };

  if (!isSupportedTool(toolName)) {
    return { ...base, state: "unsupported", message: `${toolName} sync is not yet supported.` };
  }

  if (!skill.valid) {
    return {
      ...base,
      state: "invalid",
      message: `Skill is invalid: ${skill.errors.join("; ") || "unknown error"}`,
    };
  }

  if (!isWindows()) {
    return {
      ...base,
      state: "error",
      message: "Current version only supports Windows directory junctions for sync.",
    };
  }

  const exists = await pathExists(targetPath).catch(() => false);
  if (!exists) {
    return { ...base, state: "missing", message: "Not synced yet." };
  }

  const isLink = await isLinkPath(targetPath);
  if (!isLink) {
    return {
      ...base,
      state: "conflict",
      message: `A real directory (not a junction) already exists at ${targetPath}.`,
    };
  }

  const linked = await readLinkIfAny(targetPath);
  const normalized = (p: string) => path.resolve(p).toLowerCase();
  if (linked && normalized(linked) === normalized(skill.path)) {
    return { ...base, state: "synced", message: `Junction points to ${linked}` };
  }

  return {
    ...base,
    state: "conflict",
    message: `Existing junction points elsewhere: ${linked ?? "unknown"}`,
  };
}

export async function syncSkillToTool(
  skill: SkillInfo,
  toolName: ToolName,
): Promise<SyncStatus> {
  const current = await checkSyncStatus(skill, toolName);
  if (current.state === "synced") return current;
  if (current.state === "unsupported") return current;
  if (current.state === "invalid") return current;
  if (current.state === "conflict") return current;

  if (!isWindows()) {
    return {
      ...current,
      state: "error",
      message: "Current version only supports Windows directory junctions for sync.",
    };
  }

  const targetPath = current.targetPath;
  const targetDir = path.dirname(targetPath);
  try {
    await fs.mkdir(targetDir, { recursive: true });
    await createDirectoryJunction(targetPath, skill.path);
    return {
      targetName: toolName,
      targetPath,
      state: "synced",
      message: `Created junction ${targetPath} -> ${skill.path}`,
    };
  } catch (err) {
    return {
      targetName: toolName,
      targetPath,
      state: "error",
      message: (err as Error).message,
    };
  }
}
