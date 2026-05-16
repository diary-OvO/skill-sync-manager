package gitignore

import (
	"os"
	"path/filepath"
	"strings"
)

const fileName = ".gitignore"

func SkillPattern(skillName string) string {
	name := strings.Trim(strings.ReplaceAll(skillName, "\\", "/"), "/")
	return "/" + name + "/"
}

func IsSkillIgnored(sharedRoot string, skillName string) bool {
	lines, err := readLines(sharedRoot)
	if err != nil {
		return false
	}
	pattern := SkillPattern(skillName)
	for _, line := range lines {
		if matchesSkillPattern(line, skillName, pattern) {
			return true
		}
	}
	return false
}

func SetSkillIgnored(sharedRoot string, skillName string, ignored bool) error {
	pattern := SkillPattern(skillName)
	lines, err := readLines(sharedRoot)
	if err != nil && !os.IsNotExist(err) {
		return err
	}

	next := make([]string, 0, len(lines)+1)
	for _, line := range lines {
		if matchesSkillPattern(line, skillName, pattern) {
			continue
		}
		next = append(next, line)
	}
	if ignored {
		if len(next) > 0 && strings.TrimSpace(next[len(next)-1]) != "" {
			next = append(next, "")
		}
		next = append(next, "# Skill Sync Manager: local/downloaded skills", pattern)
	}

	content := strings.Join(next, "\n")
	if content != "" && !strings.HasSuffix(content, "\n") {
		content += "\n"
	}
	return os.WriteFile(filepath.Join(sharedRoot, fileName), []byte(content), 0o644)
}

func readLines(sharedRoot string) ([]string, error) {
	data, err := os.ReadFile(filepath.Join(sharedRoot, fileName))
	if err != nil {
		return nil, err
	}
	text := strings.ReplaceAll(string(data), "\r\n", "\n")
	text = strings.ReplaceAll(text, "\r", "\n")
	return strings.Split(text, "\n"), nil
}

func matchesSkillPattern(line string, skillName string, pattern string) bool {
	trimmed := strings.TrimSpace(line)
	if trimmed == "" || strings.HasPrefix(trimmed, "#") {
		return false
	}
	trimmed = strings.TrimSuffix(trimmed, "/")
	candidates := []string{
		strings.TrimSuffix(pattern, "/"),
		strings.Trim(strings.ReplaceAll(skillName, "\\", "/"), "/"),
		"/" + strings.Trim(strings.ReplaceAll(skillName, "\\", "/"), "/"),
	}
	for _, candidate := range candidates {
		if trimmed == candidate {
			return true
		}
	}
	return false
}
