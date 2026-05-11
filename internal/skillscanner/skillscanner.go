package skillscanner

import (
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"skill-sync-manager/internal/models"
	"skill-sync-manager/internal/registry"
	"skill-sync-manager/internal/symlinkwindows"
	"skill-sync-manager/internal/synctargets"
)

const BodyPreviewLimit = 800

type ParsedSkillMarkdown struct {
	Frontmatter map[string]string
	Body        string
	BodyPreview string
	Name        string
	Description string
	Errors      []string
}

// ParseSkillMarkdown reads a SKILL.md file and returns a parsed representation
// of its simple `key: value` YAML frontmatter plus the body preview.
//
// Parsing rules:
//  1. Only files beginning with a `---` line are treated as having frontmatter.
//  2. The frontmatter ends at the next `---` line.
//  3. Inside the frontmatter block, only `key: value` lines are parsed.
//  4. `name` and `description` are required; anything else is passed through.
func ParseSkillMarkdown(skillMdPath string) (ParsedSkillMarkdown, error) {
	parsed := ParsedSkillMarkdown{
		Frontmatter: map[string]string{},
	}

	data, err := os.ReadFile(skillMdPath)
	if err != nil {
		parsed.Errors = append(parsed.Errors, fmt.Sprintf("Failed to read SKILL.md: %v", err))
		return parsed, nil
	}

	text := string(data)
	// Normalize line endings so splitting by "\n" is stable on Windows.
	text = strings.ReplaceAll(text, "\r\n", "\n")

	var body string
	if strings.HasPrefix(text, "---\n") {
		rest := text[4:]
		end := strings.Index(rest, "\n---")
		if end >= 0 {
			fm := rest[:end]
			bodyStart := end + len("\n---")
			if bodyStart < len(rest) && rest[bodyStart] == '\n' {
				bodyStart++
			}
			body = rest[bodyStart:]
			parseFrontmatterLines(fm, parsed.Frontmatter)
		} else {
			// Unterminated frontmatter — treat whole file as body and record a warning.
			parsed.Errors = append(parsed.Errors, "Frontmatter block was not closed with '---'")
			body = text
		}
	} else {
		body = text
	}

	parsed.Name = strings.TrimSpace(parsed.Frontmatter["name"])
	parsed.Description = strings.TrimSpace(parsed.Frontmatter["description"])

	if parsed.Name == "" {
		parsed.Errors = append(parsed.Errors, "Frontmatter is missing required field: name")
	}
	if parsed.Description == "" {
		parsed.Errors = append(parsed.Errors, "Frontmatter is missing required field: description")
	}

	trimmed := strings.TrimLeft(body, " \t\r\n")
	parsed.Body = body
	if len(trimmed) > BodyPreviewLimit {
		parsed.BodyPreview = trimmed[:BodyPreviewLimit]
	} else {
		parsed.BodyPreview = trimmed
	}

	return parsed, nil
}

func parseFrontmatterLines(block string, out map[string]string) {
	for _, rawLine := range strings.Split(block, "\n") {
		line := strings.TrimRight(rawLine, " \t\r")
		if line == "" {
			continue
		}
		trimmed := strings.TrimLeft(line, " \t")
		if strings.HasPrefix(trimmed, "#") {
			continue
		}
		colon := strings.IndexByte(line, ':')
		if colon <= 0 {
			continue
		}
		key := strings.TrimSpace(line[:colon])
		value := strings.TrimSpace(line[colon+1:])
		value = stripSurroundingQuotes(value)
		if key == "" {
			continue
		}
		out[key] = value
	}
}

func stripSurroundingQuotes(s string) string {
	if len(s) >= 2 {
		if (s[0] == '"' && s[len(s)-1] == '"') || (s[0] == '\'' && s[len(s)-1] == '\'') {
			return s[1 : len(s)-1]
		}
	}
	return s
}

