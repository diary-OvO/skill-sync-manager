package clitoolscanner

import "os/exec"

// runMklink is a test-only helper so Windows-only tests can create a
// real NTFS directory junction.
func runMklink(link, target string) error {
	return exec.Command("cmd", "/C", "mklink", "/J", link, target).Run()
}
