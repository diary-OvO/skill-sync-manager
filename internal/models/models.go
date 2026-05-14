package models

// SyncState 表示某个 skill 在某个目标工具下的同步状态。
type SyncState string

const (
	SyncStateMissing     SyncState = "missing"
	SyncStateSynced      SyncState = "synced"
	SyncStateConflict    SyncState = "conflict"
	SyncStateInvalid     SyncState = "invalid"
	SyncStateUnsupported SyncState = "unsupported"
	SyncStateError       SyncState = "error"
)

// SkillOrigin 区分用户自有（owned）与外部引入（vendored）的 skill。
// 例如从其他仓库 clone、从 CLI 工具目录导入的都属于 vendored。
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

	// 注册表中读取的字段。若注册表中无对应条目，默认值为：
	// Origin = owned、Hidden = false、Frozen = false。
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

type AppInfo struct {
	AppName        string `json:"appName"`
	Version        string `json:"version"`
	RepoOwner      string `json:"repoOwner"`
	RepoName       string `json:"repoName"`
	RepoURL        string `json:"repoUrl"`
	ReleaseURL     string `json:"releaseUrl"`
	ExecutablePath string `json:"executablePath"`
}

type UpdateInfo struct {
	CurrentVersion   string `json:"currentVersion"`
	LatestVersion    string `json:"latestVersion"`
	UpdateAvailable  bool   `json:"updateAvailable"`
	ReleaseURL       string `json:"releaseUrl"`
	ReleaseNotes     string `json:"releaseNotes"`
	PublishedAt      string `json:"publishedAt"`
	AssetName        string `json:"assetName"`
	AssetURL         string `json:"assetUrl"`
	AssetSize        int64  `json:"assetSize"`
	AssetKind        string `json:"assetKind"`
	InstallSupported bool   `json:"installSupported"`
	CanInstall       bool   `json:"canInstall"`
	Message          string `json:"message"`
}

type UpdateInstallResult struct {
	Started      bool   `json:"started"`
	Message      string `json:"message"`
	Version      string `json:"version"`
	AssetName    string `json:"assetName"`
	DownloadPath string `json:"downloadPath"`
	StagedPath   string `json:"stagedPath"`
	LogPath      string `json:"logPath"`
	SHA256       string `json:"sha256"`
}

type LogEntry struct {
	Timestamp string `json:"timestamp"`
	Action    string `json:"action"`
	Result    string `json:"result"`
	Message   string `json:"message"`
}

// CliSkillKind 用于在扫描 CLI 工具的 skills 目录时，
// 对每一项相对于共享根目录的关系进行分类。
type CliSkillKind string

const (
	// Managed：该条目是一个 junction/symlink，且指向共享根下同名的 skill。
	// 等价于 SyncStateSynced。
	CliSkillKindManaged CliSkillKind = "managed"
	// StrayLink：该条目是 junction/symlink，但指向的目标不是共享根的 skill。
	// 不安全，不会自动修复。
	CliSkillKindStrayLink CliSkillKind = "stray-link"
	// Shadowing：该条目是一个真实目录，并且共享根下存在同名 skill。
	// 这通常是冲突的来源。
	CliSkillKindShadowing CliSkillKind = "shadowing"
	// External：该条目是真实目录，且共享根下没有同名 skill，
	// 属于外部 skill，用户可能希望将其导入共享根。
	CliSkillKindExternal CliSkillKind = "external"
)

// CliSkillEntry 表示 Claude 或 Codex 等 CLI 工具的 skills 目录扫描结果中的一行。
type CliSkillEntry struct {
	ToolName   string       `json:"toolName"`
	SkillName  string       `json:"skillName"`
	Path       string       `json:"path"`
	Kind       CliSkillKind `json:"kind"`
	IsLink     bool         `json:"isLink"`
	LinkTarget string       `json:"linkTarget,omitempty"`
	// HasSkillMd：当条目为真实目录时，标记 Path/SKILL.md 是否存在。
	// 便于前端对"空壳目录"进行提示。
	HasSkillMd bool `json:"hasSkillMd"`
	// SharedRootPath：若条目（按名称）对应共享根下某个已存在的 skill，
	// 则填入其路径，便于前端交叉引用。
	SharedRootPath string `json:"sharedRootPath,omitempty"`
}

var SupportedTools = []string{"claude", "codex", "gemini", "opencode"}
var UnsupportedTools = []string{"hermes"}

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
