package models

type SyncState string

const (
	SyncStateMissing     SyncState = "missing"
	SyncStateSynced      SyncState = "synced"
	SyncStateConflict    SyncState = "conflict"
	SyncStateInvalid     SyncState = "invalid"
	SyncStateUnsupported SyncState = "unsupported"
	SyncStateError       SyncState = "error"
)

// SkillOrigin distinguishes skills the user maintains themselves (owned)
// from skills brought in from elsewhere (vendored) — e.g. downloaded,
// cloned from another repo, or imported from a CLI tool's existing dir.
type SkillOrigin string

const (
	SkillOriginOwned    SkillOrigin = "owned"
	SkillOriginVendored SkillOrigin = "vendored"
	SkillOriginUnknown  SkillOrigin = "unknown"
)

type SkillInfo struct {
	Name        string            `json:"name"`
	Description string            `json:"description"`
	Path        string            `json:"path"`
	Valid       bool              `json:"valid"`
	Errors      []string          `json:"errors"`
	Frontmatter map[string]string `json:"frontmatter"`
	BodyPreview string            `json:"bodyPreview"`

	// Registry-derived fields. Defaults when no registry entry exists:
	// Origin = owned, Hidden = false, Frozen = false.
	Origin         SkillOrigin `json:"origin"`
	Hidden         bool        `json:"hidden"`
	Frozen         bool        `json:"frozen"`
	ImportedFrom   string      `json:"importedFrom,omitempty"`
	ImportedAtUnix int64       `json:"importedAtUnix,omitempty"`
}

type ToolStatus struct {
	ToolName       string  `json:"toolName"`
	ExecutablePath *string `json:"executablePath"`
	Detected       bool    `json:"detected"`
	Supported      bool    `json:"supported"`
}

type GitStatus struct {
	GitAvailable bool     `json:"gitAvailable"`
	IsRepo       bool     `json:"isRepo"`
	HasRemote    bool     `json:"hasRemote"`
	Remotes      []string `json:"remotes"`
	Dirty        bool     `json:"dirty"`
	Branch       *string  `json:"branch"`
	Error        *string  `json:"error,omitempty"`
}

type SyncStatus struct {
	TargetName string    `json:"targetName"`
	TargetPath string    `json:"targetPath"`
	State      SyncState `json:"state"`
	Message    string    `json:"message"`
}

type AppSettings struct {
	SharedRoot *string `json:"sharedRoot"`
}

type LogEntry struct {
	Timestamp string `json:"timestamp"`
	Action    string `json:"action"`
	Result    string `json:"result"`
	Message   string `json:"message"`
}

// CliSkillKind classifies what exists at a CLI tool's skills directory
// entry relative to the user's shared skill root.
type CliSkillKind string

const (
	// Managed: the entry is a junction/symlink pointing at the matching
	// skill inside the shared root. Equivalent to SyncStateSynced.
	CliSkillKindManaged CliSkillKind = "managed"
	// StrayLink: the entry is a junction/symlink pointing somewhere that
	// is not our shared root skill. Not safe to auto-fix.
	CliSkillKindStrayLink CliSkillKind = "stray-link"
	// Shadowing: the entry is a real directory AND a skill with the same
	// name exists in the shared root. This is the usual conflict cause.
	CliSkillKindShadowing CliSkillKind = "shadowing"
	// External: the entry is a real directory with no matching skill in
	// the shared root — a foreign skill that the user may want to import.
	CliSkillKindExternal CliSkillKind = "external"
)

// CliSkillEntry is one row in a CLI-side scan (Claude or Codex).
type CliSkillEntry struct {
	ToolName   string       `json:"toolName"`
	SkillName  string       `json:"skillName"`
	Path       string       `json:"path"`
	Kind       CliSkillKind `json:"kind"`
	IsLink     bool         `json:"isLink"`
	LinkTarget string       `json:"linkTarget,omitempty"`
	// HasSkillMd indicates whether Path/SKILL.md was found when the entry
	// is a real directory. Helpful for the UI to warn about bare folders.
	HasSkillMd bool `json:"hasSkillMd"`
	// Set when the entry corresponds (by name) to an existing shared-root
	// skill. Useful for the UI to cross-reference.
	SharedRootPath string `json:"sharedRootPath,omitempty"`
}

var SupportedTools = []string{"claude", "codex"}
var UnsupportedTools = []string{"gemini", "opencode", "hermes"}

func AllTools() []string {
	all := make([]string, 0, len(SupportedTools)+len(UnsupportedTools))
	all = append(all, SupportedTools...)
	all = append(all, UnsupportedTools...)
	return all
}

func IsSupportedTool(name string) bool {
	for _, t := range SupportedTools {
		if t == name {
			return true
		}
	}
	return false
}
