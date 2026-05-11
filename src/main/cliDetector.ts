import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ToolStatus, ToolName } from "./types";
import { ALL_TOOLS, isSupportedTool } from "./types";

const execFileAsync = promisify(execFile);

async function whereCommand(tool: string): Promise<string | null> {
  const cmd = process.platform === "win32" ? "where" : "which";
  try {
    const { stdout } = await execFileAsync(cmd, [tool], {
      windowsHide: true,
      maxBuffer: 1024 * 1024,
    });
    const firstLine = stdout
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find((l) => l.length > 0);
    return firstLine ?? null;
  } catch {
    return null;
  }
}

export async function detectCliTools(): Promise<ToolStatus[]> {
  const results = await Promise.all(
    ALL_TOOLS.map(async (tool): Promise<ToolStatus> => {
      const execPath = await whereCommand(tool);
      return {
        toolName: tool,
        executablePath: execPath,
        detected: !!execPath,
        supported: isSupportedTool(tool as ToolName),
      };
    }),
  );
  return results;
}
