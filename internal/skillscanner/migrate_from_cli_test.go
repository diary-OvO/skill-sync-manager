package skillscanner

import (
	"os"
	"path/filepath"
	"runtime"
	"testing"

	"skill-sync-manager/internal/models"
	"skill-sync-manager/internal/registry"
	"skill-sync-manager/internal/symlinkwindows"
)

// TestMigrateFromCliHappyPath 完整走一遍迁移，验证最终态。
// junction 依赖 Windows，所以本测只在 Windows 跑。
func TestMigrateFromCliHappyPath(t *testing.T) {
	if runtime.GOOS != "windows" {
		t.Skip("junctions are Windows-only")
	}
	shared := t.TempDir()
	fakeHome := t.TempDir()
	t.Setenv("USERPROFILE", fakeHome)
	t.Setenv("HOME", fakeHome)

	cliSkill := filepath.Join(fakeHome, ".claude", "skills", "my-owned")
	if err := os.MkdirAll(cliSkill, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(
		filepath.Join(cliSkill, "SKILL.md"),
		[]byte("---\nname: my-owned\ndescription: self-built.\n---\nHello"),
		0o644,
	); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(cliSkill, "extra.txt"), []byte("data"), 0o644); err != nil {
		t.Fatal(err)
	}

	skill, err := MigrateFromCli("claude", "my-owned", shared)
	if err != nil {
		t.Fatalf("migrate: %v", err)
	}
	if skill.Origin != models.SkillOriginOwned {
		t.Errorf("expected origin=owned, got %q", skill.Origin)
	}

	sharedPath := filepath.Join(shared, "my-owned")
	if st, err := os.Stat(sharedPath); err != nil || !st.IsDir() {
		t.Fatalf("shared copy missing: %v", err)
	}
	if _, err := os.Stat(filepath.Join(sharedPath, "SKILL.md")); err != nil {
		t.Errorf("SKILL.md not copied: %v", err)
	}
	if _, err := os.Stat(filepath.Join(sharedPath, "extra.txt")); err != nil {
		t.Errorf("extra file not copied: %v", err)
	}

	if !symlinkwindows.IsLinkPath(cliSkill) {
		t.Fatal("CLI source was not replaced with junction")
	}
	resolved, err := symlinkwindows.ResolveRealPath(cliSkill)
	if err != nil {
		t.Fatalf("resolve junction: %v", err)
	}
	if filepath.Clean(resolved) != filepath.Clean(sharedPath) {
		t.Errorf("junction points to %q, want %q", resolved, sharedPath)
	}

	tmp := filepath.Join(fakeHome, ".claude", "skills", ".migrating-my-owned")
	if _, err := os.Stat(tmp); !os.IsNotExist(err) {
		t.Errorf("staging tmp not cleaned up: err=%v", err)
	}

	reg, err := registry.Load(shared)
	if err != nil {
		t.Fatalf("registry load: %v", err)
	}
	e, ok := reg.Get("my-owned")
	if !ok {
		t.Fatal("registry missing my-owned")
	}
	if e.Origin != models.SkillOriginOwned {
		t.Errorf("registry origin wrong: %q", e.Origin)
	}
}

// TestMigrateFromCliRefusesWhenSharedHasSameName 共享根已有同名真实目录时必须拒绝。
// 这是"shadowing 冲突"的触发条件——覆盖会丢数据。
func TestMigrateFromCliRefusesWhenSharedHasSameName(t *testing.T) {
	shared := t.TempDir()
	fakeHome := t.TempDir()
	t.Setenv("USERPROFILE", fakeHome)
	t.Setenv("HOME", fakeHome)

	existing := filepath.Join(shared, "collide")
	if err := os.MkdirAll(existing, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(
		filepath.Join(existing, "SKILL.md"),
		[]byte("---\nname: collide\ndescription: already here.\n---\n"),
		0o644,
	); err != nil {
		t.Fatal(err)
	}
	originalMd, _ := os.ReadFile(filepath.Join(existing, "SKILL.md"))

	cliSkill := filepath.Join(fakeHome, ".claude", "skills", "collide")
	if err := os.MkdirAll(cliSkill, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(
		filepath.Join(cliSkill, "SKILL.md"),
		[]byte("---\nname: collide\ndescription: cli side.\n---\n"),
		0o644,
	); err != nil {
		t.Fatal(err)
	}

	if _, err := MigrateFromCli("claude", "collide", shared); err == nil {
		t.Fatal("expected error on pre-existing shared skill, got nil")
	}

	if symlinkwindows.IsLinkPath(cliSkill) {
		t.Error("CLI source was wrongly converted to junction on a rejected migrate")
	}
	if st, err := os.Stat(cliSkill); err != nil || !st.IsDir() {
		t.Errorf("CLI source missing after rejected migrate: %v", err)
	}
	after, _ := os.ReadFile(filepath.Join(existing, "SKILL.md"))
	if string(after) != string(originalMd) {
		t.Error("shared side SKILL.md was modified despite rejection")
	}
}

// TestMigrateFromCliRefusesJunctionSource 源已为 junction 说明 skill 已托管，再迁移会破坏语义。
func TestMigrateFromCliRefusesJunctionSource(t *testing.T) {
	if runtime.GOOS != "windows" {
		t.Skip("junctions are Windows-only")
	}
	shared := t.TempDir()
	fakeHome := t.TempDir()
	t.Setenv("USERPROFILE", fakeHome)
	t.Setenv("HOME", fakeHome)

	sharedSkill := filepath.Join(shared, "already-linked")
	if err := os.MkdirAll(sharedSkill, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(
		filepath.Join(sharedSkill, "SKILL.md"),
		[]byte("---\nname: already-linked\ndescription: x.\n---\n"),
		0o644,
	); err != nil {
		t.Fatal(err)
	}
	cliParent := filepath.Join(fakeHome, ".claude", "skills")
	if err := os.MkdirAll(cliParent, 0o755); err != nil {
		t.Fatal(err)
	}
	junction := filepath.Join(cliParent, "already-linked")
	if err := symlinkwindows.CreateDirectoryJunction(junction, sharedSkill); err != nil {
		t.Fatalf("prep junction: %v", err)
	}

	if _, err := MigrateFromCli("claude", "already-linked", shared); err == nil {
		t.Fatal("expected error when migrating an existing junction, got nil")
	}
}

// TestMigrateFromCliRejectsInvalidSource 源缺失 / 没 SKILL.md 时必须早退、不动任何文件。
func TestMigrateFromCliRejectsInvalidSource(t *testing.T) {
	shared := t.TempDir()
	fakeHome := t.TempDir()
	t.Setenv("USERPROFILE", fakeHome)
	t.Setenv("HOME", fakeHome)

	if _, err := MigrateFromCli("claude", "nope", shared); err == nil {
		t.Fatal("expected error for missing source, got nil")
	}

	dir := filepath.Join(fakeHome, ".claude", "skills", "no-md")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	if _, err := MigrateFromCli("claude", "no-md", shared); err == nil {
		t.Fatal("expected error when source has no SKILL.md, got nil")
	}
	// 共享根必须还是空的。
	entries, _ := os.ReadDir(shared)
	for _, e := range entries {
		if e.Name() != ".registry" && e.Name() != "" {
			t.Errorf("shared root polluted by rejected migrate: %s", e.Name())
		}
	}
}
