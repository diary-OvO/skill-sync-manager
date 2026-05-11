// Package clitoolscanner inspects a CLI tool's skills directory (for
// example %USERPROFILE%\.claude\skills) and classifies every top-level
// entry relative to the user's shared skill root. It is strictly
// read-only: no files are created, moved, or deleted here.
package clitoolscanner

import (
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"skill-sync-manager/internal/models"
	"skill-sync-manager/internal/symlinkwindows"
	"skill-sync-manager/internal/synctargets"
)

// ScanCliSkills enumerates the skills directory for `toolName` and
// classifies each entry. A non-existent CLI directory is not an error —
// we just return an empty slice.
func ScanCliSkills(toolName string, sharedRoot string) ([]models.CliSkillEntry, error) {
	dir, err := synctargets.GetTargetDir(toolName)
	if err != nil {
		return nil, err
	}
	info, err := os.Stat(dir)
	if err != nil {
		if os.IsNotExist(err) {
			return []models.CliSkillEntry{}, nil
		}
		return nil, err
	}
	if !info.IsDir() {
		return nil, fmt.Errorf("CLI skills path %s is not a directory", dir)
	}

	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, err
	}

	sharedSkillNames := listSharedRootSkills(sharedRoot)

	out := make([]models.CliSkillEntry, 0, len(entries))
	for _, entry := range entries {
		full := filepath.Join(dir, entry.Name())
		// Inspect with Lstat on the full path — DirEntry.IsDir and .Info
		// can misreport NTFS junctions across Go/Windows versions.
		st, err := os.Lstat(full)
		if err != nil {
			continue
		}
		isLink := symlinkwindows.IsLinkPath(full)
		if !isLink && !st.IsDir() {
			// Skip stray files that aren't skills.
			continue
		}

		item := models.CliSkillEntry{
			ToolName:  toolName,
			SkillName: entry.Name(),
			Path:      full,
			IsLink:    isLink,
		}

		// Does a matching shared-root skill exist?
		sharedPath, sharedExists := sharedSkillNames[entry.Name()]
		if sharedExists {
			item.SharedRootPath = sharedPath
		}

		if isLink {
			if resolved, err := symlinkwindows.ResolveRealPath(full); err == nil {
				item.LinkTarget = resolved
				if sharedExists && samePath(resolved, sharedPath) {
					item.Kind = models.CliSkillKindManaged
				} else {
					item.Kind = models.CliSkillKindStrayLink
				}
			} else {
				// Could not resolve; treat as stray so the UI doesn't mis-trust it.
				item.Kind = models.CliSkillKindStrayLink
			}
		} else {
			// Real directory.
			skillMd := filepath.Join(full, "SKILL.md")
			if st, err := os.Stat(skillMd); err == nil && !st.IsDir() {
				item.HasSkillMd = true
			}
			if sharedExists {
				item.Kind = models.CliSkillKindShadowing
			} else {
				item.Kind = models.CliSkillKindExternal
			}
		}
		out = append(out, item)
	}

	sort.Slice(out, func(i, j int) bool {
		return strings.ToLower(out[i].SkillName) < strings.ToLower(out[j].SkillName)
	})
	return out, nil
}

func listSharedRootSkills(sharedRoot string) map[string]string {
	m := map[string]string{}
	if sharedRoot == "" {
		return m
	}
	entries, err := os.ReadDir(sharedRoot)
	if err != nil {
		return m
	}
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		full := filepath.Join(sharedRoot, e.Name())
		skillMd := filepath.Join(full, "SKILL.md")
		if st, err := os.Stat(skillMd); err == nil && !st.IsDir() {
			m[e.Name()] = full
		}
	}
	return m
}

func samePath(a, b string) bool {
	absA, errA := filepath.Abs(a)
	absB, errB := filepath.Abs(b)
	if errA != nil || errB != nil {
		return strings.EqualFold(a, b)
	}
	cleanA := filepath.Clean(absA)
	cleanB := filepath.Clean(absB)
	if strings.EqualFold(cleanA, cleanB) {
		return true
	}
	// Also compare after resolving both paths through the filesystem.
	// This handles Windows 8.3 short-name vs long-name differences and
	// paths that pass through symlinked parents (e.g. %TEMP% on some
	// configurations maps to a different canonical path).
	resA, errA := filepath.EvalSymlinks(absA)
	resB, errB := filepath.EvalSymlinks(absB)
	if errA == nil && errB == nil {
		return strings.EqualFold(filepath.Clean(resA), filepath.Clean(resB))
	}
	return false
}
