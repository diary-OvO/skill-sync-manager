package skillscanner

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"

	"skill-sync-manager/internal/models"
	"skill-sync-manager/internal/registry"
	"skill-sync-manager/internal/symlinkwindows"
)

func TestImportFromCliMarksVendored(t *testing.T) {
	if runtime.GOOS != "windows" {
		t.Skip("vendored CLI imports use Windows junctions")
	}

	shared := t.TempDir()
	fakeHome := t.TempDir()
	t.Setenv("USERPROFILE", fakeHome)
	t.Setenv("HOME", fakeHome)

	cliSkill := filepath.Join(fakeHome, ".claude", "skills", "downloaded-tool")
	if err := os.MkdirAll(cliSkill, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(
		filepath.Join(cliSkill, "SKILL.md"),
		[]byte("---\nname: downloaded-tool\ndescription: From the internet.\n---\nBody"),
		0o644,
	); err != nil {
		t.Fatal(err)
	}

	skill, err := ImportFromCli("claude", "downloaded-tool", shared, models.SkillOriginVendored)
	if err != nil {
		t.Fatalf("import: %v", err)
	}
	if skill.Origin != models.SkillOriginVendored {
		t.Errorf("expected origin=vendored, got %q", skill.Origin)
	}
	if skill.ImportedFrom != cliSkill {
		t.Errorf("expected ImportedFrom=%q, got %q", cliSkill, skill.ImportedFrom)
	}
	if skill.ImportedAtUnix == 0 {
		t.Errorf("expected ImportedAtUnix to be set")
	}

	// Registry file must have the entry.
	reg, err := registry.Load(shared)
	if err != nil {
		t.Fatalf("registry load: %v", err)
	}
	e, ok := reg.Get("downloaded-tool")
	if !ok {
		t.Fatal("registry missing downloaded-tool entry")
	}
	if e.Origin != models.SkillOriginVendored {
		t.Errorf("registry origin wrong: %q", e.Origin)
	}
	if !e.GitIgnored {
		t.Errorf("expected vendored import to be git ignored")
	}

	sharedLink := filepath.Join(shared, "downloaded-tool")
	if !symlinkwindows.IsLinkPath(sharedLink) {
		t.Fatalf("expected shared root entry to be a junction: %s", sharedLink)
	}
	if resolved, err := symlinkwindows.ResolveRealPath(sharedLink); err != nil {
		t.Fatalf("resolve shared junction: %v", err)
	} else if resolved != cliSkill {
		t.Errorf("expected shared junction to point to %q, got %q", cliSkill, resolved)
	}

	gitignore, err := os.ReadFile(filepath.Join(shared, ".gitignore"))
	if err != nil {
		t.Fatalf("read .gitignore: %v", err)
	}
	if string(gitignore) == "" || !containsLine(string(gitignore), "/downloaded-tool/") {
		t.Errorf("expected .gitignore to contain /downloaded-tool/, got:\n%s", string(gitignore))
	}

	// CLI-side copy must be untouched — never modified by ImportFromCli.
	if _, err := os.Stat(cliSkill); err != nil {
		t.Errorf("CLI-side skill was modified: %v", err)
	}
}

func TestImportFromCliRefusesDuplicate(t *testing.T) {
	shared := t.TempDir()
	fakeHome := t.TempDir()
	t.Setenv("USERPROFILE", fakeHome)
	t.Setenv("HOME", fakeHome)

	// Pre-existing shared skill with same name.
	existing := filepath.Join(shared, "dup")
	if err := os.MkdirAll(existing, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(
		filepath.Join(existing, "SKILL.md"),
		[]byte("---\nname: dup\ndescription: already here.\n---\n"),
		0o644,
	); err != nil {
		t.Fatal(err)
	}

	cliSkill := filepath.Join(fakeHome, ".claude", "skills", "dup")
	if err := os.MkdirAll(cliSkill, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(
		filepath.Join(cliSkill, "SKILL.md"),
		[]byte("---\nname: dup\ndescription: also here.\n---\n"),
		0o644,
	); err != nil {
		t.Fatal(err)
	}

	if _, err := ImportFromCli("claude", "dup", shared, models.SkillOriginOwned); err == nil {
		t.Fatal("expected error on duplicate, got nil")
	}
}

func TestImportFromCliEmptyOriginFallsBackToVendored(t *testing.T) {
	if runtime.GOOS != "windows" {
		t.Skip("vendored CLI imports use Windows junctions")
	}

	shared := t.TempDir()
	fakeHome := t.TempDir()
	t.Setenv("USERPROFILE", fakeHome)
	t.Setenv("HOME", fakeHome)

	cliSkill := filepath.Join(fakeHome, ".claude", "skills", "unnamed-origin")
	if err := os.MkdirAll(cliSkill, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(
		filepath.Join(cliSkill, "SKILL.md"),
		[]byte("---\nname: unnamed-origin\ndescription: demo.\n---\n"),
		0o644,
	); err != nil {
		t.Fatal(err)
	}
	skill, err := ImportFromCli("claude", "unnamed-origin", shared, models.SkillOrigin(""))
	if err != nil {
		t.Fatalf("import: %v", err)
	}
	if skill.Origin != models.SkillOriginVendored {
		t.Errorf("expected fallback origin=vendored, got %q", skill.Origin)
	}
}

func containsLine(text string, want string) bool {
	for _, line := range strings.Split(strings.ReplaceAll(text, "\r\n", "\n"), "\n") {
		if line == want {
			return true
		}
	}
	return false
}
