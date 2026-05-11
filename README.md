# Skill Sync Manager

> 🌐 **语言**: **简体中文** · [English](./README_EN.md)

一个 Windows 优先的本地桌面工具，用于统一管理 Agent Skills，并把一份共享的 skill 仓库同步到多个 CLI agent 工具。基于 **Wails v2 + Go + React + TypeScript + Vite** 构建。

## 为什么要有一个"共享 skill 根目录"

一个 "skill" 是一个文件夹，里面包含一个 `SKILL.md`（YAML frontmatter 描述 `name` 和 `description`），以及可选的 `scripts/`、`references/`、`assets/`、`agents/` 子目录。

Claude Code 和 OpenAI Codex 各自期望 skill 放在自己的目录里。把 skill 在多个目录之间复制意味着每次改动都要同步多份。Skill Sync Manager 让所有 skill 都放在同一个位置（例如 `D:\AgentSkills`），然后由应用创建 **Windows 目录 junction**：

- `%USERPROFILE%\.claude\skills\<skill-name>` → `D:\AgentSkills\<skill-name>`
- `%USERPROFILE%\.codex\skills\<skill-name>` → `D:\AgentSkills\<skill-name>`

改一份，两边都看到更新。共享根目录是唯一的事实来源。

## 为什么选 Wails + Go + React + TypeScript

上一版用的是 Electron Forge，我们迁到 **Wails v2**，原因有几个：

- **体积更小**：Wails 应用发布时是单个 Go 二进制 + 系统自带的 WebView2 runtime，不需要捆绑 Chromium。
- **Go 更适合本地系统级工作**：目录 junction、文件扫描、Git 子进程调用、设置存储都能直接用 Go 标准库完成，不再需要在 Node 主进程 + preload 之间通过 `child_process` 绕弯。
- **单一类型化桥接**：Go 的 `App` 上每个公开方法都会被 Wails 自动绑定为前端的异步 TypeScript 函数，不需要手写 IPC 通道。
- **长期维护**：少一层 Electron Forge、少一层 preload bridge、也少了渲染进程里那份重复的类型声明。

前端的 React + TypeScript + Vite 基本没变 —— 组件树一样、样式一样，只是换掉了底层的 API 调用层。

## 支持的同步目标

| 工具 | 状态 | 目标目录 |
| --- | --- | --- |
| Claude Code | 已支持 | `%USERPROFILE%\.claude\skills` |
| OpenAI Codex | 已支持 | `%USERPROFILE%\.codex\skills` |
| Gemini CLI | 仅占位 | 暂未支持 |
| OpenCode | 仅占位 | 暂未支持 |
| Hermes | 仅占位 | 暂未支持 |

点击暂未支持的工具的同步按钮会提示 `"Sync to <tool> is not yet supported."`。

## 环境要求（Windows）

- **Go** 1.23+
- **Node.js** 20+（在 22、24 上验证过）
- **Wails CLI** v2.12+
- **WebView2 Runtime**（Windows 10 21H2 和 Windows 11 已预装，否则需要从 Microsoft 安装）

### 推荐：使用 mise

