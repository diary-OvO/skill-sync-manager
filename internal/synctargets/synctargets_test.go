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
	status, err := CheckSyncStatus(skill, "hermes")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if status.State != models.SyncStateUnsupported {
		t.Errorf("expected unsupported, got %q", status.State)
	}
}

func TestTargetDirsUseConfiguredToolPaths(t *testing.T) {
	fakeHome := t.TempDir()
	t.Setenv("USERPROFILE", fakeHome)
	t.Setenv("HOME", fakeHome)

	cases := map[string]string{
		"claude":   filepath.Join(fakeHome, ".claude", "skills"),
		"codex":    filepath.Join(fakeHome, ".codex", "skills"),
		"gemini":   filepath.Join(fakeHome, ".gemini", "skills"),
		"opencode": filepath.Join(fakeHome, ".config", "opencode", "skills"),
	}
	for tool, want := range cases {
		got, err := GetTargetDir(tool)
		if err != nil {
			t.Fatalf("%s target dir: %v", tool, err)
		}
		if got != want {
			t.Errorf("%s target dir = %q, want %q", tool, got, want)
		}
	}
}

func TestGeminiAndOpenCodeAreSupported(t *testing.T) {
	for _, tool := range []string{"gemini", "opencode"} {
		if !models.IsSupportedTool(tool) {
			t.Fatalf("%s should be supported", tool)
		}
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

func TestVendoredSourceRealDirectoryIsSynced(t *testing.T) {
	if runtime.GOOS != "windows" {
		t.Skip("junction checks are Windows-only")
	}

	fakeHome := t.TempDir()
	t.Setenv("USERPROFILE", fakeHome)
	t.Setenv("HOME", fakeHome)

	source := filepath.Join(fakeHome, ".claude", "skills", "downloaded")
	if err := os.MkdirAll(source, 0o755); err != nil {
		t.Fatal(err)
	}
	skill := models.SkillInfo{
		Name:         "downloaded",
		Description:  "downloaded",
		Path:         filepath.Join(t.TempDir(), "downloaded"),
		Valid:        true,
		Origin:       models.SkillOriginVendored,
		ImportedFrom: source,
	}

	status, err := CheckSyncStatus(skill, "claude")
	if err != nil {
		t.Fatalf("CheckSyncStatus returned error: %v", err)
	}
	if status.State != models.SyncStateSynced {
		t.Fatalf("expected vendored source to be synced, got %q: %s", status.State, status.Message)
	}
}
