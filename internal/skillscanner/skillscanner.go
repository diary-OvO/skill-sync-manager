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

// BodyPreviewLimit 控制 SKILL.md 正文预览的最大字符数。
const BodyPreviewLimit = 800

// ParsedSkillMarkdown 是 ParseSkillMarkdown 的结构化返回值。
type ParsedSkillMarkdown struct {
	Frontmatter map[string]string
	Body        string
	BodyPreview string
	Name        string
	Description string
	Errors      []string
}

// ParseSkillMarkdown 读取一份 SKILL.md，并返回其简易 `key: value` YAML
// frontmatter 与正文预览。
//
// 解析规则：
//  1. 仅当文件以 `---` 行起始时，才视为带 frontmatter；
//  2. frontmatter 在下一个 `---` 行处结束；
//  3. frontmatter 内仅识别 `key: value` 形式的行；
//  4. `name` 与 `description` 为必填，其余字段原样透传。
func ParseSkillMarkdown(skillMdPath string) (ParsedSkillMarkdown, error) {
	parsed := ParsedSkillMarkdown{
		Frontmatter: map[string]string{},
	}

	data, err := os.ReadFile(skillMdPath)
	if err != nil {
		parsed.Errors = append(parsed.Errors, fmt.Sprintf("Failed to read SKILL.md: %v", err))
		return parsed, nil
	}

	// 统一换行，Windows 下按 "\n" 切分才稳定。
	text := strings.ReplaceAll(string(data), "\r\n", "\n")

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
			// frontmatter 未被 `---` 闭合：整个文件当作正文，同时记录一条警告。
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

	parsed.Body = body
	trimmed := strings.TrimSpace(body)
	if len(trimmed) > BodyPreviewLimit {
		parsed.BodyPreview = trimmed[:BodyPreviewLimit]
	} else {
		parsed.BodyPreview = trimmed
	}

	return parsed, nil
}

// parseFrontmatterLines 将 frontmatter 区块按行写入 out。
// 只识别 `key: value` 形式；注释行（`#` 开头）与空行会被跳过。
func parseFrontmatterLines(block string, out map[string]string) {
	for _, rawLine := range strings.Split(block, "\n") {
		line := strings.TrimRight(rawLine, " \t\r")
		if line == "" {
			continue
		}
		if strings.HasPrefix(strings.TrimLeft(line, " \t"), "#") {
			continue
		}
		colon := strings.IndexByte(line, ':')
		if colon <= 0 {
			continue
		}
		key := strings.TrimSpace(line[:colon])
		if key == "" {
			continue
		}
		out[key] = stripSurroundingQuotes(strings.TrimSpace(line[colon+1:]))
	}
}

// stripSurroundingQuotes 移除字符串首尾成对的单/双引号。
func stripSurroundingQuotes(s string) string {
	if len(s) >= 2 {
		if (s[0] == '"' && s[len(s)-1] == '"') || (s[0] == '\'' && s[len(s)-1] == '\'') {
			return s[1 : len(s)-1]
		}
	}
	return s
}

// ScanSkills 遍历 root 的直接子目录，返回所有包含 SKILL.md 的项，
// 并合并注册表中的 origin / hidden / frozen 信息。
// `.skill-manager` 目录会被跳过。
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
		if !entry.IsDir() || entry.Name() == registry.DirName {
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

	// 清理注册表中已经不存在于磁盘上的 skill 条目。
	if reg.PruneMissing(seen) > 0 {
		_ = registry.Save(root, reg)
	}

	sort.Slice(results, func(i, j int) bool {
		return strings.ToLower(results[i].Name) < strings.ToLower(results[j].Name)
	})
	return results, nil
}

