//go:build !windows

package symlinkwindows

func hasReparsePoint(path string) bool {
	return false
}
