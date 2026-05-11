package synctargets

import (
	"os"
	"path/filepath"
	"runtime"
	"testing"

	"skill-sync-manager/internal/models"
)

func TestUnsupportedTool(t *testing.T) {
	skill := models.SkillInfo{Name: "x", Valid: true}
	status, err := CheckSyncStatus(skill, "gemini")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if status.State != models.SyncStateUnsupported {
		t.Errorf("expected unsupported, got %q", status.State)
	}
}

func TestInvalidSkill(t *testing.T) {
	skill := models.SkillInfo{
		Name:   "broken",
		Valid:  false,
		Errors: []string{"missing name"},
	}
	status, err := CheckSyncStatus(skill, "claude")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if status.State != models.SyncStateInvalid {
		t.Errorf("expected invalid, got %q", status.State)
	}
}

// TestConflictDoesNotOverwrite simulates a real directory at the target
// location and confirms Sync returns `conflict` without touching it.
// Windows-only, because it exercises junction handling.
func TestConflictDoesNotOverwrite(t *testing.T) {
	if runtime.GOOS != "windows" {
		t.Skip("junction checks are Windows-only")
	}

	sharedRoot := t.TempDir()
	skillDir := filepath.Join(sharedRoot, "demo-skill")
	if err := os.MkdirAll(skillDir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(
		filepath.Join(skillDir, "SKILL.md"),
		[]byte("---\nname: demo-skill\ndescription: demo.\n---\nBody"),
		0o644,
	); err != nil {
		t.Fatal(err)
	}

	fakeHome := t.TempDir()
	t.Setenv("USERPROFILE", fakeHome)
	t.Setenv("HOME", fakeHome)

	// Pre-create a real directory at the would-be sync target.
	target := filepath.Join(fakeHome, ".claude", "skills", "demo-skill")
	if err := os.MkdirAll(target, 0o755); err != nil {
		t.Fatal(err)
	}
	sentinel := filepath.Join(target, "marker.txt")
	if err := os.WriteFile(sentinel, []byte("do not overwrite"), 0o644); err != nil {
		t.Fatal(err)
	}

	skill := models.SkillInfo{
		Name:        "demo-skill",
		Description: "demo.",
		Path:        skillDir,
		Valid:       true,
	}
	result, err := SyncSkillToTool(skill, "claude")
	if err != nil {
		t.Fatalf("Sync returned error: %v", err)
	}
	if result.State != models.SyncStateConflict {
		t.Fatalf("expected conflict, got %q (msg=%s)", result.State, result.Message)
	}

	// Sentinel must still be present — conflict means "do not touch".
	if _, err := os.Stat(sentinel); err != nil {
		t.Fatalf("sentinel file was unexpectedly removed: %v", err)
	}
}
