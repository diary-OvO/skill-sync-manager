import { promises as fs } from "node:fs";
import path from "node:path";

function assertWindows(): void {
  if (process.platform !== "win32") {
    throw new Error(
      "Windows directory junctions are only supported on Windows. Current platform: " +
        process.platform,
    );
  }
}

export function isWindows(): boolean {
  return process.platform === "win32";
}

export async function isLinkPath(p: string): Promise<boolean> {
  try {
    const st = await fs.lstat(p);
    return st.isSymbolicLink();
  } catch {
    return false;
  }
}

export async function resolveRealPath(p: string): Promise<string> {
  // Use realpath so junctions resolve to their actual target.
  const real = await fs.realpath(p);
  return path.resolve(real);
}

export async function readLinkIfAny(p: string): Promise<string | null> {
  try {
    const st = await fs.lstat(p);
    if (!st.isSymbolicLink()) return null;
    const linked = await fs.readlink(p);
    return path.isAbsolute(linked) ? linked : path.resolve(path.dirname(p), linked);
  } catch {
    return null;
  }
}

export async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.lstat(p);
    return true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw err;
  }
}

export async function createDirectoryJunction(linkPath: string, targetPath: string): Promise<void> {
  assertWindows();

  const absTarget = path.resolve(targetPath);

  const targetStat = await fs.stat(absTarget).catch(() => null);
  if (!targetStat || !targetStat.isDirectory()) {
    throw new Error(`Target directory does not exist: ${absTarget}`);
  }

  if (await pathExists(linkPath)) {
    throw new Error(
      `Link path already exists: ${linkPath}. Skill Sync Manager will not overwrite existing paths.`,
    );
  }

  await fs.mkdir(path.dirname(linkPath), { recursive: true });

  try {
    await fs.symlink(absTarget, linkPath, "junction");
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    const hint =
      "Creating a directory junction on Windows can fail without sufficient permissions. " +
      "Try enabling Developer Mode in Windows Settings, or re-run Skill Sync Manager as administrator.";
    throw new Error(
      `Failed to create junction ${linkPath} -> ${absTarget}. ${e.message}. ${hint}`,
    );
  }
}
