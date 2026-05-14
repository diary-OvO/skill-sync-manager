package main

import (
	"context"
	"fmt"
	"runtime"
	"sync"
	"sync/atomic"
	"time"

	"skill-sync-manager/internal/clidetector"
	"skill-sync-manager/internal/clitoolscanner"
	"skill-sync-manager/internal/gitstatus"
	"skill-sync-manager/internal/models"
	"skill-sync-manager/internal/proc"
	"skill-sync-manager/internal/registry"
	"skill-sync-manager/internal/settings"
	"skill-sync-manager/internal/skillscanner"
	"skill-sync-manager/internal/symlinkwindows"
	"skill-sync-manager/internal/synctargets"

	wailsRuntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

// App 承载所有由 Wails 绑定给前端调用的方法共享的状态。
// 该类型上的每个公开方法都会被 Wails 代码生成工具暴露给前端。
type App struct {
	ctx context.Context

	logMu      sync.Mutex
	logHistory []models.LogEntry

	// shuttingDown 用于防止关闭流程被重入。
	// OnBeforeClose 在某些 Wails / WebView2 边界场景下可能触发多次
	// （连点 X、程序化 Quit 与用户点击同时发生等），另外前端还能调用
	// QuitApp，因此需要一个原子标志位保证清理只跑一次。
	shuttingDown atomic.Bool
}

func NewApp() *App {
	return &App{
		logHistory: make([]models.LogEntry, 0, 128),
	}
}

// startup 由 main.go 中的 options.App.OnStartup 挂载。
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	proc.SetObserver(func(result string, action string, message string) {
		a.pushLog(result, action, message)
	})
	a.logInfo("app:ready", fmt.Sprintf("Skill Sync Manager starting on %s", runtime.GOOS))
}

// onBeforeClose 对应 options.App.OnBeforeClose，
// 由 Wails 在用户触发窗口关闭（X 按钮、Alt-F4、OS 菜单）时在主线程调用。
// 返回 false 允许关闭，返回 true 则会否决。
//
// 这里先跑关闭流水线，再放行关闭；流水线幂等，因此 onShutdown
// 之后还能安全地再跑一次未完成的工作。
func (a *App) onBeforeClose(ctx context.Context) (prevent bool) {
	a.runShutdown("window-close")
	return false
}

// onShutdown 对应 options.App.OnShutdown：窗口已销毁、wails.Run 即将返回。
// 作为最后一道清理入口，涵盖所有退出路径（X 按钮、前端 QuitApp、未来的 OS 信号）。
func (a *App) onShutdown(ctx context.Context) {
	a.runShutdown("shutdown-hook")
}

// runShutdown 是所有关闭路径的统一收口。多次调用是安全的 ——
// 第一次调用生效，后续调用会立即返回。
//
// 当前清理范围：
//   - 暂时没有需要持久化的内容：settings 在 SaveSettings 里同步落盘；
//     registry 在 SetSkillMetadata / ImportFromCli 里同步落盘；
//     日志历史只在会话内有效。
//   - 没有后台 goroutine、没有长连接文件句柄、没有数据库。
//
// 未来如果引入后台 watcher、文件索引、上报模块等，都应集中在这里注册清理，
// 自动继承"只跑一次、在任何退出路径都会跑"的保证。
func (a *App) runShutdown(reason string) {
	if !a.shuttingDown.CompareAndSwap(false, true) {
		return
	}
	// 尽力而为：前端已消失时 EventsEmit 会变成 no-op，
	// 但仍希望 logHistory 里留下这条关闭记录，便于调试器查看。
	a.logInfo("app:shutdown", fmt.Sprintf("Shutting down (%s)", reason))

	// 未来的清理逻辑按启动的相反顺序放在这里。示例：
	//
	//   if a.watcher != nil { a.watcher.Close() }
	//   if a.indexer != nil { a.indexer.Stop(ctx) }
	//   if a.db != nil      { _ = a.db.Close() }
	//
	// 每一步都应包一层保护，单个失败不应中断后续清理。
}

// QuitApp 暴露给前端：UI、快捷键或菜单都能触发一次完整的优雅退出。
// 内部先跑清理流水线，再让 Wails 关掉窗口并让 wails.Run 返回。
// 任何协程都可以调用，多次调用也是安全的。
func (a *App) QuitApp() {
	a.runShutdown("quit-api")
	if a.ctx != nil {
		wailsRuntime.Quit(a.ctx)
	}
}

