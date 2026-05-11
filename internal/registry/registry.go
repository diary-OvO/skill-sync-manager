// Package registry persists per-skill metadata (origin, hidden, frozen,
// import provenance) alongside the user's shared skill root, in
// .skill-manager/registry.json. Skill directories themselves are not
// modified by this package.
package registry

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"

	"skill-sync-manager/internal/models"
)

const (
	// DirName is the folder inside the shared root that holds registry
	// state. It is intentionally dotted so normal tooling ignores it.
	DirName = ".skill-manager"
	// FileName is the registry JSON file.
	FileName = "registry.json"
	// CurrentVersion is the schema version written by this build.
	CurrentVersion = 1
)

// Entry describes a single skill's metadata.
type Entry struct {
	Origin         models.SkillOrigin `json:"origin,omitempty"`
	Hidden         bool               `json:"hidden,omitempty"`
	Frozen         bool               `json:"frozen,omitempty"`
	ImportedFrom   string             `json:"importedFrom,omitempty"`
	ImportedAtUnix int64              `json:"importedAtUnix,omitempty"`
}

// Registry is the root JSON document stored at registry.json.
type Registry struct {
	Version int              `json:"version"`
	Skills  map[string]Entry `json:"skills"`
}

// NewEmpty returns an empty registry at the current schema version.
func NewEmpty() Registry {
	return Registry{Version: CurrentVersion, Skills: map[string]Entry{}}
}

// Path returns the absolute registry.json path for a shared root.
// It does not create the file.
func Path(sharedRoot string) (string, error) {
	if sharedRoot == "" {
		return "", errors.New("shared root must not be empty")
	}
	abs, err := filepath.Abs(sharedRoot)
	if err != nil {
		return "", err
	}
	return filepath.Join(abs, DirName, FileName), nil
}

// Load reads the registry for a given shared root. A missing file is
// not an error — it returns an empty registry. A corrupt file returns
// an empty registry plus the parse error, so callers can log but still
// proceed with sane defaults.
func Load(sharedRoot string) (Registry, error) {
	p, err := Path(sharedRoot)
	if err != nil {
		return NewEmpty(), err
	}
	data, err := os.ReadFile(p)
	if err != nil {
		if os.IsNotExist(err) {
			return NewEmpty(), nil
		}
		return NewEmpty(), err
	}
	var reg Registry
	if err := json.Unmarshal(data, &reg); err != nil {
		return NewEmpty(), fmt.Errorf("registry.json is corrupt: %w", err)
	}
	if reg.Skills == nil {
		reg.Skills = map[string]Entry{}
	}
	if reg.Version == 0 {
		reg.Version = CurrentVersion
	}
	return reg, nil
}

// Save writes the registry atomically. Parent directory is created if
// missing. Write goes to a temp file in the same directory and is then
// renamed into place, so readers never see a half-written file.
func Save(sharedRoot string, reg Registry) error {
	p, err := Path(sharedRoot)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
		return err
	}
	if reg.Skills == nil {
		reg.Skills = map[string]Entry{}
	}
	if reg.Version == 0 {
		reg.Version = CurrentVersion
	}
	data, err := json.MarshalIndent(reg, "", "  ")
	if err != nil {
		return err
	}
	tmp, err := os.CreateTemp(filepath.Dir(p), ".registry-*.json.tmp")
	if err != nil {
		return err
	}
	tmpName := tmp.Name()
	removeTmp := func() { _ = os.Remove(tmpName) }
	if _, err := tmp.Write(data); err != nil {
		tmp.Close()
		removeTmp()
		return err
	}
	if err := tmp.Close(); err != nil {
		removeTmp()
		return err
	}
	if err := os.Rename(tmpName, p); err != nil {
		removeTmp()
		return err
	}
	return nil
}

// Get returns the entry for name, plus a boolean indicating whether an
// explicit entry existed. Defaults: Origin=owned, Hidden=false, Frozen=false.
func (r Registry) Get(name string) (Entry, bool) {
	if r.Skills == nil {
		return defaultEntry(), false
	}
	e, ok := r.Skills[name]
	if !ok {
		return defaultEntry(), false
	}
	if e.Origin == "" {
		e.Origin = models.SkillOriginOwned
	}
	return e, true
}

// Set writes an entry for name and returns the updated registry (mutated
// in place). Nil/empty origin is normalized to owned.
func (r *Registry) Set(name string, e Entry) {
	if r.Skills == nil {
		r.Skills = map[string]Entry{}
	}
	if e.Origin == "" {
		e.Origin = models.SkillOriginOwned
	}
	r.Skills[name] = e
}

// Delete removes an entry by name. Safe to call for missing keys.
func (r *Registry) Delete(name string) {
	if r.Skills == nil {
		return
	}
	delete(r.Skills, name)
}

// PruneMissing removes entries whose names are not in `existing`. The
// shared root scan calls this so orphan entries disappear automatically
// when a skill directory is deleted outside the app.
func (r *Registry) PruneMissing(existing map[string]bool) int {
	if r.Skills == nil {
		return 0
	}
	removed := 0
	for name := range r.Skills {
		if !existing[name] {
			delete(r.Skills, name)
			removed++
		}
	}
	return removed
}

func defaultEntry() Entry {
	return Entry{Origin: models.SkillOriginOwned}
}
