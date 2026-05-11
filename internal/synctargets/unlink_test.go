package synctargets

import (
	"os"
	"path/filepath"
	"runtime"
	"testing"

	"skill-sync-manager/internal/models"
)

func TestUnlinkRefusesRealDirectory(t *testing.T) {
	fakeHome := t.TempDir()
	t.Setenv("USERPROFILE", fakeHome)
	t.Setenv("HOME", fakeHome)

	target := filepath.Join(fakeHome, ".claude", "skills", "realdir")
	if err := os.MkdirAll(target, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := UnlinkSkillFromTool("claude", "realdir"); err == nil {
		t.Fatal("expected error, got nil")
	}
	// Directory must still exist.
	if _, err := os.Stat(target); err != nil {
		t.Fatalf("real directory was touched: %v", err)
	}
}

func TestUnlinkMissingIsNoOp(t *testing.T) {
	fakeHome := t.TempDir()
	t.Setenv("USERPROFILE", fakeHome)
	t.Setenv("HOME", fakeHome)
	if err := UnlinkSkillFromTool("claude", "never-existed"); err != nil {
		t.Fatalf("expected nil, got %v", err)
	}
}

func TestUnlinkRemovesJunctionOnWindows(t *testing.T) {
	if runtime.GOOS != "windows" {
		t.Skip("junctions are Windows-only")
	}
	shared := t.TempDir()
	skillDir := filepath.Join(shared, "junction-skill")
	if err := os.MkdirAll(skillDir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(
		filepath.Join(skillDir, "SKILL.md"),
		[]byte("---\nname: junction-skill\ndescription: demo.\n---\nBody"),
		0o644,
	); err != nil {
		t.Fatal(err)
	}

	fakeHome := t.TempDir()
	t.Setenv("USERPROFILE", fakeHome)
	t.Setenv("HOME", fakeHome)

	skill := models.SkillInfo{
		Name:        "junction-skill",
		Description: "demo.",
		Path:        skillDir,
		Valid:       true,
	}
	if _, err := SyncSkillToTool(skill, "claude"); err != nil {
		t.Fatalf("sync: %v", err)
	}

	linkPath := filepath.Join(fakeHome, ".claude", "skills", "junction-skill")
	if _, err := os.Lstat(linkPath); err != nil {
		t.Fatalf("junction was not created: %v", err)
	}
	if err := UnlinkSkillFromTool("claude", "junction-skill"); err != nil {
		t.Fatalf("unlink: %v", err)
	}
	if _, err := os.Lstat(linkPath); !os.IsNotExist(err) {
		t.Fatalf("expected link to be removed, stat err=%v", err)
	}
	// Shared skill must still exist.
	if _, err := os.Stat(skillDir); err != nil {
		t.Fatalf("shared skill dir was wrongly touched: %v", err)
	}
}
