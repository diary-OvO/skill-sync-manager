# Skill Sync Manager

A local, Windows-only desktop tool for managing Agent Skills and syncing a single shared skill repository to multiple CLI agent tools.

Claude Code and OpenAI Codex each expect skills in their own directory. Copying skills between those directories means every edit has to be duplicated. Skill Sync Manager solves this by making each tool's skills directory a **Windows directory junction** back to a single shared folder. Edit once, both tools see the update.

## Why a shared skill root

A skill is a folder containing a `SKILL.md` (with YAML frontmatter describing `name` and `description`) and optional `scripts/`, `references/`, `assets/`, and `agents/` subfolders.

With Skill Sync Manager you keep every skill in one place (for example `D:\AgentSkills`) and the app creates junctions:

- `%USERPROFILE%\.claude\skills\<skill-name>` → `D:\AgentSkills\<skill-name>`
- `%USERPROFILE%\.agents\skills\<skill-name>` → `D:\AgentSkills\<skill-name>`

## Supported targets

| Tool | Status | Target directory |
| --- | --- | --- |
| Claude Code | Supported | `%USERPROFILE%\.claude\skills` |
| OpenAI Codex | Supported | `%USERPROFILE%\.agents\skills` |
| Gemini CLI | UI placeholder | not yet supported |
| OpenCode | UI placeholder | not yet supported |
| Hermes | UI placeholder | not yet supported |

Clicking the sync button for an unsupported tool shows "Sync to \<tool\> is not yet supported."

## Install

Requires Node.js 18+ (tested with 20+) and Windows 10/11.

```bash
npm install
```

## Develop / run

```bash
npm run start
```

This launches Electron Forge in dev mode with Vite HMR for the renderer.

## Tests

```bash
npm run test
```

## Package

```bash
npm run package
npm run make
```

## Windows symlink / junction permissions

The app uses `fs.symlink(target, link, "junction")`, which maps to an NTFS **directory junction**. Junctions don't require admin rights on most modern Windows systems, but creation can still fail depending on group policy or drive type. If you see a permission error:

- Enable **Developer Mode** in Windows Settings → For developers.
- Or run Skill Sync Manager **as administrator**.
- Or verify the target path exists and is on an NTFS volume.

Skill Sync Manager **never deletes or overwrites** an existing path. If the target already exists and isn't a junction pointing at the shared skill, it's reported as a conflict and left untouched.

## Usage flow

1. Launch the app.
2. **Shared Skill Root**: click `Browse` and pick the folder where you keep your shared skills (for example `D:\AgentSkills`).
3. Click `Scan`. The app lists every subdirectory that contains a `SKILL.md`.
4. Review **Git Status** and **CLI Tools** panels. The app detects `claude`, `codex`, `gemini`, `opencode`, and `hermes` via `where`.
5. Select a skill and use **Sync Selected to Claude** / **Sync Selected to Codex** (or **Sync All**).
6. The Claude/Codex columns update to `synced`, `missing`, `conflict`, or `error`.
7. Use **Import Skill Folder** to copy an external skill folder into the shared root (existing targets are never overwritten).

## Sync states

| State | Meaning |
| --- | --- |
| `synced` | Target is a junction pointing to the shared skill folder. |
| `missing` | No target exists yet. Safe to sync. |
| `conflict` | Something exists at the target but isn't our junction, or points elsewhere. Not overwritten. |
| `invalid` | The skill's `SKILL.md` is missing `name` or `description`. |
| `unsupported` | Tool not yet supported. |
| `error` | Creation failed, usually a permissions issue on Windows. |

## Current limitations

- **Windows only**. Non-Windows platforms open the UI but sync actions report an error.
- Only Claude Code and OpenAI Codex are real sync targets.
- No automatic `git init` / `add` / `commit` / `push` / `pull`. Git status is read-only.
- Conflict paths are never overwritten. Resolve them manually.

## Roadmap

- Gemini CLI, OpenCode, Hermes sync targets.
- Git commit / push helpers for the shared skill repo.
- Skill diff viewer.
- Conflict migration wizard (copy an existing real directory back into the shared root and replace it with a junction after confirmation).

## Project structure

```
skill-sync-manager/
├── forge.config.ts
├── vite.main.config.ts
├── vite.preload.config.ts
├── vite.renderer.config.ts
├── index.html
├── src/
│   ├── shared/types.ts
│   ├── main/            # Electron main process
│   ├── preload/         # contextBridge API
│   └── renderer/        # React UI
└── tests/               # Vitest
```
