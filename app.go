package main

import (
	"context"
	"fmt"
	"os/exec"
	"runtime"
	"sync"
	"sync/atomic"
	"time"

	"skill-sync-manager/internal/clidetector"
	"skill-sync-manager/internal/clitoolscanner"
	"skill-sync-manager/internal/gitstatus"
	"skill-sync-manager/internal/models"
	"skill-sync-manager/internal/registry"
	"skill-sync-manager/internal/settings"
	"skill-sync-manager/internal/skillscanner"
	"skill-sync-manager/internal/symlinkwindows"
	"skill-sync-manager/internal/synctargets"

	wailsRuntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

// App holds state shared by the Wails-bound methods. Every public method on
// this type is exposed to the frontend by Wails codegen.
type App struct {
	ctx context.Context

	logMu      sync.Mutex
	logHistory []models.LogEntry

	// shuttingDown guards the shutdown pipeline against re-entry. OnBeforeClose
	// can fire more than once in some Wails/WebView2 edge cases (double-click
	// on the X, programmatic Quit racing with user close, etc.), and we also
	// expose a QuitApp method to the frontend.
	shuttingDown atomic.Bool
}

func NewApp() *App {
	return &App{
		logHistory: make([]models.LogEntry, 0, 128),
	}
}

// startup is wired in main.go via options.App.OnStartup.
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	a.logInfo("app:ready", fmt.Sprintf("Skill Sync Manager starting on %s", runtime.GOOS))
}

// onBeforeClose is wired via options.App.OnBeforeClose. Wails calls this on
// the main thread when the user triggers window close (X button, Alt-F4, OS
// menu). Returning false lets the close proceed; returning true would veto it.
//
// We run the shutdown pipeline first, then allow the close. The pipeline is
// idempotent, so onShutdown can safely re-run anything that still has work.
func (a *App) onBeforeClose(ctx context.Context) (prevent bool) {
	a.runShutdown("window-close")
	return false
}

// onShutdown is wired via options.App.OnShutdown. It runs after the window is
// gone but before wails.Run returns. Use it as the last-chance cleanup point
// for anything that must happen regardless of how we got here (X button,
// QuitApp from JS, OS signal).
func (a *App) onShutdown(ctx context.Context) {
	a.runShutdown("shutdown-hook")
}

// runShutdown centralizes the teardown sequence. It is safe to call multiple
// times — the first call wins and subsequent calls return immediately.
//
// Current cleanup scope:
//   - Nothing persistent here *today*: settings are flushed synchronously on
//     every SaveSettings call, the registry is flushed synchronously on every
//     SetSkillMetadata / ImportFromCli call, and log history is session-only.
//   - No background goroutines, no long-lived file handles, no DB.
//
// Keep this function as the single place to add cleanup when that changes:
// background watchers, file indexers, telemetry flushers, etc. all plug in
// here and inherit the "runs once, runs on any exit path" guarantee.
func (a *App) runShutdown(reason string) {
	if !a.shuttingDown.CompareAndSwap(false, true) {
		return
	}
	// Best-effort log entry — if the frontend is already gone, EventsEmit is
	// a no-op. We still want this in logHistory for any attached debugger.
	a.logInfo("app:shutdown", fmt.Sprintf("Shutting down (%s)", reason))

	// Future cleanup goes here, in reverse order of startup. Example shape:
	//
	//   if a.watcher != nil { a.watcher.Close() }
	//   if a.indexer != nil { a.indexer.Stop(ctx) }
	//   if a.db != nil      { _ = a.db.Close() }
	//
	// Each step should be wrapped so a single failure does not abort the rest.
}

// QuitApp is exposed to the frontend so the UI (or a hotkey, or a menu item)
// can trigger a full, graceful exit. Runs the shutdown pipeline, then asks
// Wails to tear down the window and return from wails.Run. Safe to call from
// any goroutine; safe to call more than once.
func (a *App) QuitApp() {
	a.runShutdown("quit-api")
	if a.ctx != nil {
		wailsRuntime.Quit(a.ctx)
	}
}

// ---------- logging ----------

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

// LogHistory returns every log entry the backend has recorded this session.
func (a *App) LogHistory() []models.LogEntry {
	a.logMu.Lock()
	defer a.logMu.Unlock()
	out := make([]models.LogEntry, len(a.logHistory))
	copy(out, a.logHistory)
	return out
}

// ---------- settings ----------

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

// ---------- dialogs / shell ----------

