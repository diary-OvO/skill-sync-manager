// Package clitoolscanner 负责扫描某个 CLI 工具的 skills 目录
// （例如 %USERPROFILE%\.claude\skills），并相对用户的共享 skill 根目录
// 对其中的每一个顶层条目进行分类。
// 本包是严格只读的：不会创建、移动或删除任何文件。
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

// ScanCliSkills 枚举 toolName 对应的 skills 目录并对每一项分类。
// 目录不存在不算错误，会返回空切片。
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
		// 用完整路径调用 Lstat：不同 Go / Windows 版本下，
		// DirEntry.IsDir 与 .Info 对 NTFS junction 的判定会不一致。
		st, err := os.Lstat(full)
		if err != nil {
			continue
		}
		isLink := symlinkwindows.IsLinkPath(full)
		if !isLink && !st.IsDir() {
			// 非 skill 的零散文件直接跳过。
			continue
		}

		item := models.CliSkillEntry{
			ToolName:  toolName,
			SkillName: entry.Name(),
			Path:      full,
			IsLink:    isLink,
		}

		// 共享根下是否存在同名 skill。
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
				// 无法解析时，按 stray-link 处理，避免 UI 误以为受托管。
				item.Kind = models.CliSkillKindStrayLink
			}
		} else {
			// 真实目录。
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

// listSharedRootSkills 返回共享根下所有 "带 SKILL.md 的子目录" 名称到完整路径的映射，
// 便于按名称快速判断 CLI 目录中的条目是否对应共享根下的 skill。
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

// samePath 判断两个路径是否指向同一个目标。
// 先做大小写不敏感的字面量比较；再通过 EvalSymlinks 解析真实路径对比，
// 以覆盖 Windows 短名 / 长名、父级是符号链接等差异场景。
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
	resA, errA := filepath.EvalSymlinks(absA)
	resB, errB := filepath.EvalSymlinks(absB)
	if errA == nil && errB == nil {
		return strings.EqualFold(filepath.Clean(resA), filepath.Clean(resB))
	}
	return false
}
