package skillscanner

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func writeSkill(t *testing.T, root, name, frontmatter, body string) string {
	t.Helper()
	dir := filepath.Join(root, name)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatalf("mkdir: %v", err)
	}
	content := "---\n" + frontmatter + "\n---\n" + body
	if err := os.WriteFile(filepath.Join(dir, "SKILL.md"), []byte(content), 0o644); err != nil {
		t.Fatalf("write: %v", err)
	}
	return dir
}

func findSkill(skills []skillLike, name string) *skillLike {
	for i := range skills {
		if skills[i].Name == name {
			return &skills[i]
		}
	}
	return nil
}

// skillLike lets us share a find helper without importing the models package
// twice via a different name.
type skillLike struct {
	Name        string
	Description string
	Path        string
	Valid       bool
	Errors      []string
	Frontmatter map[string]string
	BodyPreview string
}

func scanAs(t *testing.T, root string) []skillLike {
	t.Helper()
	skills, err := ScanSkills(root)
	if err != nil {
		t.Fatalf("ScanSkills: %v", err)
	}
	out := make([]skillLike, len(skills))
	for i, s := range skills {
		out[i] = skillLike{
			Name:        s.Name,
			Description: s.Description,
			Path:        s.Path,
			Valid:       s.Valid,
			Errors:      s.Errors,
			Frontmatter: s.Frontmatter,
			BodyPreview: s.BodyPreview,
		}
	}
	return out
}

func TestScanSkillsValid(t *testing.T) {
	root := t.TempDir()
	writeSkill(t, root, "valid-skill", "name: valid-skill\ndescription: A nice skill for testing.", "\n# Valid Skill\n\nHello.")
	skills := scanAs(t, root)
	found := findSkill(skills, "valid-skill")
	if found == nil {
		t.Fatal("valid-skill not found")
	}
	if !found.Valid {
		t.Errorf("expected valid=true, got errors: %v", found.Errors)
	}
	if found.Description != "A nice skill for testing." {
		t.Errorf("unexpected description: %q", found.Description)
	}
}

func TestScanSkillsMissingDescription(t *testing.T) {
	root := t.TempDir()
	writeSkill(t, root, "missing-desc", "name: missing-desc", "\n# Body only\n")
	skills := scanAs(t, root)
	found := findSkill(skills, "missing-desc")
	if found == nil {
		t.Fatal("missing-desc not found")
	}
	if found.Valid {
		t.Errorf("expected valid=false")
	}
	hasDescErr := false
	for _, e := range found.Errors {
		if strings.Contains(strings.ToLower(e), "description") {
			hasDescErr = true
			break
		}
	}
	if !hasDescErr {
		t.Errorf("expected an error mentioning description, got %v", found.Errors)
	}
}

func TestScanSkillsIgnoresNonSkill(t *testing.T) {
	root := t.TempDir()
	folder := filepath.Join(root, "not-a-skill")
	if err := os.MkdirAll(folder, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(folder, "readme.txt"), []byte("hello"), 0o644); err != nil {
		t.Fatal(err)
	}
	skills := scanAs(t, root)
	for _, s := range skills {
		if s.Path == folder {
			t.Fatal("non-skill folder was scanned as a skill")
		}
	}
}

func TestScanSkillsBodyPreviewTruncated(t *testing.T) {
	root := t.TempDir()
	longBody := "\n" + strings.Repeat("a", 1500)
	writeSkill(t, root, "long-body", "name: long-body\ndescription: A long body skill.", longBody)
	skills := scanAs(t, root)
	found := findSkill(skills, "long-body")
	if found == nil {
		t.Fatal("long-body not found")
	}
	if len(found.BodyPreview) != BodyPreviewLimit {
		t.Errorf("expected bodyPreview length %d, got %d", BodyPreviewLimit, len(found.BodyPreview))
	}
}

func TestParseSkillMarkdownMissingFile(t *testing.T) {
	root := t.TempDir()
	parsed, err := ParseSkillMarkdown(filepath.Join(root, "does-not-exist.md"))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(parsed.Errors) == 0 {
		t.Fatal("expected errors for missing file")
	}
	if parsed.Name != "" {
		t.Errorf("expected empty name, got %q", parsed.Name)
	}
}

func TestImportSkillFolderNoOverwrite(t *testing.T) {
	root := t.TempDir()
	source := t.TempDir()
	if err := os.WriteFile(
		filepath.Join(source, "SKILL.md"),
		[]byte("---\nname: ported\ndescription: Imported skill.\n---\nBody"),
		0o644,
	); err != nil {
		t.Fatal(err)
	}

	if _, err := ImportSkillFolder(source, root); err != nil {
		t.Fatalf("first import failed: %v", err)
	}
	if _, err := ImportSkillFolder(source, root); err == nil {
		t.Fatal("second import should have failed (target exists)")
	}
}
