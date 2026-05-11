package gitstatus

import (
	"os/exec"
	"strings"

	"skill-sync-manager/internal/models"
)

func runGit(args ...string) (string, error) {
	cmd := exec.Command("git", args...)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return string(out), err
	}
	return string(out), nil
}

// IsGitAvailable returns true if `git --version` works.
func IsGitAvailable() bool {
	out, err := runGit("--version")
	if err != nil {
		return false
	}
	return strings.Contains(strings.ToLower(out), "git")
}

// GetGitStatus runs a series of read-only git commands against `root` and
// returns a stable struct. No command failure is propagated as an error —
// the UI just sees the appropriate flags set to false.
func GetGitStatus(root string) models.GitStatus {
	status := models.GitStatus{
		Remotes: []string{},
	}

	if root == "" {
		return status
	}

	status.GitAvailable = IsGitAvailable()
	if !status.GitAvailable {
		return status
	}

	out, err := runGit("-C", root, "rev-parse", "--is-inside-work-tree")
	if err != nil || strings.TrimSpace(out) != "true" {
		return status
	}
	status.IsRepo = true

	if out, err := runGit("-C", root, "branch", "--show-current"); err == nil {
		br := strings.TrimSpace(out)
		if br != "" {
			status.Branch = &br
		}
	}

	if out, err := runGit("-C", root, "remote", "-v"); err == nil {
		lines := splitLines(out)
		status.Remotes = lines
		status.HasRemote = len(lines) > 0
	}

	if out, err := runGit("-C", root, "status", "--porcelain"); err == nil {
		status.Dirty = strings.TrimSpace(out) != ""
	}

	return status
}

func splitLines(s string) []string {
	s = strings.ReplaceAll(s, "\r\n", "\n")
	parts := strings.Split(s, "\n")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p != "" {
			out = append(out, p)
		}
	}
	return out
}
