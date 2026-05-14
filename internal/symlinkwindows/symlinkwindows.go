package symlinkwindows

import (
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"

	"skill-sync-manager/internal/proc"
)

// windowsJunctionHint 在创建 junction 失败时附加给用户，给出常见的排查思路。
const windowsJunctionHint = "Creating a directory junction on Windows can fail without sufficient permissions. " +
	"Try enabling Developer Mode in Windows Settings, re-run Skill Sync Manager as administrator, " +
	"or verify the target path exists on an NTFS volume."

// IsWindows 判断当前进程是否运行在 Windows 平台。
func IsWindows() bool {
	return runtime.GOOS == "windows"
}

// PathExists 判断路径 p 上是否存在任何实体（文件 / 目录 / 链接）。
func PathExists(p string) bool {
	_, err := os.Lstat(p)
	return err == nil
}

// IsLinkPath 判断 p 是否为符号链接或目录 junction。
// Windows 下不能用 EvalSymlinks(abs) != abs 做兜底：CI 路径中的 8.3
// 短路径与长路径规范化差异会让普通目录也看起来"解析后不同"。
// 因此这里只信任明确的 symlink mode、Readlink 成功或 reparse point 属性。
func IsLinkPath(p string) bool {
	st, err := os.Lstat(p)
	if err != nil {
		return false
	}
	if st.Mode()&os.ModeSymlink != 0 {
		return true
	}
	if hasReparsePoint(p) {
		return true
	}
	// 在部分 Go / Windows 组合下，junction 在 Lstat 里表现为普通目录，
	// 但 Readlink 仍能读到 NTFS 反解点并返回目标；普通目录会返回错误。
	if _, err := os.Readlink(p); err == nil {
		return true
	}
	return false
}

// ResolveRealPath 返回 junction / 符号链接所指向的真实绝对路径；
// 若 p 是普通目录，则返回它自己的绝对路径。
//
// 在 Windows 下，Go 的 filepath.EvalSymlinks 对目录 junction 的处理并不总是
// 可靠（有时直接返回链接自身）。因此对链接类型优先使用 os.Readlink，
// 它会直接读取 NTFS 反解点的原始目标。
func ResolveRealPath(p string) (string, error) {
	abs, err := filepath.Abs(p)
	if err != nil {
		return "", err
	}
	if IsLinkPath(abs) {
		if target, err := os.Readlink(abs); err == nil && target != "" {
			if !filepath.IsAbs(target) {
				target = filepath.Join(filepath.Dir(abs), target)
			}
			if t2, err := filepath.Abs(target); err == nil {
				return filepath.Clean(t2), nil
			}
			return filepath.Clean(target), nil
		}
	}
	resolved, err := filepath.EvalSymlinks(abs)
	if err != nil {
		return "", err
	}
	return filepath.Clean(resolved), nil
}

// CreateDirectoryJunction 在 linkPath 创建一个指向 targetPath 的 NTFS 目录 junction。
// 仅支持 Windows；绝不会覆盖已经存在的路径。
func CreateDirectoryJunction(linkPath string, targetPath string) error {
	if !IsWindows() {
		return fmt.Errorf(
			"windows directory junctions are only supported on Windows. Current platform: %s",
			runtime.GOOS,
		)
	}

	absTarget, err := filepath.Abs(targetPath)
	if err != nil {
		return fmt.Errorf("failed to resolve target path: %v", err)
	}
	absLink, err := filepath.Abs(linkPath)
	if err != nil {
		return fmt.Errorf("failed to resolve link path: %v", err)
	}

	// 目标必须存在且为目录。
	st, err := os.Stat(absTarget)
	if err != nil || !st.IsDir() {
		return fmt.Errorf("target directory does not exist: %s", absTarget)
	}

	if PathExists(absLink) {
		return fmt.Errorf(
			"link path already exists: %s. Skill Sync Manager will not overwrite existing paths.",
			absLink,
		)
	}

	if err := os.MkdirAll(filepath.Dir(absLink), 0o755); err != nil {
		return fmt.Errorf("failed to create parent directory for link: %v", err)
	}

	out, err := proc.RunCombined("proc:mklink", "", "cmd", "/C", "mklink", "/J", absLink, absTarget)
	if err != nil {
		return fmt.Errorf(
			"failed to create junction %s -> %s. %s Output: %s. %s",
			absLink, absTarget, err.Error(), strings.TrimSpace(out), windowsJunctionHint,
		)
	}
	// 再校验一次 mklink 的输出：确实生成了链接才返回成功。
	if !IsLinkPath(absLink) {
		return fmt.Errorf(
			"mklink appeared to succeed but %s does not look like a junction. %s",
			absLink, windowsJunctionHint,
		)
	}
	return nil
}
