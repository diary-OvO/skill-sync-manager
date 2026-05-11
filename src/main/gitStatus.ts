import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { GitStatus } from "./types";

const execFileAsync = promisify(execFile);

async function runGit(args: string[], cwd?: string): Promise<{ stdout: string; stderr: string } | null> {
  try {
    const { stdout, stderr } = await execFileAsync("git", args, {
      cwd,
      windowsHide: true,
      maxBuffer: 4 * 1024 * 1024,
    });
    return { stdout, stderr };
  } catch {
    return null;
  }
}

export async function isGitAvailable(): Promise<boolean> {
  const res = await runGit(["--version"]);
  return !!res && res.stdout.toLowerCase().includes("git");
}

export async function getGitStatus(root: string): Promise<GitStatus> {
  const base: GitStatus = {
    gitAvailable: false,
    isRepo: false,
    hasRemote: false,
    remotes: [],
    dirty: false,
    branch: null,
  };

  if (!root) {
    return base;
  }

  const available = await isGitAvailable();
  if (!available) {
    return { ...base, gitAvailable: false };
  }

  const insideRes = await runGit(["-C", root, "rev-parse", "--is-inside-work-tree"]);
  const isRepo = !!insideRes && insideRes.stdout.trim() === "true";

  if (!isRepo) {
    return { ...base, gitAvailable: true, isRepo: false };
  }

  const branchRes = await runGit(["-C", root, "branch", "--show-current"]);
  const branch = branchRes ? branchRes.stdout.trim() || null : null;

  const remoteRes = await runGit(["-C", root, "remote", "-v"]);
  const remotes = remoteRes
    ? remoteRes.stdout
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l.length > 0)
    : [];

  const statusRes = await runGit(["-C", root, "status", "--porcelain"]);
  const dirty = statusRes ? statusRes.stdout.trim().length > 0 : false;

  return {
    gitAvailable: true,
    isRepo: true,
    hasRemote: remotes.length > 0,
    remotes,
    dirty,
    branch,
  };
}
