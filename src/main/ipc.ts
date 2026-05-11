import { dialog, ipcMain, shell } from "electron";
import type { BrowserWindow as BrowserWindowType } from "electron";
import { detectCliTools } from "./cliDetector";
import { getGitStatus } from "./gitStatus";
import { logger } from "./logger";
import { loadSettings, saveSettings } from "./settingsStore";
import { importSkillFolder, scanSkills } from "./skillScanner";
import {
  checkSyncStatus,
  getTargetPath,
  syncSkillToTool,
} from "./syncTargets";
import type { AppSettings, SkillInfo, ToolName } from "./types";
import { isSupportedTool } from "./types";

function broadcastLog(window: BrowserWindowType | null): void {
  logger.subscribe((entry) => {
    if (!window || window.isDestroyed()) return;
    window.webContents.send("log:entry", entry);
  });
}

export function registerIpc(getWindow: () => BrowserWindowType | null): void {
  // Log forwarding
  broadcastLog(getWindow());

  ipcMain.handle("log:history", async () => logger.history());

  ipcMain.handle("settings:load", async (): Promise<AppSettings> => {
    const s = await loadSettings();
    return s;
  });

  ipcMain.handle(
    "settings:save",
    async (_evt, settings: AppSettings): Promise<AppSettings> => {
      await saveSettings(settings);
      logger.info("settings:save", `Saved settings. sharedRoot=${settings.sharedRoot ?? "(none)"}`);
      return settings;
    },
  );

  ipcMain.handle("dialog:select-root", async (): Promise<string | null> => {
    const win = getWindow();
    const opts: Electron.OpenDialogOptions = {
      title: "Select Shared Skill Root",
      properties: ["openDirectory", "createDirectory"],
    };
    const result = win
      ? await dialog.showOpenDialog(win, opts)
      : await dialog.showOpenDialog(opts);
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  ipcMain.handle("dialog:select-skill-folder", async (): Promise<string | null> => {
    const win = getWindow();
    const opts: Electron.OpenDialogOptions = {
      title: "Select Skill Folder to Import",
      properties: ["openDirectory"],
    };
    const result = win
      ? await dialog.showOpenDialog(win, opts)
      : await dialog.showOpenDialog(opts);
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  ipcMain.handle("skills:scan", async (_evt, root: string): Promise<SkillInfo[]> => {
    try {
      const skills = await scanSkills(root);
      logger.info("skills:scan", `Scanned ${skills.length} skills from ${root}`);
      return skills;
    } catch (err) {
      logger.error("skills:scan", (err as Error).message);
      return [];
    }
  });

  ipcMain.handle(
    "skills:import",
    async (_evt, source: string, root: string) => {
      try {
        const result = await importSkillFolder(source, root);
        logger.success("skills:import", result.message);
        return { ok: true as const, skill: result.skill };
      } catch (err) {
        const msg = (err as Error).message;
        logger.error("skills:import", msg);
        return { ok: false as const, message: msg };
      }
    },
  );

  ipcMain.handle("tools:detect", async () => {
    try {
      const tools = await detectCliTools();
      logger.info(
        "tools:detect",
        `Detected ${tools.filter((t) => t.detected).length} / ${tools.length} CLI tools`,
      );
      return tools;
    } catch (err) {
      logger.error("tools:detect", (err as Error).message);
      return [];
    }
  });

  ipcMain.handle("git:status", async (_evt, root: string) => {
    try {
      const status = await getGitStatus(root);
      return status;
    } catch (err) {
      logger.error("git:status", (err as Error).message);
      return {
        gitAvailable: false,
        isRepo: false,
        hasRemote: false,
        remotes: [],
        dirty: false,
        branch: null,
        error: (err as Error).message,
      };
    }
  });

  ipcMain.handle(
    "sync:check",
    async (_evt, skill: SkillInfo, toolName: ToolName) => {
      try {
        return await checkSyncStatus(skill, toolName);
      } catch (err) {
        return {
          targetName: toolName,
          targetPath: getTargetPath(toolName, skill.name),
          state: "error" as const,
          message: (err as Error).message,
        };
      }
    },
  );

  ipcMain.handle(
    "sync:skill",
    async (_evt, skill: SkillInfo, toolName: ToolName) => {
      if (!isSupportedTool(toolName)) {
        const msg = `Sync to ${toolName} is not yet supported.`;
        logger.info("sync:skill", msg);
        return {
          targetName: toolName,
          targetPath: getTargetPath(toolName, skill.name),
          state: "unsupported" as const,
          message: msg,
        };
      }
      try {
        const result = await syncSkillToTool(skill, toolName);
        if (result.state === "synced") {
          logger.success("sync:skill", `Synced ${skill.name} to ${toolName}`);
        } else if (result.state === "conflict") {
          logger.error(
            "sync:skill",
            `Conflict: ${result.targetPath} - ${result.message}`,
          );
        } else if (result.state === "error" || result.state === "invalid") {
          logger.error("sync:skill", `Failed ${skill.name} to ${toolName}: ${result.message}`);
        } else {
          logger.info("sync:skill", `${skill.name} -> ${toolName}: ${result.state}`);
        }
        return result;
      } catch (err) {
        const msg = (err as Error).message;
        logger.error("sync:skill", msg);
        return {
          targetName: toolName,
          targetPath: getTargetPath(toolName, skill.name),
          state: "error" as const,
          message: msg,
        };
      }
    },
  );

  ipcMain.handle("shell:open-path", async (_evt, p: string) => {
    if (!p) return { ok: false, message: "No path provided" };
    const err = await shell.openPath(p);
    if (err) {
      logger.error("shell:open-path", err);
      return { ok: false, message: err };
    }
    return { ok: true };
  });
}

export function focusWindow(window: BrowserWindowType): void {
  if (window.isMinimized()) window.restore();
  window.focus();
}
