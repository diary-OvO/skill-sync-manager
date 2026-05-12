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

// 确保扫描忽略 .git / .idea 这类点前缀目录，
// 以及那些没有 SKILL.md、在共享根也没同名的"非 skill"目录（例如 design）。
func TestSkipDotDirsAndNonSkillFolders(t *testing.T) {
	shared := t.TempDir()
	fakeHome := t.TempDir()
	t.Setenv("USERPROFILE", fakeHome)
	t.Setenv("HOME", fakeHome)

	cliDir := filepath.Join(fakeHome, ".claude", "skills")
	if err := os.MkdirAll(cliDir, 0o755); err != nil {
		t.Fatal(err)
	}

	// .git / .idea / .system —— 名字以点开头，直接跳过。
	for _, dot := range []string{".git", ".idea", ".system"} {
		if err := os.MkdirAll(filepath.Join(cliDir, dot), 0o755); err != nil {
			t.Fatal(err)
		}
	}

	// design —— 一个没有 SKILL.md、也不在共享根的普通目录；
	// 之前版本会把它报成 external，新逻辑应该过滤掉。
	if err := os.MkdirAll(filepath.Join(cliDir, "design"), 0o755); err != nil {
		t.Fatal(err)
	}

	// real-skill —— 带 SKILL.md 的正常目录，必须出现在结果里。
	makeSkill(t, cliDir, "real-skill")

	out, err := ScanCliSkills("claude", shared)
	if err != nil {
		t.Fatalf("scan: %v", err)
	}
	if len(out) != 1 {
		names := []string{}
		for _, e := range out {
			names = append(names, e.SkillName)
		}
		t.Fatalf("expected exactly 1 entry, got %d: %v", len(out), names)
	}
	if out[0].SkillName != "real-skill" {
		t.Errorf("expected real-skill, got %q", out[0].SkillName)
	}
	if out[0].Kind != models.CliSkillKindExternal {
		t.Errorf("expected external, got %q", out[0].Kind)
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
