package registry

import (
	"os"
	"path/filepath"
	"testing"

	"skill-sync-manager/internal/models"
)

func TestLoadMissingReturnsEmpty(t *testing.T) {
	root := t.TempDir()
	reg, err := Load(root)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if reg.Version != CurrentVersion {
		t.Errorf("expected version %d, got %d", CurrentVersion, reg.Version)
	}
	if len(reg.Skills) != 0 {
		t.Errorf("expected empty Skills map")
	}
}

func TestSaveLoadRoundTrip(t *testing.T) {
	root := t.TempDir()
	reg := NewEmpty()
	reg.Set("alpha", Entry{Origin: models.SkillOriginOwned})
	reg.Set("beta", Entry{
		Origin:         models.SkillOriginVendored,
		Hidden:         true,
		Frozen:         true,
		ImportedFrom:   `C:\Users\x\.claude\skills\beta`,
		ImportedAtUnix: 1_700_000_000,
	})
	if err := Save(root, reg); err != nil {
		t.Fatalf("save: %v", err)
	}

	// File should exist exactly at sharedRoot/.skill-manager/registry.json.
	p, _ := Path(root)
	if _, err := os.Stat(p); err != nil {
		t.Fatalf("registry.json missing: %v", err)
	}

	loaded, err := Load(root)
	if err != nil {
		t.Fatalf("load: %v", err)
	}
	if len(loaded.Skills) != 2 {
		t.Fatalf("expected 2 entries, got %d", len(loaded.Skills))
	}
	alpha, ok := loaded.Get("alpha")
	if !ok || alpha.Origin != models.SkillOriginOwned {
		t.Errorf("alpha round-trip failed: %+v", alpha)
	}
	beta, ok := loaded.Get("beta")
	if !ok || !beta.Hidden || !beta.Frozen || beta.Origin != models.SkillOriginVendored {
		t.Errorf("beta round-trip failed: %+v", beta)
	}
}

func TestGetDefaultsForMissing(t *testing.T) {
	reg := NewEmpty()
	e, ok := reg.Get("does-not-exist")
	if ok {
		t.Errorf("expected ok=false for missing entry")
	}
	if e.Origin != models.SkillOriginOwned {
		t.Errorf("expected default origin=owned, got %q", e.Origin)
	}
	if e.Hidden || e.Frozen {
		t.Errorf("expected default hidden/frozen=false, got %+v", e)
	}
}

func TestSetEmptyOriginNormalized(t *testing.T) {
	reg := NewEmpty()
	reg.Set("x", Entry{}) // Origin left empty.
	e, ok := reg.Get("x")
	if !ok {
		t.Fatal("expected x to exist")
	}
	if e.Origin != models.SkillOriginOwned {
		t.Errorf("expected owned after normalization, got %q", e.Origin)
	}
}

func TestPruneMissing(t *testing.T) {
	reg := NewEmpty()
	reg.Set("keep", Entry{Origin: models.SkillOriginOwned})
	reg.Set("gone", Entry{Origin: models.SkillOriginVendored})
	removed := reg.PruneMissing(map[string]bool{"keep": true})
	if removed != 1 {
		t.Errorf("expected 1 removed, got %d", removed)
	}
	if _, ok := reg.Get("gone"); ok {
		t.Errorf("gone should have been pruned")
	}
	if _, ok := reg.Get("keep"); !ok {
		t.Errorf("keep must still exist")
	}
}

func TestCorruptFileReturnsEmptyPlusError(t *testing.T) {
	root := t.TempDir()
	p, _ := Path(root)
	if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(p, []byte("{not valid json"), 0o644); err != nil {
		t.Fatal(err)
	}
	reg, err := Load(root)
	if err == nil {
		t.Error("expected error for corrupt file")
	}
	if len(reg.Skills) != 0 {
		t.Error("expected empty registry on corrupt file")
	}
}

func TestSaveCreatesDirectory(t *testing.T) {
	root := t.TempDir()
	// No .skill-manager dir yet.
	reg := NewEmpty()
	reg.Set("a", Entry{Origin: models.SkillOriginOwned})
	if err := Save(root, reg); err != nil {
		t.Fatalf("save: %v", err)
	}
	if _, err := os.Stat(filepath.Join(root, DirName)); err != nil {
		t.Errorf("expected %s directory, err: %v", DirName, err)
	}
}