// ---------- 日志 ----------

const maxLogHistory = 500

func (a *App) pushLog(result, action, message string) models.LogEntry {
	entry := models.LogEntry{
		Timestamp: time.Now().Format("2006-01-02 15:04:05"),
		Action:    action,
		Result:    result,
		Message:   message,
	}
	a.logMu.Lock()
	a.logHistory = append(a.logHistory, entry)
	if len(a.logHistory) > maxLogHistory {
		a.logHistory = a.logHistory[len(a.logHistory)-maxLogHistory:]
	}
	a.logMu.Unlock()
	if a.ctx != nil {
		wailsRuntime.EventsEmit(a.ctx, "log:entry", entry)
	}
	return entry
}

func (a *App) logInfo(action, msg string) models.LogEntry { return a.pushLog("info", action, msg) }
func (a *App) logSuccess(action, msg string) models.LogEntry {
	return a.pushLog("success", action, msg)
}
func (a *App) logError(action, msg string) models.LogEntry { return a.pushLog("error", action, msg) }

// LogHistory 返回本次会话内已记录的全部日志条目。
func (a *App) LogHistory() []models.LogEntry {
	a.logMu.Lock()
	defer a.logMu.Unlock()
	out := make([]models.LogEntry, len(a.logHistory))
	copy(out, a.logHistory)
	return out
}

// ---------- 设置 ----------

func (a *App) LoadSettings() (models.AppSettings, error) {
	return settings.LoadSettings()
}

func (a *App) SaveSettings(s models.AppSettings) error {
	if err := settings.SaveSettings(s); err != nil {
		a.logError("settings:save", err.Error())
		return err
	}
	root := "(none)"
	if s.SharedRoot != nil {
		root = *s.SharedRoot
	}
	a.logInfo("settings:save", "Saved settings. sharedRoot="+root)
	return nil
}

// ---------- 对话框 / Shell ----------

// openDirectoryDialog 是两个 SelectXxxFolder 的共用实现，只有标题不同。
func (a *App) openDirectoryDialog(title string) (string, error) {
	if a.ctx == nil {
		return "", fmt.Errorf("dialog not available yet")
	}
	return wailsRuntime.OpenDirectoryDialog(a.ctx, wailsRuntime.OpenDialogOptions{
		Title: title,
	})
}

func (a *App) SelectRootFolder() (string, error) {
	return a.openDirectoryDialog("Select Shared Skill Root")
}

func (a *App) SelectSkillFolder() (string, error) {
	return a.openDirectoryDialog("Select Skill Folder to Import")
}

// OpenPath 在系统文件管理器中打开 path（Windows 资源管理器 / macOS Finder 等）。
func (a *App) OpenPath(path string) error {
	if path == "" {
		return fmt.Errorf("no path provided")
	}
	switch runtime.GOOS {
	case "windows":
		return proc.Start("shell:open-path", "", "explorer.exe", path)
	case "darwin":
		return proc.Start("shell:open-path", "", "open", path)
	default:
		return proc.Start("shell:open-path", "", "xdg-open", path)
	}
}

// ---------- skills ----------

func (a *App) ScanSkills(root string) ([]models.SkillInfo, error) {
	skills, err := skillscanner.ScanSkills(root)
	if err != nil {
		a.logError("skills:scan", err.Error())
		return []models.SkillInfo{}, err
	}
	a.logInfo("skills:scan", fmt.Sprintf("Scanned %d skills from %s", len(skills), root))
	return skills, nil
}

func (a *App) ImportSkillFolder(source string, root string) (models.SkillInfo, error) {
	skill, err := skillscanner.ImportSkillFolder(source, root)
	if err != nil {
		a.logError("skills:import", err.Error())
		return models.SkillInfo{}, err
	}
	a.logSuccess("skills:import", fmt.Sprintf("Imported %s from %s", skill.Name, source))
	return skill, nil
}

// ---------- 工具检测 / Git ----------

