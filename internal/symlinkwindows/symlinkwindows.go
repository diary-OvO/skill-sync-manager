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
// On Windows, Go's treatment of NTFS directory junctions has changed
// across versions. We try three signals in order:
//  1. Lstat mode bits (ModeSymlink and/or ModeIrregular/reparse bits).
//  2. os.Readlink success — a plain directory returns an error.
//  3. EvalSymlinks difference — resolved path differs from the input.
//
// Any single positive signal is enough.
func IsLinkPath(p string) bool {
	st, err := os.Lstat(p)
	if err != nil {
		return false
	}
	if st.Mode()&os.ModeSymlink != 0 {
		return true
	}
	// On some Go/Windows combinations, junctions come back as regular
	// directories from Lstat. Readlink, however, will succeed for a
	// junction and return its target; for a plain directory it errors.
	if _, err := os.Readlink(p); err == nil {
		return true
	}
	// Last-resort probe.
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
//
// On Windows, Go's filepath.EvalSymlinks sometimes does not traverse
// directory junctions cleanly (it may return the link path itself). We
// therefore try os.Readlink first when the entry is a link — that
// reads the NTFS reparse point directly and returns the raw target.
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