func (a *App) SelectRootFolder() (string, error) {
	if a.ctx == nil {
		return "", fmt.Errorf("dialog not available yet")
	}
	return wailsRuntime.OpenDirectoryDialog(a.ctx, wailsRuntime.OpenDialogOptions{
		Title: "Select Shared Skill Root",
	})
}

func (a *App) SelectSkillFolder() (string, error) {
	if a.ctx == nil {
		return "", fmt.Errorf("dialog not available yet")
	}
	return wailsRuntime.OpenDirectoryDialog(a.ctx, wailsRuntime.OpenDialogOptions{
		Title: "Select Skill Folder to Import",
	})
}

// OpenPath opens `path` in the OS file explorer / finder.
func (a *App) OpenPath(path string) error {
	if path == "" {
		return fmt.Errorf("no path provided")
	}
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "windows":
		cmd = exec.Command("cmd", "/C", "explorer", path)
	case "darwin":
		cmd = exec.Command("open", path)
	default:
		cmd = exec.Command("xdg-open", path)
	}
	if err := cmd.Start(); err != nil {
		a.logError("shell:open-path", err.Error())
		return err
	}
	return nil
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

// ---------- tools / git ----------

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

// ---------- sync ----------

func (a *App) CheckSyncStatus(skill models.SkillInfo, toolName string) (models.SyncStatus, error) {
	return synctargets.CheckSyncStatus(skill, toolName)
}

func (a *App) SyncSkillToTool(skill models.SkillInfo, toolName string) (models.SyncStatus, error) {
	if !models.IsSupportedTool(toolName) {
		targetPath, _ := synctargets.GetTargetPath(toolName, skill.Name)
		msg := fmt.Sprintf("Sync to %s is not yet supported.", toolName)
		a.logInfo("sync:skill", msg)
		return models.SyncStatus{
			TargetName: toolName,
			TargetPath: targetPath,
			State:      models.SyncStateUnsupported,
			Message:    msg,
		}, nil
	}

	if !symlinkwindows.IsWindows() {
		targetPath, _ := synctargets.GetTargetPath(toolName, skill.Name)
		msg := "Current version only supports Windows directory junctions for sync."
		a.logError("sync:skill", msg)
		return models.SyncStatus{
			TargetName: toolName,
			TargetPath: targetPath,
			State:      models.SyncStateError,
			Message:    msg,
		}, nil
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

// ---------- CLI inspector / metadata ----------

// ScanCliTool returns every top-level entry inside a CLI tool's skills
// directory, classified against the current shared root. Read-only.
func (a *App) ScanCliTool(toolName string, sharedRoot string) ([]models.CliSkillEntry, error) {
	entries, err := clitoolscanner.ScanCliSkills(toolName, sharedRoot)
	if err != nil {
		a.logError("cli:scan", err.Error())
		return []models.CliSkillEntry{}, err
	}
	a.logInfo("cli:scan", fmt.Sprintf("Scanned %d entries under %s", len(entries), toolName))
	return entries, nil
}

// RefreshSyncStatuses recomputes CheckSyncStatus for every skill against
// every supported tool without rescanning directories. Returns a map
// keyed by skill.Path -> toolName -> SyncStatus.
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

// UnlinkSkill removes a tool-side junction for a skill. Real directories
// are never deleted. Returns an error if the path exists but is not a
// link.
func (a *App) UnlinkSkill(toolName string, skillName string) error {
	if err := synctargets.UnlinkSkillFromTool(toolName, skillName); err != nil {
		a.logError("sync:unlink", err.Error())
		return err
	}
	a.logSuccess("sync:unlink", fmt.Sprintf("Unlinked %s from %s", skillName, toolName))
	return nil
}

// ImportSkillFromCli copies a CLI-side real skill directory into the
// shared root and marks it in the registry. origin must be "owned" or
// "vendored"; any other value is normalized to "vendored".
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

// SkillMetadataPatch is the payload for SetSkillMetadata. Any pointer
// field left nil is not modified, so the UI can send only the toggle it
// just flipped.
type SkillMetadataPatch struct {
	Hidden *bool   `json:"hidden,omitempty"`
	Frozen *bool   `json:"frozen,omitempty"`
	Origin *string `json:"origin,omitempty"`
}

// SetSkillMetadata updates registry fields for a skill. Returns the
// merged entry.
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

// GetRegistry returns the raw registry document for a shared root.
func (a *App) GetRegistry(sharedRoot string) (registry.Registry, error) {
	return registry.Load(sharedRoot)
}
