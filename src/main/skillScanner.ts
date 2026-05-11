import { promises as fs } from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import type { SkillInfo } from "./types";

const BODY_PREVIEW_LIMIT = 800;

function toStringMap(input: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value === null || value === undefined) continue;
    if (typeof value === "string") {
      out[key] = value;
    } else if (typeof value === "number" || typeof value === "boolean") {
      out[key] = String(value);
    } else {
      try {
        out[key] = JSON.stringify(value);
      } catch {
        out[key] = String(value);
      }
    }
  }
  return out;
}

export interface ParsedSkillMarkdown {
  frontmatter: Record<string, string>;
  body: string;
  bodyPreview: string;
  name: string;
  description: string;
  errors: string[];
}

export async function parseSkillMarkdown(skillMdPath: string): Promise<ParsedSkillMarkdown> {
  const errors: string[] = [];
  let raw = "";
  try {
    raw = await fs.readFile(skillMdPath, "utf8");
  } catch (err) {
    errors.push(`Failed to read SKILL.md: ${(err as Error).message}`);
    return {
      frontmatter: {},
      body: "",
      bodyPreview: "",
      name: "",
      description: "",
      errors,
    };
  }

  let data: Record<string, unknown> = {};
  let content = "";
  try {
    const parsed = matter(raw);
    data = (parsed.data ?? {}) as Record<string, unknown>;
    content = parsed.content ?? "";
  } catch (err) {
    errors.push(`Failed to parse frontmatter: ${(err as Error).message}`);
    content = raw;
  }

  const frontmatter = toStringMap(data);
  const name = typeof frontmatter.name === "string" ? frontmatter.name.trim() : "";
  const description =
    typeof frontmatter.description === "string" ? frontmatter.description.trim() : "";

  if (!name) {
    errors.push("Frontmatter is missing required field: name");
  }
  if (!description) {
    errors.push("Frontmatter is missing required field: description");
  }

  const trimmedBody = content.replace(/^\s+/, "");
  const bodyPreview =
    trimmedBody.length > BODY_PREVIEW_LIMIT
      ? trimmedBody.slice(0, BODY_PREVIEW_LIMIT)
      : trimmedBody;

  return {
    frontmatter,
    body: content,
    bodyPreview,
    name,
    description,
    errors,
  };
}

async function isDirectory(p: string): Promise<boolean> {
  try {
    const st = await fs.stat(p);
    return st.isDirectory();
  } catch {
    return false;
  }
}

async function isFile(p: string): Promise<boolean> {
  try {
    const st = await fs.stat(p);
    return st.isFile();
  } catch {
    return false;
  }
}

export async function scanSkills(root: string): Promise<SkillInfo[]> {
  if (!root) return [];
  if (!(await isDirectory(root))) return [];

  let entries: string[] = [];
  try {
    entries = await fs.readdir(root);
  } catch {
    return [];
  }

  const results: SkillInfo[] = [];
  for (const entry of entries) {
    const skillDir = path.join(root, entry);
    if (!(await isDirectory(skillDir))) continue;
    const skillMd = path.join(skillDir, "SKILL.md");
    if (!(await isFile(skillMd))) continue;

    const parsed = await parseSkillMarkdown(skillMd);
    const errors = [...parsed.errors];
    const folderName = entry;

    const info: SkillInfo = {
      name: parsed.name || folderName,
      description: parsed.description,
      path: skillDir,
      valid: parsed.name.length > 0 && parsed.description.length > 0 && errors.length === 0,
      errors,
      frontmatter: parsed.frontmatter,
      bodyPreview: parsed.bodyPreview,
    };

    if (parsed.name && parsed.name !== folderName) {
      // Informational only; frontmatter name takes precedence.
      info.errors.push(
        `Frontmatter name "${parsed.name}" differs from folder "${folderName}". Frontmatter name will be used as the sync target.`,
      );
    }

    results.push(info);
  }

  results.sort((a, b) => a.name.localeCompare(b.name));
  return results;
}

export interface ImportResult {
  skill: SkillInfo;
  imported: boolean;
  message: string;
}

export async function importSkillFolder(source: string, root: string): Promise<ImportResult> {
  if (!(await isDirectory(source))) {
    throw new Error(`Source is not a directory: ${source}`);
  }
  if (!(await isDirectory(root))) {
    throw new Error(`Shared skill root does not exist: ${root}`);
  }
  const skillMd = path.join(source, "SKILL.md");
  if (!(await isFile(skillMd))) {
    throw new Error(`Source folder does not contain SKILL.md: ${source}`);
  }
  const parsed = await parseSkillMarkdown(skillMd);
  if (!parsed.name) {
    throw new Error("SKILL.md is missing required frontmatter field: name");
  }
  const targetDir = path.join(root, parsed.name);

  if (await pathExists(targetDir)) {
    throw new Error(
      `Target already exists at ${targetDir}. Remove it manually or rename the skill.`,
    );
  }

  await copyDirectory(source, targetDir);

  const scanned = await scanSkills(root);
  const found = scanned.find((s) => s.path === targetDir);
  if (!found) {
    throw new Error(`Imported folder could not be scanned back: ${targetDir}`);
  }
  return {
    skill: found,
    imported: true,
    message: `Imported ${parsed.name} from ${source}`,
  };
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.lstat(p);
    return true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw err;
  }
}

async function copyDirectory(src: string, dest: string): Promise<void> {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      await copyDirectory(srcPath, destPath);
    } else if (entry.isFile()) {
      await fs.copyFile(srcPath, destPath);
    }
    // Skip symlinks, sockets, etc. — we only move plain skill files.
  }
}