// ScanSkills walks the first level of `root` and returns every subdirectory
// that contains a SKILL.md. Registry metadata (origin/hidden/frozen) is
// merged in. The .skill-manager folder is skipped.
func ScanSkills(root string) ([]models.SkillInfo, error) {
	if root == "" {
		return []models.SkillInfo{}, nil
	}
	info, err := os.Stat(root)
	if err != nil || !info.IsDir() {
		return []models.SkillInfo{}, nil
	}

	entries, err := os.ReadDir(root)
	if err != nil {
		return []models.SkillInfo{}, nil
	}

	reg, _ := registry.Load(root)

	results := make([]models.SkillInfo, 0, len(entries))
	seen := map[string]bool{}
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		if entry.Name() == registry.DirName {
			continue
		}
		skillDir := filepath.Join(root, entry.Name())
		skillMd := filepath.Join(skillDir, "SKILL.md")
		st, err := os.Stat(skillMd)
		if err != nil || st.IsDir() {
			continue
		}
		parsed, _ := ParseSkillMarkdown(skillMd)
		folderName := entry.Name()

		displayName := parsed.Name
		if displayName == "" {
			displayName = folderName
		}

		errs := append([]string{}, parsed.Errors...)
		if parsed.Name != "" && parsed.Name != folderName {
			errs = append(errs, fmt.Sprintf(
				"Frontmatter name %q differs from folder %q. Frontmatter name will be used as the sync target.",
				parsed.Name, folderName,
			))
		}

		valid := parsed.Name != "" && parsed.Description != ""
		if valid {
			for _, e := range parsed.Errors {
				if strings.Contains(e, "missing required field") ||
					strings.Contains(e, "Failed to read") ||
					strings.Contains(e, "was not closed") {
					valid = false
					break
				}
			}
		}

		regEntry, _ := reg.Get(displayName)

		results = append(results, models.SkillInfo{
			Name:           displayName,
			Description:    parsed.Description,
			Path:           skillDir,
			Valid:          valid,
			Errors:         errs,
			Frontmatter:    parsed.Frontmatter,
			BodyPreview:    parsed.BodyPreview,
			Origin:         regEntry.Origin,
			Hidden:         regEntry.Hidden,
			Frozen:         regEntry.Frozen,
			ImportedFrom:   regEntry.ImportedFrom,
			ImportedAtUnix: regEntry.ImportedAtUnix,
		})
		seen[displayName] = true
	}

	// Prune registry entries for skills that no longer exist on disk.
	if reg.PruneMissing(seen) > 0 {
		_ = registry.Save(root, reg)
	}

	sort.Slice(results, func(i, j int) bool {
		return strings.ToLower(results[i].Name) < strings.ToLower(results[j].Name)
	})
	return results, nil
}

// ImportSkillFolder copies an external skill directory into `root`, using the
// frontmatter `name` as the target folder name. Existing targets are never
// overwritten.
func ImportSkillFolder(source string, root string) (models.SkillInfo, error) {
	var zero models.SkillInfo

	srcInfo, err := os.Stat(source)
	if err != nil || !srcInfo.IsDir() {
		return zero, fmt.Errorf("source is not a directory: %s", source)
	}
	rootInfo, err := os.Stat(root)
	if err != nil || !rootInfo.IsDir() {
		return zero, fmt.Errorf("shared skill root does not exist: %s", root)
	}

	skillMd := filepath.Join(source, "SKILL.md")
	if st, err := os.Stat(skillMd); err != nil || st.IsDir() {
		return zero, fmt.Errorf("source folder does not contain SKILL.md: %s", source)
	}

	parsed, _ := ParseSkillMarkdown(skillMd)
	if parsed.Name == "" {
		return zero, fmt.Errorf("SKILL.md is missing required frontmatter field: name")
	}

	targetDir := filepath.Join(root, parsed.Name)
	if _, err := os.Lstat(targetDir); err == nil {
		return zero, fmt.Errorf(
			"target already exists at %s. Remove it manually or rename the skill.",
			targetDir,
		)
	} else if !os.IsNotExist(err) {
		return zero, fmt.Errorf("failed to stat target %s: %v", targetDir, err)
	}

	if err := copyDirectory(source, targetDir); err != nil {
		return zero, fmt.Errorf("failed to copy skill: %v", err)
	}

	scanned, _ := ScanSkills(root)
	for _, s := range scanned {
		if s.Path == targetDir {
			return s, nil
		}
	}
	return zero, fmt.Errorf("imported folder could not be scanned back: %s", targetDir)
}

