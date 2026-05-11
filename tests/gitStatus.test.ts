import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { getGitStatus } from "../src/main/gitStatus";

let tmpRoot: string;

beforeAll(async () => {
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "git-status-"));
});

afterAll(async () => {
  await fs.rm(tmpRoot, { recursive: true, force: true });
});

describe("gitStatus", () => {
  it("does not crash on a non-git directory", async () => {
    const plain = path.join(tmpRoot, "plain");
    await fs.mkdir(plain, { recursive: true });
    const status = await getGitStatus(plain);
    expect(status.isRepo).toBe(false);
    expect(status.remotes).toEqual([]);
    expect(typeof status.gitAvailable).toBe("boolean");
  });

  it("does not crash when root is empty string", async () => {
    const status = await getGitStatus("");
    expect(status.isRepo).toBe(false);
    expect(status.hasRemote).toBe(false);
    expect(status.branch).toBeNull();
  });

  it("returns stable shape on a missing path", async () => {
    const status = await getGitStatus(path.join(tmpRoot, "does-not-exist"));
    expect(status).toMatchObject({
      isRepo: false,
      hasRemote: false,
      remotes: expect.any(Array),
      dirty: false,
      branch: null,
    });
  });
});
