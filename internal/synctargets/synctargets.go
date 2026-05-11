package synctargets

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"skill-sync-manager/internal/models"
	"skill-sync-manager/internal/symlinkwindows"
)

const windowsOnlyMessage = "Current version only supports Windows directory junctions for sync."

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
	return filepath.Join(h, ".agents", "skills"), nil
}

// GetTargetDir returns the per-tool skills directory. For unsupported tools
// it still returns something so the UI can display a placeholder path.
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
