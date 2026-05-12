package clidetector

import (
	"os/exec"
	"runtime"
	"strings"

	"skill-sync-manager/internal/models"
)

// DetectCliTools 检查 PATH 中是否存在各个 CLI agent。
// Windows 下使用 `where`，其他系统使用 `which`。
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
	lookup := "which"
	if runtime.GOOS == "windows" {
		lookup = "where"
	}
	out, err := exec.Command(lookup, tool).CombinedOutput()
	if err != nil {
		return ""
	}
	for _, line := range strings.Split(strings.ReplaceAll(string(out), "\r\n", "\n"), "\n") {
		line = strings.TrimSpace(line)
		if line != "" {
			return line
		}
	}
	return ""
}