func (a *App) DetectCliTools() ([]models.ToolStatus, error) {
	tools := clidetector.DetectCliTools()
	detected := 0
	for _, t := range tools {
		if t.Detected {
			detected++
		}
	}
	a.logInfo("tools:detect", fmt.Sprintf("Detected %d / %d CLI tools", detected, len(tools)))
	return tools, nil
}

func (a *App) GetGitStatus(root string) (models.GitStatus, error) {
	return gitstatus.GetGitStatus(root), nil
}

// ---------- 同步 ----------

func (a *App) CheckSyncStatus(skill models.SkillInfo, toolName string) (models.SyncStatus, error) {
	return synctargets.CheckSyncStatus(skill, toolName)
}

// syncErrorStatus 构造一个带统一 TargetPath 的错误态 SyncStatus，
// 避免在 SyncSkillToTool 里重复样板。
func (a *App) syncErrorStatus(toolName, skillName string, state models.SyncState, msg string) models.SyncStatus {
	targetPath, _ := synctargets.GetTargetPath(toolName, skillName)
	return models.SyncStatus{
		TargetName: toolName,
		TargetPath: targetPath,
		State:      state,
		Message:    msg,
	}
}

func (a *App) SyncSkillToTool(skill models.SkillInfo, toolName string) (models.SyncStatus, error) {
	if !models.IsSupportedTool(toolName) {
		msg := fmt.Sprintf("Sync to %s is not yet supported.", toolName)
		a.logInfo("sync:skill", msg)
		return a.syncErrorStatus(toolName, skill.Name, models.SyncStateUnsupported, msg), nil
	}

	if !symlinkwindows.IsWindows() {
		msg := "Current version only supports Windows directory junctions for sync."
		a.logError("sync:skill", msg)
		return a.syncErrorStatus(toolName, skill.Name, models.SyncStateError, msg), nil
	}

	result, err := synctargets.SyncSkillToTool(skill, toolName)
	if err != nil {
		a.logError("sync:skill", err.Error())
		return result, err
	}
	switch result.State {
	case models.SyncStateSynced:
		a.logSuccess("sync:skill", fmt.Sprintf("Synced %s to %s", skill.Name, toolName))
	case models.SyncStateConflict:
		a.logError("sync:skill", fmt.Sprintf("Conflict: %s - %s", result.TargetPath, result.Message))
	case models.SyncStateError, models.SyncStateInvalid:
		a.logError("sync:skill", fmt.Sprintf("Failed %s to %s: %s", skill.Name, toolName, result.Message))
	default:
		a.logInfo("sync:skill", fmt.Sprintf("%s -> %s: %s", skill.Name, toolName, result.State))
	}
	return result, nil
}

// ---------- CLI 扫描 / 元数据 ----------

// ScanCliTool 返回某个 CLI 工具 skills 目录下的所有顶层条目，
// 并相对当前共享根进行分类。只读操作。
func (a *App) ScanCliTool(toolName string, sharedRoot string) ([]models.CliSkillEntry, error) {
	entries, err := clitoolscanner.ScanCliSkills(toolName, sharedRoot)
	if err != nil {
		a.logError("cli:scan", err.Error())
		return []models.CliSkillEntry{}, err
	}
	a.logInfo("cli:scan", fmt.Sprintf("Scanned %d entries under %s", len(entries), toolName))
	return entries, nil
}

// RefreshSyncStatuses 对每个 skill × 每个已支持工具重新计算 CheckSyncStatus，
// 不会重新扫描目录。返回以 skill.Path -> toolName -> SyncStatus 为索引的 map。
func (a *App) RefreshSyncStatuses(skills []models.SkillInfo) (map[string]map[string]models.SyncStatus, error) {
	out := make(map[string]map[string]models.SyncStatus, len(skills))
	for _, s := range skills {
		inner := make(map[string]models.SyncStatus, len(models.SupportedTools))
		for _, tool := range models.SupportedTools {
			status, err := synctargets.CheckSyncStatus(s, tool)
			if err != nil {
				continue
			}
			inner[tool] = status
		}
		out[s.Path] = inner
	}
	return out, nil
}

