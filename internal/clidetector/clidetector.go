package clidetector

import (
	"os/exec"

	"skill-sync-manager/internal/models"
)

// DetectCliTools 检查 PATH 中是否存在各个 CLI agent。
// 直接使用 exec.LookPath，避免为了探测再拉起额外 shell 进程。
// 返回列表与 models.AllTools() 一一对应（claude、codex、gemini、opencode、hermes）。
func DetectCliTools() []models.ToolStatus {
	tools := models.AllTools()
	results := make([]models.ToolStatus, 0, len(tools))
	for _, name := range tools {
		exe := locateExecutable(name)
		var ptr *string
		if exe != "" {
			s := exe
			ptr = &s
		}
		results = append(results, models.ToolStatus{
			ToolName:       name,
			ExecutablePath: ptr,
			Detected:       exe != "",
			Supported:      models.IsSupportedTool(name),
		})
	}
	return results
}

func locateExecutable(tool string) string {
	out, err := exec.LookPath(tool)
	if err != nil {
		return ""
	}
	return out
}
