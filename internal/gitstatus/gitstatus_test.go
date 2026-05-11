package gitstatus

import (
	"os"
	"path/filepath"
	"testing"
)

func TestNonGitDirectoryDoesNotCrash(t *testing.T) {
	root := t.TempDir()
	plain := filepath.Join(root, "plain")
	if err := os.MkdirAll(plain, 0o755); err != nil {
		t.Fatal(err)
	}
	status := GetGitStatus(plain)
	if status.IsRepo {
		t.Errorf("expected IsRepo=false for plain directory")
	}
	if status.Remotes == nil {
		t.Errorf("Remotes must not be nil")
	}
}

func TestEmptyRoot(t *testing.T) {
	status := GetGitStatus("")
	if status.IsRepo || status.HasRemote {
		t.Errorf("expected false flags for empty root")
	}
	if status.Branch != nil {
		t.Errorf("expected Branch=nil for empty root")
	}
}

func TestMissingPath(t *testing.T) {
	root := t.TempDir()
	missing := filepath.Join(root, "does-not-exist")
	status := GetGitStatus(missing)
	if status.IsRepo {
		t.Errorf("expected IsRepo=false for missing path")
	}
	if status.HasRemote {
		t.Errorf("expected HasRemote=false for missing path")
	}
	if status.Branch != nil {
		t.Errorf("expected Branch=nil for missing path")
	}
	if status.Dirty {
		t.Errorf("expected Dirty=false for missing path")
	}
}
