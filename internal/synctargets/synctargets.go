package synctargets

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"skill-sync-manager/internal/models"
	"skill-sync-manager/internal/symlinkwindows"
)

// 当前版本仅支持通过 Windows 目录 junction 做同步，其他平台一律返回此提示。
const windowsOnlyMessage = "Current version only supports Windows directory junctions for sync."

// getHomeDir 获取当前用户主目录。优先使用 os.UserHomeDir，
// 再退回 USERPROFILE / HOME 环境变量。
func getHomeDir() (string, error) {
	if h, err := os.UserHomeDir(); err == nil && h != "" {
		return h, nil
	}
	if v := os.Getenv("USERPROFILE"); v != "" {
		return v, nil
	}
	if v := os.Getenv("HOME"); v != "" {
		return v, nil
	}
	return "", fmt.Errorf("could not resolve user home directory")
}

func GetClaudeSkillsDir() (string, error) {
	h, err := getHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(h, ".claude", "skills"), nil
}

func GetCodexSkillsDir() (string, error) {
	h, err := getHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(h, ".codex", "skills"), nil
}

// GetTargetDir 返回某个工具的 skills 目录。
// 即使是尚未支持的工具也会返回一个占位路径，方便前端显示。
func GetTargetDir(toolName string) (string, error) {
	switch toolName {
	case "claude":
		return GetClaudeSkillsDir()
	case "codex":
		return GetCodexSkillsDir()
	default:
		h, err := getHomeDir()
		if err != nil {
			return "", err
		}
		return filepath.Join(h, "."+toolName, "skills"), nil
	}
}

func GetTargetPath(toolName string, skillName string) (string, error) {
	dir, err := GetTargetDir(toolName)
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, skillName), nil
}

func CheckSyncStatus(skill models.SkillInfo, toolName string) (models.SyncStatus, error) {
	targetPath, err := GetTargetPath(toolName, skill.Name)
	if err != nil {
		return models.SyncStatus{
			TargetName: toolName,
			TargetPath: "",
			State:      models.SyncStateError,
			Message:    err.Error(),
		}, nil
	}

	base := models.SyncStatus{TargetName: toolName, TargetPath: targetPath}

	if !models.IsSupportedTool(toolName) {
		base.State = models.SyncStateUnsupported
		base.Message = fmt.Sprintf("%s sync is not yet supported.", toolName)
		return base, nil
	}

	if !skill.Valid {
		base.State = models.SyncStateInvalid
		base.Message = "Skill is invalid: " + joinErrors(skill.Errors)
		return base, nil
	}

	if !symlinkwindows.IsWindows() {
		base.State = models.SyncStateError
		base.Message = windowsOnlyMessage
		return base, nil
	}

	if !symlinkwindows.PathExists(targetPath) {
		base.State = models.SyncStateMissing
		base.Message = "Not synced yet."
		return base, nil
	}

	isLink := symlinkwindows.IsLinkPath(targetPath)
	if !isLink {
		base.State = models.SyncStateConflict
		base.Message = fmt.Sprintf(
			"A real directory (not a junction) already exists at %s.", targetPath,
		)
		return base, nil
	}

	resolved, err := symlinkwindows.ResolveRealPath(targetPath)
	if err != nil {
		base.State = models.SyncStateConflict
		base.Message = fmt.Sprintf("Existing link at %s could not be resolved: %v", targetPath, err)
		return base, nil
	}

	absSkill, err := filepath.Abs(skill.Path)
	if err != nil {
		absSkill = skill.Path
	}

	if strings.EqualFold(filepath.Clean(resolved), filepath.Clean(absSkill)) {
		base.State = models.SyncStateSynced
		base.Message = fmt.Sprintf("Junction points to %s", resolved)
		return base, nil
	}

	base.State = models.SyncStateConflict
	base.Message = fmt.Sprintf("Existing junction points elsewhere: %s", resolved)
	return base, nil
}

func joinErrors(errs []string) string {
	if len(errs) == 0 {
		return "unknown error"
	}
	return strings.Join(errs, "; ")
}

func SyncSkillToTool(skill models.SkillInfo, toolName string) (models.SyncStatus, error) {
	current, _ := CheckSyncStatus(skill, toolName)

	switch current.State {
	case models.SyncStateSynced,
		models.SyncStateUnsupported,
		models.SyncStateInvalid,
		models.SyncStateConflict:
		return current, nil
	}

	if !symlinkwindows.IsWindows() {
		current.State = models.SyncStateError
		current.Message = windowsOnlyMessage
		return current, nil
	}

	if err := os.MkdirAll(filepath.Dir(current.TargetPath), 0o755); err != nil {
		current.State = models.SyncStateError
		current.Message = fmt.Sprintf("Failed to create parent directory: %v", err)
		return current, nil
	}
	if err := symlinkwindows.CreateDirectoryJunction(current.TargetPath, skill.Path); err != nil {
		current.State = models.SyncStateError
		current.Message = err.Error()
		return current, nil
	}
	return models.SyncStatus{
		TargetName: toolName,
		TargetPath: current.TargetPath,
		State:      models.SyncStateSynced,
		Message:    fmt.Sprintf("Created junction %s -> %s", current.TargetPath, skill.Path),
	}, nil
}

// UnlinkSkillFromTool 从 toolName 对应的目录下移除 skillName 所在的
// junction / 符号链接。只会删除链接项，真实目录永远不会被触碰；
// 当目标根本不存在时返回 nil，调用方无需判空。
func UnlinkSkillFromTool(toolName string, skillName string) error {
	if skillName == "" {
		return fmt.Errorf("skill name must not be empty")
	}
	targetPath, err := GetTargetPath(toolName, skillName)
	if err != nil {
		return err
	}
	if !symlinkwindows.PathExists(targetPath) {
		return nil
	}
	if !symlinkwindows.IsLinkPath(targetPath) {
		return fmt.Errorf(
			"%s is a real directory, not a junction/symlink. Skill Sync Manager will not delete it.",
			targetPath,
		)
	}
	// os.Remove 可以直接删除符号链接 / junction，而不会跟随进去。
	if err := os.Remove(targetPath); err != nil {
		return fmt.Errorf("failed to remove link %s: %v", targetPath, err)
	}
	return nil
}
