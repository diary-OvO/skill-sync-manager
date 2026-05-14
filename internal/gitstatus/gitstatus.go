package gitstatus

import (
	"os/exec"
	"strings"

	"skill-sync-manager/internal/models"
	"skill-sync-manager/internal/proc"
)

func runGit(args ...string) (string, error) {
	out, err := proc.RunCombined("proc:git", "", "git", args...)
	if err != nil {
		return out, err
	}
	return out, nil
}

// IsGitAvailable 判断本机是否能正常调用 `git --version`。
func IsGitAvailable() bool {
	_, err := exec.LookPath("git")
	return err == nil
}

// GetGitStatus 针对 root 运行一系列只读的 git 命令，返回稳定的结构体。
// 命令失败不会作为错误抛出 —— 前端看到的是对应字段被置为 false。
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
