# Skill Sync Manager

> 语言：**简体中文** · [English](./README_EN.md)

一个 Windows 优先的 Agent Skills 同步管理器。
把一份共享 skill 仓库同步到 Claude Code、OpenAI Codex、Gemini CLI、OpenCode 等 CLI agent 工具中，让 skill 只维护一份，多端自动可用。

## 灵感来源

本项目受到 [CC Switch](https://ccswitch.ai/zh/) 的启发。CC Switch 更像一个完整的 AI CLI 运维台，覆盖供应商切换、MCP / Prompts / Skills、代理接管、会话检索、用量统计和云同步等能力；它的公开说明也强调从 GitHub 仓库或 ZIP 一键安装 Skills，并同步到多个应用。

我在使用 CC Switch 的过程中遇到的实际痛点更具体：我希望管理的是自己编写、长期维护的一组 skills，并且希望能指定一个自己的本地管理目录作为唯一来源，而不是把 skill 复制到某个工具或应用自己的目录里。

Skill Sync Manager 因此更聚焦：不做 Provider 切换，也不接管代理和会话；它只解决一个问题：把自定义本地目录中的 Agent Skills 安全同步到多个 CLI 工具目录中，避免重复复制、重复维护和误覆盖。

## ✨ 主要功能

- **统一管理：** 将所有 Agent Skills 放在一个共享根目录中，避免多工具、多目录重复维护。
- **一键同步：** 通过 Windows directory junction 同步到 Claude Code、OpenAI Codex、Gemini CLI 和 OpenCode。
- **状态可见：** 展示扫描结果、同步状态、冲突提示、CLI 检测、Git 状态和后台命令日志。

## 使用方法与安装步骤

环境要求：

- Windows 10/11
- Go 1.23+
- Node.js 20+
- Wails CLI v2.12+
- WebView2 Runtime

1. 安装 Wails CLI。

   ```shell
   go install github.com/wailsapp/wails/v2/cmd/wails@v2.12.0
   ```

2. 克隆仓库并安装依赖。

   ```shell
   git clone https://github.com/dirary0/skill-sync-manager.git
   cd skill-sync-manager
   cd frontend && npm install && cd ..
   ```

3. 启动开发环境。

   ```shell
   wails dev
   ```

4. 构建 Windows exe。

   ```shell
   wails build
   ```

构建产物：

```text
build/bin/skill-sync-manager.exe
```

## 使用流程

1. 选择共享 skill 根目录，例如 `~/.agents/skills` 或 `D:\AgentSkills`。
2. 点击 `Scan` 扫描包含 `SKILL.md` 的 skill 文件夹。
3. 选择 skill，并同步到 Claude Code、OpenAI Codex、Gemini CLI 或 OpenCode。
4. 在日志窗口查看后台命令执行状态和同步结果。

## 默认目录映射

- 共享主仓库：`~/.agents/skills`
- Claude Code：`~/.claude/skills`
- OpenAI Codex：`~/.codex/skills`
- Gemini CLI：`~/.gemini/skills`
- OpenCode：`~/.config/opencode/skills`

## 使用技术

- Wails v2
- Go
- React
- TypeScript
- Vite
- Windows directory junction

## 当前状态

- 已支持 Claude Code、OpenAI Codex、Gemini CLI 与 OpenCode。
- Hermes 目前仅作为占位目标。
- 同步能力当前仅面向 Windows。
- Git 仅做状态展示，不自动执行 commit、push 或 pull。
- 冲突目录不会被覆盖，需要用户手动处理。
