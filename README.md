# Skill Sync Manager

A Windows-first local desktop tool for managing Agent Skills and syncing a single shared skill repository to multiple CLI agent tools. Built with **Wails v2 + Go + React + TypeScript + Vite**.

## Why a shared skill root

A "skill" is a folder containing a `SKILL.md` (with YAML frontmatter describing `name` and `description`) plus optional `scripts/`, `references/`, `assets/`, and `agents/` subfolders.

Claude Code and OpenAI Codex each expect skills in their own directory. Copying skills between directories means every edit has to be duplicated. Skill Sync Manager keeps every skill in one place (for example `D:\AgentSkills`) and the app creates **Windows directory junctions**:

- `%USERPROFILE%\.claude\skills\<skill-name>` → `D:\AgentSkills\<skill-name>`
- `%USERPROFILE%\.agents\skills\<skill-name>` → `D:\AgentSkills\<skill-name>`

Edit once. Both tools see the update. The shared root is the single source of truth.

## Why Wails + Go + React + TypeScript

The previous version ran on Electron Forge. We migrated to **Wails v2** for a few reasons:

- **Smaller footprint**: Wails apps ship as a single Go binary + the system WebView2 runtime, not a bundled Chromium.
- **Go for local system work**: Directory junctions, file scanning, Git subprocess calls, and settings storage live naturally in Go's standard library. No `child_process` gymnastics across a Node main + preload boundary.
- **Single typed bridge**: Every public method on the Go `App` is bound into the frontend by Wails as an async TypeScript function. No manual IPC channels.
- **Long-term maintenance**: fewer moving parts (no Electron Forge, no preload bridge, no renderer-only type duplication).

The React + TypeScript + Vite frontend layer is unchanged in spirit — same component tree, same simple CSS. Only the API call layer was replaced.

## Supported sync targets

| Tool | Status | Target directory |
| --- | --- | --- |
| Claude Code | Supported | `%USERPROFILE%\.claude\skills` |
| OpenAI Codex | Supported | `%USERPROFILE%\.agents\skills` |
| Gemini CLI | UI placeholder | not yet supported |
| OpenCode | UI placeholder | not yet supported |
| Hermes | UI placeholder | not yet supported |

Clicking a sync button for an unsupported tool shows `"Sync to <tool> is not yet supported."`

## Requirements (Windows)

- **Go** 1.23+
- **Node.js** 20+ (tested with 22, 24)
- **Wails CLI** v2.12+
- **WebView2 Runtime** (pre-installed on Windows 10 21H2 and Windows 11; otherwise install from Microsoft)

### Recommended: mise

