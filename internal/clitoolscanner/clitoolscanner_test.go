package clitoolscanner

import (
	"os"
	"path/filepath"
	"runtime"
	"testing"

	"skill-sync-manager/internal/models"
)

func makeSkill(t *testing.T, dir, name string) string {
	t.Helper()
	d := filepath.Join(dir, name)
	if err := os.MkdirAll(d, 0o755); err != nil {
		t.Fatal(err)
	}
	content := "---\nname: " + name + "\ndescription: A test skill.\n---\nBody"
	if err := os.WriteFile(filepath.Join(d, "SKILL.md"), []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
	return d
}

func TestExternalAndShadowing(t *testing.T) {
	shared := t.TempDir()
	fakeHome := t.TempDir()
	t.Setenv("USERPROFILE", fakeHome)
	t.Setenv("HOME", fakeHome)

	// Shared-root skill named "present". CLI also has a real dir "present"
	// → shadowing. CLI also has "extern" with no match → external.
	makeSkill(t, shared, "present")

	cliDir := filepath.Join(fakeHome, ".claude", "skills")
	makeSkill(t, cliDir, "present")
	makeSkill(t, cliDir, "extern")

	out, err := ScanCliSkills("claude", shared)
	if err != nil {
		t.Fatalf("scan: %v", err)
	}
	kinds := map[string]models.CliSkillKind{}
	for _, e := range out {
		kinds[e.SkillName] = e.Kind
	}
	if kinds["present"] != models.CliSkillKindShadowing {
		t.Errorf("expected present=shadowing, got %q", kinds["present"])
	}
	if kinds["extern"] != models.CliSkillKindExternal {
		t.Errorf("expected extern=external, got %q", kinds["extern"])
	}
}

func TestMissingCliDirIsEmpty(t *testing.T) {
	shared := t.TempDir()
	fakeHome := t.TempDir()
	t.Setenv("USERPROFILE", fakeHome)
	t.Setenv("HOME", fakeHome)
	// Do not create ~/.claude/skills — scan should just return empty.
	out, err := ScanCliSkills("claude", shared)
	if err != nil {
		t.Fatalf("scan: %v", err)
	}
	if len(out) != 0 {
		t.Errorf("expected empty scan, got %d entries", len(out))
	}
}

func TestManagedAndStrayOnWindows(t *testing.T) {
	if runtime.GOOS != "windows" {
		t.Skip("junctions are Windows-only")
	}
	shared := t.TempDir()
	fakeHome := t.TempDir()
	t.Setenv("USERPROFILE", fakeHome)
	t.Setenv("HOME", fakeHome)

	sharedSkill := makeSkill(t, shared, "linked")
	cliDir := filepath.Join(fakeHome, ".claude", "skills")
	if err := os.MkdirAll(cliDir, 0o755); err != nil {
		t.Fatal(err)
	}

	// Create a junction: ~/.claude/skills/linked -> sharedSkill
	link := filepath.Join(cliDir, "linked")
	if err := mklinkJunction(link, sharedSkill); err != nil {
		t.Skipf("could not create junction (permissions?): %v", err)
	}

	// Create a stray junction pointing somewhere else.
	stray := filepath.Join(cliDir, "stray")
	straySrc := t.TempDir()
	if err := mklinkJunction(stray, straySrc); err != nil {
		t.Skipf("could not create junction: %v", err)
	}

	out, err := ScanCliSkills("claude", shared)
	if err != nil {
		t.Fatal(err)
	}
	kinds := map[string]models.CliSkillKind{}
	targets := map[string]string{}
	for _, e := range out {
		kinds[e.SkillName] = e.Kind
		targets[e.SkillName] = e.LinkTarget
	}
	if kinds["linked"] != models.CliSkillKindManaged {
		t.Errorf("expected linked=managed, got %q (target=%q, shared-skill=%q)",
			kinds["linked"], targets["linked"], sharedSkill)
	}
	if kinds["stray"] != models.CliSkillKindStrayLink {
		t.Errorf("expected stray=stray-link, got %q", kinds["stray"])
	}
}

// mklinkJunction creates a junction via cmd /C mklink /J, matching what
// the symlinkwindows package does in production.
func mklinkJunction(link, target string) error {
	return runMklink(link, target)
}
