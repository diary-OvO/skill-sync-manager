package proc

import (
	"fmt"
	"os/exec"
	"strconv"
	"strings"
	"sync"
	"time"
)

type Observer func(result string, action string, message string)

var (
	observerMu sync.RWMutex
	observer   Observer
)

// SetObserver installs a process log observer used by the GUI log panel.
// Passing nil disables process-level logging.
func SetObserver(fn Observer) {
	observerMu.Lock()
	observer = fn
	observerMu.Unlock()
}

// Command creates an exec.Cmd with platform-specific process attributes applied.
func Command(name string, args ...string) *exec.Cmd {
	cmd := exec.Command(name, args...)
	prepare(cmd)
	return cmd
}

// RunCombined runs a command, captures stdout/stderr, and emits one structured log entry.
func RunCombined(action string, dir string, name string, args ...string) (string, error) {
	cmd := Command(name, args...)
	if dir != "" {
		cmd.Dir = dir
	}

	startedAt := time.Now()
	out, err := cmd.CombinedOutput()
	emitCompletion(action, cmd, out, err, time.Since(startedAt))
	return string(out), err
}

// Start launches a detached process and emits a short log entry.
func Start(action string, dir string, name string, args ...string) error {
	cmd := Command(name, args...)
	if dir != "" {
		cmd.Dir = dir
	}

	startedAt := time.Now()
	if err := cmd.Start(); err != nil {
		emitCompletion(action, cmd, nil, err, time.Since(startedAt))
		return err
	}
	if cmd.Process != nil {
		_ = cmd.Process.Release()
	}

	log("info", action, formatStartedMessage(cmd, time.Since(startedAt)))
	return nil
}

func emitCompletion(action string, cmd *exec.Cmd, out []byte, err error, took time.Duration) {
	result := "success"
	if err != nil {
		result = "error"
	}
	log(result, action, formatCompletionMessage(cmd, out, err, took))
}

func log(result string, action string, message string) {
	observerMu.RLock()
	fn := observer
	observerMu.RUnlock()
	if fn != nil {
		fn(result, action, message)
	}
}

func formatStartedMessage(cmd *exec.Cmd, took time.Duration) string {
	lines := []string{
		"started command=" + formatCommand(cmd.Args),
		"duration=" + formatDuration(took),
	}
	if cmd.Dir != "" {
		lines = append(lines, "workdir="+cmd.Dir)
	}
	return strings.Join(lines, "\n")
}

func formatCompletionMessage(cmd *exec.Cmd, out []byte, err error, took time.Duration) string {
	lines := []string{
		"command=" + formatCommand(cmd.Args),
		"duration=" + formatDuration(took),
	}
	if cmd.Dir != "" {
		lines = append(lines, "workdir="+cmd.Dir)
	}
	if err != nil {
		lines = append(lines, "error="+err.Error())
	}
	if output := truncateOutput(normalizeOutput(string(out)), 1200); output != "" {
		lines = append(lines, "output:\n"+output)
	}
	return strings.Join(lines, "\n")
}

func formatCommand(args []string) string {
	if len(args) == 0 {
		return "(empty)"
	}
	parts := make([]string, 0, len(args))
	for _, arg := range args {
		parts = append(parts, quoteArg(arg))
	}
	return strings.Join(parts, " ")
}

func quoteArg(arg string) string {
	if arg == "" || strings.ContainsAny(arg, " \t\r\n\"'") {
		return strconv.Quote(arg)
	}
	return arg
}

func normalizeOutput(s string) string {
	return strings.TrimSpace(strings.ReplaceAll(s, "\r\n", "\n"))
}

func truncateOutput(s string, limit int) string {
	if limit <= 0 || len(s) <= limit {
		return s
	}
	return fmt.Sprintf("%s\n...[truncated %d chars]", s[:limit], len(s)-limit)
}

func formatDuration(took time.Duration) string {
	if took < time.Millisecond {
		return took.String()
	}
	return took.Round(time.Millisecond).String()
}