// ImportSkillFolder 将一个外部 skill 目录复制进 root，
// 目标子目录名使用 frontmatter 中的 `name`。已存在的目标不会被覆盖。
func ImportSkillFolder(source string, root string) (models.SkillInfo, error) {
	var zero models.SkillInfo

	if srcInfo, err := os.Stat(source); err != nil || !srcInfo.IsDir() {
		return zero, fmt.Errorf("source is not a directory: %s", source)
	}
	if rootInfo, err := os.Stat(root); err != nil || !rootInfo.IsDir() {
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
	if err := ensureTargetAbsent(targetDir, "Remove it manually or rename the skill."); err != nil {
		return zero, err
	}

	if err := copyDirectory(source, targetDir); err != nil {
		return zero, fmt.Errorf("failed to copy skill: %v", err)
	}

	return rescanSkill(root, targetDir)
}

// ensureTargetAbsent 确认目标路径不存在，便于"从不覆盖"的策略。
// hint 会追加到用户可见的错误信息后，提示后续操作。
func ensureTargetAbsent(targetDir, hint string) error {
	_, err := os.Lstat(targetDir)
	if err == nil {
		return fmt.Errorf("target already exists at %s. %s", targetDir, hint)
	}
	if !os.IsNotExist(err) {
		return fmt.Errorf("failed to stat target %s: %v", targetDir, err)
	}
	return nil
}

// rescanSkill 在 root 下重新扫描，返回与 targetDir 对应的那条 SkillInfo。
// 用于导入成功后把最新状态回传给前端。
func rescanSkill(root, targetDir string) (models.SkillInfo, error) {
	scanned, _ := ScanSkills(root)
	for _, s := range scanned {
		if s.Path == targetDir {
			return s, nil
		}
	}
	return models.SkillInfo{}, fmt.Errorf("imported folder could not be scanned back: %s", targetDir)
}

// copyDirectory 递归复制目录，但会跳过 `.git` 与符号链接等非常规文件。
func copyDirectory(src, dest string) error {
	if err := os.MkdirAll(dest, 0o755); err != nil {
		return err
	}
	entries, err := os.ReadDir(src)
	if err != nil {
		return err
	}
	for _, entry := range entries {
		// 永远不复制 `.git`：导入外部 skill 不应把它的 git 历史带进来。
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
			// 其它类型（符号链接、管道、套接字等）不属于 skill 内容，直接跳过。
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
	_, err = io.Copy(out, in)
	return err
}

// ImportFromCli 把某个 CLI 工具（例如 Claude / Codex / Gemini / OpenCode）skills 目录下
// 已经存在的真实 skill 目录复制进共享根，并在注册表中记录其来源。
// CLI 原始目录不会被动到，是否删除并改用 junction 由调用方决定。
//
// `origin` 必须为 "owned" 或 "vendored"；其它值都会被规范为 "vendored"
// ——CLI 目录中原本存在的 skill 更可能是从外部引入的。
func ImportFromCli(toolName string, cliSkillName string, sharedRoot string, origin models.SkillOrigin) (models.SkillInfo, error) {
	var zero models.SkillInfo
	if cliSkillName == "" {
		return zero, fmt.Errorf("CLI skill name must not be empty")
	}
	if sharedRoot == "" {
		return zero, fmt.Errorf("shared root must not be empty")
	}
	if rootInfo, err := os.Stat(sharedRoot); err != nil || !rootInfo.IsDir() {
		return zero, fmt.Errorf("shared skill root does not exist: %s", sharedRoot)
	}

	cliDir, err := synctargets.GetTargetDir(toolName)
	if err != nil {
		return zero, err
	}
	source := filepath.Join(cliDir, cliSkillName)

	// 只导入真实目录。若已是 junction，则说明该 skill 本就由共享根托管，
	// 再导入会造成重复。
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
		// frontmatter 不完整时退回用文件夹名。
		targetName = cliSkillName
	}

	targetDir := filepath.Join(sharedRoot, targetName)
	if err := ensureTargetAbsent(
		targetDir,
		"Rename the CLI skill or remove the existing entry before importing.",
	); err != nil {
		return zero, err
	}

	if err := copyDirectory(source, targetDir); err != nil {
		return zero, fmt.Errorf("failed to copy skill: %v", err)
	}

	// 规范化 origin。空值或未知值统一视为 vendored，因为这个 skill 来自共享根之外。
	switch origin {
	case models.SkillOriginOwned, models.SkillOriginVendored:
		// 合法值，保持不变
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
		// 不回滚已复制的文件：skill 已经落盘且合法。
		// 仅把注册表写入失败的信息抛给上层，让 UI 告知用户元数据未持久化。
		return zero, fmt.Errorf("skill copied but registry write failed: %v", err)
	}

	return rescanSkill(sharedRoot, targetDir)
}

// MigrateFromCli 把 CLI 工具目录下真实存在的 skill **迁移**进共享根：
//
//	共享根        <- 真身在这里
//	  └─ SkillX/  (真实目录, SKILL.md 等)
//	CLI/skills/
//	  └─ SkillX   (junction) ──→ 共享根/SkillX
//
// 语义与 ImportFromCli 的关键区别：
//  1. 导入完成后 CLI 原目录不再是真实目录，而是 junction，从此不再
//     产生 shadowing 冲突；CheckSyncStatus 会直接判为 Synced。
//  2. origin 固定为 "owned"——既然用户要把 skill 的"权威副本"纳入
//     共享根托管，该 skill 就是自建、可编辑的。
//
// 事务顺序与回滚：
//
//	step1  copy CLI 真实目录 -> 共享根/<name>
//	       失败: 清理可能产生的 共享根/<name> 残片, 直接返回
//	step2  rename CLI 原目录 -> CLI/.migrating-<name>
//	       失败: 删 step1 产物 (共享根/<name>), 返回
//	step3  在 CLI 原位置创建 junction -> 共享根/<name>
//	       失败: 删 step1 产物 + 把 .migrating-<name> 改回原名, 返回
//	step4  删 CLI/.migrating-<name>
//	       失败: 不回滚 (junction 已生效, 用户只是多一份 tmp),
//	            返回"迁移成功但需手动删 tmp"的软警告错误
//	step5  写 registry
//	       失败: 不回滚物理文件 (skill 已可用),
//	            返回"迁移成功但 registry 未写入"的软警告错误
//
// 这样任何前三步失败 CLI 原目录都一定还在原位、仍是真实目录，
// 用户不会因为一次迁移丢数据。
func MigrateFromCli(toolName string, cliSkillName string, sharedRoot string) (models.SkillInfo, error) {
	var zero models.SkillInfo
	if cliSkillName == "" {
		return zero, fmt.Errorf("CLI skill name must not be empty")
	}
	if sharedRoot == "" {
		return zero, fmt.Errorf("shared root must not be empty")
	}
	if rootInfo, err := os.Stat(sharedRoot); err != nil || !rootInfo.IsDir() {
		return zero, fmt.Errorf("shared skill root does not exist: %s", sharedRoot)
	}

	cliDir, err := synctargets.GetTargetDir(toolName)
	if err != nil {
		return zero, err
	}
	source := filepath.Join(cliDir, cliSkillName)

	// 只迁移真实目录。如果源已经是 junction 说明已经托管在共享根了，
	// 再迁移会破坏 junction 导致一个 skill 被指两次。
	if symlinkwindows.IsLinkPath(source) {
		return zero, fmt.Errorf(
			"%s is already a junction/symlink, nothing to migrate.",
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
		targetName = cliSkillName
	}
	targetDir := filepath.Join(sharedRoot, targetName)

	// 共享根侧必须是"干净的"。如果已经存在同名目录，直接拒绝 ——
	// 用户现在的问题恰恰就是"共享根里已有同名 skill 才 shadowing"，
	// 此时盲目覆盖会丢数据。让调用方先 UnlinkSkill / 人工合并。
	if err := ensureTargetAbsent(
		targetDir,
		"The shared root already has a skill with this name. Resolve the conflict before migrating.",
	); err != nil {
		return zero, err
	}

	// Windows 上没有 symlink 能力就连 junction 都建不了，直接劝退；
	// 避免"复制成功但没法建链接"这种半成品状态。
	if !symlinkwindows.IsWindows() {
		return zero, fmt.Errorf("migrate is only supported on Windows")
	}

	// ---- step1 复制 ----
	if err := copyDirectory(source, targetDir); err != nil {
		// copyDirectory 内部失败时大多不会自己清理半成品。
		_ = os.RemoveAll(targetDir)
		return zero, fmt.Errorf("failed to copy skill into shared root: %v", err)
	}

	// ---- step2 重命名原 CLI 目录为 .migrating-<name> ----
	tmpPath := filepath.Join(cliDir, ".migrating-"+cliSkillName)
	// 兜底：若残留同名 tmp（上次中断），先清掉再改名，避免 Rename 失败。
	_ = os.RemoveAll(tmpPath)
	if err := os.Rename(source, tmpPath); err != nil {
		_ = os.RemoveAll(targetDir)
		return zero, fmt.Errorf("failed to stage CLI source for migration: %v", err)
	}

	// ---- step3 在 CLI 原位置建 junction ----
	if err := symlinkwindows.CreateDirectoryJunction(source, targetDir); err != nil {
		// 回滚顺序：先撤 junction 可能的半成品（保险起见），
		// 再把 tmp 改回原名，最后删共享根的副本。
		_ = os.RemoveAll(source)
		if rnErr := os.Rename(tmpPath, source); rnErr != nil {
			// 极端情况：连 rename 都失败。这时 CLI 原目录处于 tmp 状态，
			// 共享根副本也还在。把两者信息都抛出去，让用户能手动恢复。
			return zero, fmt.Errorf(
				"failed to create junction (%v) AND failed to rollback CLI source (%v). "+
					"Manual fix: rename %s back to %s, then delete %s",
				err, rnErr, tmpPath, source, targetDir,
			)
		}
		_ = os.RemoveAll(targetDir)
		return zero, fmt.Errorf("failed to create junction: %v", err)
	}

	// ---- step4 删 .migrating-<name> ----
	// 这一步失败不回滚：junction 已经生效，功能可用，只是 tmp 残留。
	// 把警告编码进 err 抛给上层，UI 可以弹 toast 告知用户去手动删。
	var tmpCleanupWarning error
	if err := os.RemoveAll(tmpPath); err != nil {
		tmpCleanupWarning = fmt.Errorf(
			"migration succeeded but failed to remove staging folder %s: %v",
			tmpPath, err,
		)
	}

	// ---- step5 写 registry ----
	reg, _ := registry.Load(sharedRoot)
	reg.Set(targetName, registry.Entry{
		Origin:         models.SkillOriginOwned,
		ImportedFrom:   source,
		ImportedAtUnix: time.Now().Unix(),
	})
	if err := registry.Save(sharedRoot, reg); err != nil {
		// 同 ImportFromCli 的选择：物理状态已一致，只是元数据缺失。
		info, _ := rescanSkill(sharedRoot, targetDir)
		return info, fmt.Errorf("migrated but registry write failed: %v", err)
	}

	info, err := rescanSkill(sharedRoot, targetDir)
	if err != nil {
		return info, err
	}
	return info, tmpCleanupWarning
}