func copyDirectory(src, dest string) error {
	if err := os.MkdirAll(dest, 0o755); err != nil {
		return err
	}
	entries, err := os.ReadDir(src)
	if err != nil {
		return err
	}
	for _, entry := range entries {
		// Never copy `.git` — importing an external skill must not drag a
		// sibling Git history into the shared skill repo.
		if entry.Name() == ".git" {
			continue
		}
		srcPath := filepath.Join(src, entry.Name())
		destPath := filepath.Join(dest, entry.Name())
		info, err := entry.Info()
		if err != nil {
			return err
		}
		switch {
		case entry.IsDir():
			if err := copyDirectory(srcPath, destPath); err != nil {
				return err
			}
		case info.Mode().IsRegular():
			if err := copyFile(srcPath, destPath); err != nil {
				return err
			}
		default:
			// Skip symlinks, sockets, pipes — only plain files belong in a skill.
		}
	}
	return nil
}

func copyFile(src, dest string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	out, err := os.Create(dest)
	if err != nil {
		return err
	}
	defer out.Close()
	if _, err := io.Copy(out, in); err != nil {
		return err
	}
	return nil
}

// ImportFromCli copies a real skill directory that currently lives inside
// a CLI tool's skills folder into the shared root, and records its origin
// in the registry. The CLI-side copy is NOT modified — the caller can
// decide whether to delete it and reroute via a junction.
//
// `origin` must be "owned" or "vendored"; any other value is normalized
// to "vendored" on the assumption that skills pre-existing in a CLI dir
// most often came from somewhere external.
func ImportFromCli(toolName string, cliSkillName string, sharedRoot string, origin models.SkillOrigin) (models.SkillInfo, error) {
	var zero models.SkillInfo
	if cliSkillName == "" {
		return zero, fmt.Errorf("CLI skill name must not be empty")
	}
	if sharedRoot == "" {
		return zero, fmt.Errorf("shared root must not be empty")
	}
	rootInfo, err := os.Stat(sharedRoot)
	if err != nil || !rootInfo.IsDir() {
		return zero, fmt.Errorf("shared skill root does not exist: %s", sharedRoot)
	}

	cliDir, err := synctargets.GetTargetDir(toolName)
	if err != nil {
		return zero, err
	}
	source := filepath.Join(cliDir, cliSkillName)

	// Only import real directories. A junction already implies the skill
	// is managed from the shared root, so importing would be a duplicate.
	if symlinkwindows.IsLinkPath(source) {
		return zero, fmt.Errorf(
			"%s is a junction/symlink, not a standalone skill. Nothing to import.",
			source,
		)
	}
	if st, err := os.Stat(source); err != nil || !st.IsDir() {
		return zero, fmt.Errorf("CLI skill source is not a directory: %s", source)
	}

	skillMd := filepath.Join(source, "SKILL.md")
	if st, err := os.Stat(skillMd); err != nil || st.IsDir() {
		return zero, fmt.Errorf("CLI skill folder does not contain SKILL.md: %s", source)
	}

	parsed, _ := ParseSkillMarkdown(skillMd)
	targetName := parsed.Name
	if targetName == "" {
		// Fall back to the folder name if frontmatter is incomplete.
		targetName = cliSkillName
	}

	targetDir := filepath.Join(sharedRoot, targetName)
	if _, err := os.Lstat(targetDir); err == nil {
		return zero, fmt.Errorf(
			"target already exists at %s. Rename the CLI skill or remove the existing entry before importing.",
			targetDir,
		)
	} else if !os.IsNotExist(err) {
		return zero, fmt.Errorf("failed to stat target %s: %v", targetDir, err)
	}

	if err := copyDirectory(source, targetDir); err != nil {
		return zero, fmt.Errorf("failed to copy skill: %v", err)
	}

	// Normalize origin. Empty / unknown values become vendored because the
	// skill came from outside the shared root.
	switch origin {
	case models.SkillOriginOwned, models.SkillOriginVendored:
		// ok
	default:
		origin = models.SkillOriginVendored
	}

	reg, _ := registry.Load(sharedRoot)
	reg.Set(targetName, registry.Entry{
		Origin:         origin,
		ImportedFrom:   source,
		ImportedAtUnix: time.Now().Unix(),
	})
	if err := registry.Save(sharedRoot, reg); err != nil {
		// Don't roll back the copy — the skill is on disk and valid. Just
		// surface the registry write error so the UI can tell the user the
		// metadata didn't persist.
		return zero, fmt.Errorf("skill copied but registry write failed: %v", err)
	}

	scanned, _ := ScanSkills(sharedRoot)
	for _, s := range scanned {
		if s.Path == targetDir {
			return s, nil
		}
	}
	return zero, fmt.Errorf("imported folder could not be scanned back: %s", targetDir)
}