// UnlinkSkill 移除某个工具侧为该 skill 创建的 junction。
// 真实目录永远不会被删除；若目标存在但不是链接，会返回错误。
func (a *App) UnlinkSkill(toolName string, skillName string) error {
	if err := synctargets.UnlinkSkillFromTool(toolName, skillName); err != nil {
		a.logError("sync:unlink", err.Error())
		return err
	}
	a.logSuccess("sync:unlink", fmt.Sprintf("Unlinked %s from %s", skillName, toolName))
	return nil
}

// ImportSkillFromCli 将 CLI 工具目录下的真实 skill 复制进共享根，
// 并在注册表中做好标记。origin 必须是 "owned" 或 "vendored"，
// 其它值都会被规范化为 "vendored"。
func (a *App) ImportSkillFromCli(toolName string, cliSkillName string, sharedRoot string, origin string) (models.SkillInfo, error) {
	skill, err := skillscanner.ImportFromCli(toolName, cliSkillName, sharedRoot, models.SkillOrigin(origin))
	if err != nil {
		a.logError("cli:import", err.Error())
		return models.SkillInfo{}, err
	}
	a.logSuccess(
		"cli:import",
		fmt.Sprintf("Imported %s from %s as %s", skill.Name, toolName, skill.Origin),
	)
	return skill, nil
}

// MigrateCliSkillToShared 把 CLI 工具目录下的真实 skill 迁移进共享根：
// 共享根保留真身（origin=owned），CLI 原位置改成 junction 指回共享根。
// 完成后就不再有 shadowing 冲突，CheckSyncStatus 会直接判为 Synced。
//
// 这是破坏性操作：会改名 CLI 原目录、建 junction、删 staging tmp。
// 任何一步失败都会按事务回滚，CLI 原目录保证留在原位。
func (a *App) MigrateCliSkillToShared(toolName string, cliSkillName string, sharedRoot string) (models.SkillInfo, error) {
	skill, err := skillscanner.MigrateFromCli(toolName, cliSkillName, sharedRoot)
	if err != nil {
		// 即便 skill 非零也可能带软警告 err（registry / tmp 清理失败），
		// 此时物理迁移已完成但元数据缺失或留有残留，日志里必须记错误。
		a.logError("cli:migrate", err.Error())
		return skill, err
	}
	a.logSuccess(
		"cli:migrate",
		fmt.Sprintf("Migrated %s from %s into shared root (now linked via junction).", skill.Name, toolName),
	)
	return skill, nil
}

// SkillMetadataPatch 是 SetSkillMetadata 的入参。
// 任何指针字段为 nil 时表示不修改，这样前端可以只发送刚被切换的那一项。
type SkillMetadataPatch struct {
	Hidden *bool   `json:"hidden,omitempty"`
	Frozen *bool   `json:"frozen,omitempty"`
	Origin *string `json:"origin,omitempty"`
}

// SetSkillMetadata 更新注册表中某个 skill 的字段，返回合并后的条目。
func (a *App) SetSkillMetadata(sharedRoot string, skillName string, patch SkillMetadataPatch) (registry.Entry, error) {
	if skillName == "" {
		return registry.Entry{}, fmt.Errorf("skill name must not be empty")
	}
	if sharedRoot == "" {
		return registry.Entry{}, fmt.Errorf("shared root must not be empty")
	}
	reg, err := registry.Load(sharedRoot)
	if err != nil {
		a.logError("registry:set", err.Error())
		return registry.Entry{}, err
	}
	current, _ := reg.Get(skillName)
	if patch.Hidden != nil {
		current.Hidden = *patch.Hidden
	}
	if patch.Frozen != nil {
		current.Frozen = *patch.Frozen
	}
	if patch.Origin != nil {
		v := models.SkillOrigin(*patch.Origin)
		if v != models.SkillOriginOwned && v != models.SkillOriginVendored {
			v = models.SkillOriginOwned
		}
		current.Origin = v
	}
	reg.Set(skillName, current)
	if err := registry.Save(sharedRoot, reg); err != nil {
		a.logError("registry:set", err.Error())
		return registry.Entry{}, err
	}
	updated, _ := reg.Get(skillName)
	a.logInfo("registry:set", fmt.Sprintf("Updated metadata for %s", skillName))
	return updated, nil
}

// GetRegistry 返回指定共享根下的注册表原始文档。
func (a *App) GetRegistry(sharedRoot string) (registry.Registry, error) {
	return registry.Load(sharedRoot)
}
