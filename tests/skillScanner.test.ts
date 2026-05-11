import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseSkillMarkdown, scanSkills } from "../src/main/skillScanner";

let tmpRoot: string;

beforeAll(async () => {
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "skill-scanner-"));
});

afterAll(async () => {
  await fs.rm(tmpRoot, { recursive: true, force: true });
});

async function writeSkill(name: string, frontmatter: string, body: string): Promise<string> {
  const dir = path.join(tmpRoot, name);
  await fs.mkdir(dir, { recursive: true });
  const content = `---\n${frontmatter}\n---\n${body}`;
  await fs.writeFile(path.join(dir, "SKILL.md"), content, "utf8");
  return dir;
}

describe("skillScanner", () => {
  it("parses a valid SKILL.md and marks it valid", async () => {
    await writeSkill(
      "valid-skill",
      "name: valid-skill\ndescription: A nice skill for testing.",
      "\n# Valid Skill\n\nHello.",
    );
    const skills = await scanSkills(tmpRoot);
    const found = skills.find((s) => s.name === "valid-skill");
    expect(found).toBeTruthy();
    expect(found!.valid).toBe(true);
    expect(found!.description).toBe("A nice skill for testing.");
  });

  it("marks a skill invalid when description is missing", async () => {
    await writeSkill(
      "missing-desc",
      "name: missing-desc",
      "\n# Body only\n",
    );
    const skills = await scanSkills(tmpRoot);
    const found = skills.find((s) => s.name === "missing-desc");
    expect(found).toBeTruthy();
    expect(found!.valid).toBe(false);
    expect(found!.errors.some((e) => e.toLowerCase().includes("description"))).toBe(true);
  });

  it("ignores folders that do not contain SKILL.md", async () => {
    const folder = path.join(tmpRoot, "not-a-skill");
    await fs.mkdir(folder, { recursive: true });
    await fs.writeFile(path.join(folder, "readme.txt"), "hello", "utf8");
    const skills = await scanSkills(tmpRoot);
    expect(skills.find((s) => s.path === folder)).toBeUndefined();
  });

  it("truncates body preview to 800 characters", async () => {
    const longBody = "\n" + "a".repeat(1500);
    await writeSkill(
      "long-body",
      "name: long-body\ndescription: A long body skill.",
      longBody,
    );
    const skills = await scanSkills(tmpRoot);
    const found = skills.find((s) => s.name === "long-body");
    expect(found).toBeTruthy();
    expect(found!.bodyPreview.length).toBe(800);
  });

  it("parseSkillMarkdown returns errors but no throw for missing file", async () => {
    const parsed = await parseSkillMarkdown(path.join(tmpRoot, "does-not-exist.md"));
    expect(parsed.errors.length).toBeGreaterThan(0);
    expect(parsed.name).toBe("");
  });
});
