package symlinkwindows

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
)

const windowsJunctionHint = "Creating a directory junction on Windows can fail without sufficient permissions. " +
	"Try enabling Developer Mode in Windows Settings, re-run Skill Sync Manager as administrator, " +
	"or verify the target path exists on an NTFS volume."

// IsWindows returns true when the current process is running on Windows.
func IsWindows() bool {
	return runtime.GOOS == "windows"
}

// PathExists returns true if something (file, dir, link) exists at p.
func PathExists(p string) bool {
	_, err := os.Lstat(p)
	return err == nil
}

// IsLinkPath reports whether p is a symlink or directory junction.
// Go >= 1.23 returns ModeSymlink for NTFS directory junctions on Windows.
// We also fall back to a conservative EvalSymlinks probe if Lstat says no
// but the resolved path differs from the literal path.
func IsLinkPath(p string) bool {
	st, err := os.Lstat(p)
	if err != nil {
		return false
	}
	if st.Mode()&os.ModeSymlink != 0 {
		return true
	}
	// Fallback probe: on older Go or unusual junctions, EvalSymlinks can still
	// expose a mismatch between link and target.
	abs, err := filepath.Abs(p)
	if err != nil {
		return false
	}
	resolved, err := filepath.EvalSymlinks(abs)
	if err != nil {
		return false
	}
	if strings.EqualFold(filepath.Clean(resolved), filepath.Clean(abs)) {
		return false
	}
	return true
}

// ResolveRealPath returns the absolute path a junction or symlink points to.
// For a plain directory, it returns the absolute path of that directory.
func ResolveRealPath(p string) (string, error) {
	abs, err := filepath.Abs(p)
	if err != nil {
		return "", err
	}
	resolved, err := filepath.EvalSymlinks(abs)
	if err != nil {
		return "", err
	}
	return filepath.Clean(resolved), nil
}

// CreateDirectoryJunction creates an NTFS directory junction at linkPath that
// points to targetPath. Windows-only. Never overwrites an existing path.
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

	// The target must exist and be a directory.
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

	cmd := exec.Command("cmd", "/C", "mklink", "/J", absLink, absTarget)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf(
			"failed to create junction %s -> %s. %s Output: %s. %s",
			absLink, absTarget, err.Error(), strings.TrimSpace(string(out)), windowsJunctionHint,
		)
	}
	// Sanity check that mklink actually produced a link.
	if !IsLinkPath(absLink) {
		return fmt.Errorf(
			"mklink appeared to succeed but %s does not look like a junction. %s",
			absLink, windowsJunctionHint,
		)
	}
	return nil
}
