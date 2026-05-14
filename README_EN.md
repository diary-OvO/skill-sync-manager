# Skill Sync Manager

> Language: [简体中文](./README.md) · **English**

A Windows-first sync manager for Agent Skills.
Sync one shared skill repository to Claude Code, OpenAI Codex, Gemini CLI, OpenCode, and other CLI agent tools so each skill is maintained once and reused everywhere.

## Inspiration

This project is inspired by [CC Switch](https://ccswitch.ai/). CC Switch is closer to a full AI CLI operations console, covering provider switching, MCP / Prompts / Skills, agent takeover, session search, usage analytics, and cloud sync. Its public docs also emphasize one-click Skills installation from GitHub repositories or ZIP files and syncing them across apps.

The practical pain point I hit while using CC Switch was narrower: I wanted to manage a set of skills I write and maintain myself, and I wanted to choose my own local management directory as the single source of truth instead of copying skills into a tool-owned or app-owned directory.

Skill Sync Manager is therefore intentionally narrower: it does not switch providers, take over agents, or manage sessions. It solves one problem: safely syncing Agent Skills from a custom local directory into multiple CLI tool directories without repeated copies, duplicated maintenance, or accidental overwrites.

## ✨ Key Features

- **Unified management:** Keep all Agent Skills in one shared root instead of maintaining duplicated folders across tools.
- **One-click sync:** Sync skills to Claude Code, OpenAI Codex, Gemini CLI, and OpenCode through Windows directory junctions.
- **Visible status:** See scan results, sync state, conflicts, CLI detection, Git status, and backend command logs.

## Setup and Usage

Requirements:

- Windows 10/11
- Go 1.23+
- Node.js 20+
- Wails CLI v2.12+
- WebView2 Runtime

1. Install the Wails CLI.

   ```shell
   go install github.com/wailsapp/wails/v2/cmd/wails@v2.12.0
   ```

2. Clone the repository and install dependencies.

   ```shell
   git clone https://github.com/dirary0/skill-sync-manager.git
   cd skill-sync-manager
   cd frontend && npm install && cd ..
   ```

3. Start the development app.

   ```shell
   wails dev
   ```

4. Build the Windows executable.

   ```shell
   wails build
   ```

Build output:

```text
build/bin/skill-sync-manager.exe
```

## Basic Flow

1. Choose a shared skill root, for example `~/.agents/skills` or `D:\AgentSkills`.
2. Click `Scan` to find skill folders containing `SKILL.md`.
3. Select a skill and sync it to Claude Code, OpenAI Codex, Gemini CLI, or OpenCode.
4. Check the log panel for backend command status and sync results.

## Default Path Mapping

- Shared root: `~/.agents/skills`
- Claude Code: `~/.claude/skills`
- OpenAI Codex: `~/.codex/skills`
- Gemini CLI: `~/.gemini/skills`
- OpenCode: `~/.config/opencode/skills`

## Tech Stack

- Wails v2
- Go
- React
- TypeScript
- Vite
- Windows directory junction

## Current Status

- Claude Code, OpenAI Codex, Gemini CLI, and OpenCode are supported.
- Hermes is a placeholder target for now.
- Sync is currently Windows-only.
- Git is read-only and used for status display only.
- Conflicting target folders are never overwritten and must be handled manually.