Use [`mise`](https://mise.jdx.dev/) to manage Go and Node versions:

```bash
mise install
```

### Install the Wails CLI

```bash
go install github.com/wailsapp/wails/v2/cmd/wails@latest
```

Check the dev toolchain:

```bash
wails doctor
```

## Install

```bash
# Go dependencies (auto-resolved on first build, but explicit is fine)
go mod tidy

# Frontend dependencies
cd frontend && npm install && cd ..
```

## Run (development)

```bash
wails dev
```

This starts Vite for HMR, launches the WebView2 window, and rebuilds the Go backend on each save.

## Build (production)

```bash
wails build
```

Produces a standalone `build/bin/skill-sync-manager.exe`.

## Tests

```bash
# Go backend
go test ./...

# Frontend (vitest is configured but no frontend tests exist yet)
cd frontend && npm test
```

## Windows junction permissions

The app creates directory junctions via `cmd /C mklink /J`. Junctions don't require admin rights on most modern Windows systems, but creation can still fail depending on group policy or drive type. If you see a permission error:

- Enable **Developer Mode** in Windows Settings → For developers.
- Or run Skill Sync Manager **as administrator**.
- Or verify the target path exists on an NTFS volume.

Skill Sync Manager **never deletes or overwrites** an existing path. If the target already exists and isn't a junction pointing at the shared skill, it's reported as a conflict and left untouched.

## Usage flow

1. Launch the app (`wails dev` or the built `.exe`).
2. **Shared Skill Root**: click `Browse` and pick the folder where you keep your shared skills (for example `D:\AgentSkills`).
3. Click `Scan`. The app lists every subdirectory that contains a `SKILL.md`.
4. Review the **Git Status** and **CLI Tools** panels. The app detects `claude`, `codex`, `gemini`, `opencode`, and `hermes` via `where`.
5. Select a skill and use **Sync Selected to Claude** / **Sync Selected to Codex** (or **Sync All**).
6. The Claude/Codex columns update to `synced`, `missing`, `conflict`, or `error`.
7. Use **Import Skill Folder** to copy an external skill folder into the shared root. Existing targets are never overwritten, and the external folder's `.git` is not copied.

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

- **Windows only for sync**. Non-Windows platforms open the UI, scan skills, read Git status, and detect CLIs, but sync actions return an error.
- Only **Claude Code** and **OpenAI Codex** are real sync targets.
- **Read-only Git**. No automatic `git init` / `add` / `commit` / `push` / `pull`. Git status is shown for context only.
- **Conflicts are never overwritten**. Resolve them manually.

## Roadmap

- Gemini CLI, OpenCode, Hermes sync targets.
- Git commit / push helpers for the shared skill repo.
- Skill diff viewer.
- Conflict migration wizard (copy an existing real directory back into the shared root and replace it with a junction after confirmation).

## Project structure

```
skill-sync-manager/
├── README.md
├── go.mod
├── go.sum
├── main.go               # Wails app entrypoint
├── app.go                # App struct + public methods bound to the frontend
├── wails.json            # Wails project config
├── mise.toml
├── internal/
│   ├── models/           # Shared Go types (SkillInfo, SyncStatus, …)
│   ├── skillscanner/     # Scan + parse + import SKILL.md
│   ├── synctargets/      # Claude/Codex target paths + sync logic
│   ├── symlinkwindows/   # mklink /J + junction detection
│   ├── gitstatus/        # git subprocess calls
│   ├── clidetector/      # where/which CLI detection
│   └── settings/         # %APPDATA%\skill-sync-manager\settings.json
└── frontend/
    ├── index.html
    ├── package.json
    ├── tsconfig.json
    ├── vite.config.ts
    ├── src/
    │   ├── main.tsx
    │   ├── App.tsx
    │   ├── types.ts
    │   ├── styles.css
    │   ├── lib/
    │   │   └── wailsApi.ts          # Wraps wailsjs/go/main/App
    │   └── components/              # RootSelector, GitStatusPanel, ToolStatusPanel,
    │                                # SkillTable, SkillDetail, ActionPanel, LogPanel
    └── wailsjs/                     # Generated by Wails (stubbed in-repo for tsc/vite)
```

## Acceptance check

```bash
go version
node -v
wails doctor
go test ./...
cd frontend && npm install && npm test
cd .. && wails dev
```

### Manual Windows smoke test

```powershell
mkdir D:\AgentSkills
mkdir D:\AgentSkills\test-skill
notepad D:\AgentSkills\test-skill\SKILL.md
```

Paste into `SKILL.md`:

```markdown
---
name: test-skill
description: Test skill for Claude and Codex sync.
---

# Test Skill

Use this skill for testing sync behavior.
```

Then:

1. `wails dev`
2. In the UI, Browse to `D:\AgentSkills`.
3. Click `Scan`. You should see `test-skill`.
4. Click `Sync Selected to Claude`, then check `dir $env:USERPROFILE\.claude\skills`.
5. Click `Sync Selected to Codex`, then check `dir $env:USERPROFILE\.agents\skills`.
6. Click sync again — state stays `synced`, no duplicate junctions created.
7. Pre-create a real directory at the target location to verify it reports `conflict` and does not overwrite.
