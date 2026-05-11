package main

import (
	"context"
	"fmt"
	"os/exec"
	"runtime"
	"sync"
	"time"

	"skill-sync-manager/internal/clidetector"
	"skill-sync-manager/internal/gitstatus"
	"skill-sync-manager/internal/models"
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