使用 [`mise`](https://mise.jdx.dev/) 管理 Go 和 Node 版本：

```bash
mise install
```

### 安装 Wails CLI

```bash
go install github.com/wailsapp/wails/v2/cmd/wails@latest
```

检查开发工具链：

```bash
wails doctor
```

## 安装依赖

```bash
# Go 依赖（首次构建时也会自动拉取，显式执行也可以）
go mod tidy

# 前端依赖
cd frontend && npm install && cd ..
```

## 运行（开发模式）

```bash
wails dev
```

会启动 Vite 支持热更新，打开 WebView2 窗口，并在每次保存时重新编译 Go 后端。

## 构建（生产）

```bash
wails build
```

产物为单个 `build/bin/skill-sync-manager.exe`。

## 测试

```bash
# Go 后端
go test ./...

# 前端（已配置 vitest，当前还没写测试）
cd frontend && npm test
```

## Windows junction 权限说明

应用通过 `cmd /C mklink /J` 创建目录 junction。多数新版 Windows 上创建 junction 不需要管理员权限，但在某些组策略或驱动器上仍可能失败。遇到权限错误时可尝试：

- 在 Windows 设置 → 开发者选项中启用**开发者模式**。
- 或者**以管理员身份**运行 Skill Sync Manager。
- 或者确认目标路径位于 NTFS 卷上。

Skill Sync Manager **绝不会删除或覆盖**已存在的路径。如果目标位置已存在、但不是指向共享 skill 的 junction，会被标记为冲突并保持原样。

## 使用流程

1. 启动应用（`wails dev` 或构建后的 `.exe`）。
2. **共享 Skill 根目录**：点击 `Browse`，选中你用来存放共享 skill 的文件夹（例如 `D:\AgentSkills`）。
3. 点击 `Scan`，应用会列出其中每个包含 `SKILL.md` 的子目录。
4. 查看 **Git 状态** 和 **CLI 工具** 面板。应用通过 `where` 命令检测 `claude`、`codex`、`gemini`、`opencode`、`hermes`。
5. 选中一个 skill，然后点击 **同步到 Claude** / **同步到 Codex**（或"同步所有"）。
6. 表格中 Claude / Codex 列会更新为 `synced`、`missing`、`conflict` 或 `error`。
7. 用 **导入 Skill 目录** 把外部 skill 文件夹复制进共享根。已存在的目标不会被覆盖，外部目录下的 `.git` 也不会被复制进来。

## 同步状态

| 状态 | 含义 |
| --- | --- |
| `synced` | 目标位置是一个指向共享 skill 目录的 junction。 |
| `missing` | 目标位置还不存在，可以安全同步。 |
| `conflict` | 目标位置有东西、但不是我们的 junction，或指向了别处。不会覆盖。 |
| `invalid` | skill 的 `SKILL.md` 缺少 `name` 或 `description`。 |
| `unsupported` | 工具尚未支持。 |
| `error` | 创建失败，通常是 Windows 权限问题。 |

## 当前限制

- **同步功能仅支持 Windows**。非 Windows 平台可以打开界面、扫描 skill、读取 Git 状态、检测 CLI，但同步操作会直接返回错误。
- 真正支持的同步目标只有 **Claude Code** 和 **OpenAI Codex**。
- **Git 只读**。不会自动执行 `git init` / `add` / `commit` / `push` / `pull`。Git 状态只用于信息展示。
- **冲突不会被覆盖**。请手动处理。

## Roadmap

- Gemini CLI、OpenCode、Hermes 的同步目标。
- 共享 skill 仓库的 Git commit / push 辅助。
- Skill diff 查看器。
- 冲突迁移向导（将已存在的真实目录复制回共享根，确认后替换为 junction）。

## 项目结构

```
skill-sync-manager/
├── README.md               # 中文（默认）
├── README_EN.md            # English
├── go.mod
├── go.sum
├── main.go                 # Wails 应用入口
├── app.go                  # App 结构体与绑定给前端的公开方法
├── wails.json              # Wails 项目配置
├── mise.toml
├── internal/
│   ├── models/             # 共享 Go 类型（SkillInfo、SyncStatus 等）
│   ├── skillscanner/       # 扫描 / 解析 / 导入 SKILL.md
│   ├── synctargets/        # Claude / Codex 目标路径 + 同步逻辑
│   ├── symlinkwindows/     # mklink /J + junction 检测
│   ├── gitstatus/          # git 子进程调用
│   ├── clidetector/        # 通过 where/which 检测 CLI
│   └── settings/           # %APPDATA%\skill-sync-manager\settings.json
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
    │   │   └── wailsApi.ts          # 对 wailsjs/go/main/App 的封装
    │   └── components/              # RootSelector、GitStatusPanel、ToolStatusPanel、
    │                                # SkillTable、SkillDetail、ActionPanel、LogPanel
    └── wailsjs/                     # Wails 生成（仓库里保留占位，用于 tsc/vite）
```

## 验收检查

```bash
go version
node -v
wails doctor
go test ./...
cd frontend && npm install && npm test
cd .. && wails dev
```

### Windows 手动冒烟测试

```powershell
mkdir D:\AgentSkills
mkdir D:\AgentSkills\test-skill
notepad D:\AgentSkills\test-skill\SKILL.md
```

把下面的内容粘贴到 `SKILL.md`：

```markdown
---
name: test-skill
description: Test skill for Claude and Codex sync.
---

# Test Skill

Use this skill for testing sync behavior.
```

然后：

1. 运行 `wails dev`。
2. 在界面里通过 Browse 指向 `D:\AgentSkills`。
3. 点击 `Scan`，应该能看到 `test-skill`。
4. 点击 `Sync Selected to Claude`，再用 `dir $env:USERPROFILE\.claude\skills` 检查。
5. 点击 `Sync Selected to Codex`，再用 `dir $env:USERPROFILE\.codex\skills` 检查。
6. 再次点击同步 —— 状态保持 `synced`，不会创建重复的 junction。
7. 预先在目标位置创建一个真实目录，确认会被报告为 `conflict` 且不会被覆盖。
