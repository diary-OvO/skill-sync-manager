package updater

import (
	"archive/zip"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"time"

	"skill-sync-manager/internal/models"
	"skill-sync-manager/internal/proc"
	"skill-sync-manager/internal/version"
)

type Config struct {
	AppName        string
	CurrentVersion string
	RepoOwner      string
	RepoName       string
}

type githubRelease struct {
	TagName     string        `json:"tag_name"`
	HTMLURL     string        `json:"html_url"`
	Body        string        `json:"body"`
	Draft       bool          `json:"draft"`
	Prerelease  bool          `json:"prerelease"`
	PublishedAt string        `json:"published_at"`
	Assets      []githubAsset `json:"assets"`
}

type githubAsset struct {
	Name               string `json:"name"`
	BrowserDownloadURL string `json:"browser_download_url"`
	Size               int64  `json:"size"`
	ContentType        string `json:"content_type"`
}

func DefaultConfig() Config {
	return Config{
		AppName:        version.AppName,
		CurrentVersion: version.Version,
		RepoOwner:      version.RepoOwner,
		RepoName:       version.RepoName,
	}
}

func CheckLatest(ctx context.Context, cfg Config) (models.UpdateInfo, error) {
	cfg = fillConfig(cfg)
	info := models.UpdateInfo{
		CurrentVersion:   cfg.CurrentVersion,
		InstallSupported: installSupported(),
	}

	release, err := fetchLatestRelease(ctx, cfg)
	if err != nil {
		return info, err
	}
	info.LatestVersion = release.TagName
	info.ReleaseURL = release.HTMLURL
	info.ReleaseNotes = release.Body
	info.PublishedAt = release.PublishedAt

	if release.Draft {
		info.Message = "Latest GitHub release is still a draft."
		return info, nil
	}

	if compareVersions(release.TagName, cfg.CurrentVersion) <= 0 {
		info.Message = "Already up to date."
		return info, nil
	}

	info.UpdateAvailable = true
	asset, kind, ok := selectAsset(release.Assets, cfg.AppName, runtime.GOOS, runtime.GOARCH)
	if !ok {
		info.Message = "A newer release exists, but no compatible Windows executable asset was found."
		return info, nil
	}

	info.AssetName = asset.Name
	info.AssetURL = asset.BrowserDownloadURL
	info.AssetSize = asset.Size
	info.AssetKind = kind
	info.CanInstall = info.InstallSupported && asset.BrowserDownloadURL != ""
	if !info.InstallSupported {
		info.Message = "Automatic installation is only supported by the Windows executable build."
	} else {
		info.Message = "Update available."
	}
	return info, nil
}

func DownloadAndStartInstall(ctx context.Context, info models.UpdateInfo, cfg Config) (models.UpdateInstallResult, error) {
	cfg = fillConfig(cfg)
	if !installSupported() {
		return models.UpdateInstallResult{}, fmt.Errorf("automatic installation is only supported on Windows executable builds")
	}
	if !info.UpdateAvailable {
		return models.UpdateInstallResult{}, fmt.Errorf("no update is available")
	}
	if info.AssetURL == "" {
		return models.UpdateInstallResult{}, fmt.Errorf("release has no compatible downloadable asset")
	}

	updateDir, err := updateDir(cfg.AppName, info.LatestVersion)
	if err != nil {
		return models.UpdateInstallResult{}, err
	}

	downloadPath := filepath.Join(updateDir, safeFilename(info.AssetName))
	written, sum, err := downloadFile(ctx, info.AssetURL, downloadPath, cfg)
	if err != nil {
		return models.UpdateInstallResult{}, err
	}
	if info.AssetSize > 0 && written != info.AssetSize {
		return models.UpdateInstallResult{}, fmt.Errorf("downloaded size mismatch: expected %d bytes, got %d", info.AssetSize, written)
	}

	exePath := downloadPath
	if strings.EqualFold(info.AssetKind, "zip") {
		exePath, err = extractExecutableFromZip(downloadPath, updateDir, cfg.AppName)
		if err != nil {
			return models.UpdateInstallResult{}, err
		}
	}
	if err := validateWindowsExecutable(exePath); err != nil {
		return models.UpdateInstallResult{}, err
	}

	currentExe, err := os.Executable()
	if err != nil {
		return models.UpdateInstallResult{}, err
	}
	logPath := filepath.Join(updateDir, "apply-update.log")
	scriptPath, err := writeApplyScript(updateDir)
	if err != nil {
		return models.UpdateInstallResult{}, err
	}
	if err := proc.Start(
		"update:apply",
		"",
		"powershell.exe",
		"-NoProfile",
		"-ExecutionPolicy",
		"Bypass",
		"-WindowStyle",
		"Hidden",
		"-File",
		scriptPath,
		"-Target",
		currentExe,
		"-Source",
		exePath,
		"-ProcessId",
		strconv.Itoa(os.Getpid()),
		"-LogPath",
		logPath,
	); err != nil {
		return models.UpdateInstallResult{}, err
	}

	return models.UpdateInstallResult{
		Started:      true,
		Message:      "Update downloaded. The app will restart to apply it.",
		Version:      info.LatestVersion,
		AssetName:    info.AssetName,
		DownloadPath: downloadPath,
		StagedPath:   exePath,
		LogPath:      logPath,
		SHA256:       sum,
	}, nil
}

func fillConfig(cfg Config) Config {
	def := DefaultConfig()
	if cfg.AppName == "" {
		cfg.AppName = def.AppName
	}
	if cfg.CurrentVersion == "" {
		cfg.CurrentVersion = def.CurrentVersion
	}
	if cfg.RepoOwner == "" {
		cfg.RepoOwner = def.RepoOwner
	}
	if cfg.RepoName == "" {
		cfg.RepoName = def.RepoName
	}
	return cfg
}

func fetchLatestRelease(ctx context.Context, cfg Config) (githubRelease, error) {
	ctx, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()

	url := fmt.Sprintf("https://api.github.com/repos/%s/%s/releases/latest", cfg.RepoOwner, cfg.RepoName)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return githubRelease{}, err
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("User-Agent", cfg.AppName+"/"+cfg.CurrentVersion)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return githubRelease{}, err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 2048))
		return githubRelease{}, fmt.Errorf("GitHub release API returned %s: %s", resp.Status, strings.TrimSpace(string(body)))
	}

	var release githubRelease
	if err := json.NewDecoder(resp.Body).Decode(&release); err != nil {
		return githubRelease{}, err
	}
	if release.TagName == "" {
		return githubRelease{}, fmt.Errorf("latest release has no tag")
	}
	return release, nil
}

func selectAsset(assets []githubAsset, appName, goos, goarch string) (githubAsset, string, bool) {
	for _, kind := range []string{"exe", "zip"} {
		for _, asset := range assets {
			if assetMatches(asset.Name, appName, goos, goarch, kind) && asset.BrowserDownloadURL != "" {
				return asset, kind, true
			}
		}
	}
	return githubAsset{}, "", false
}

func assetMatches(name, appName, goos, goarch, kind string) bool {
	lower := strings.ToLower(name)
	if !strings.HasSuffix(lower, "."+kind) {
		return false
	}
	if !strings.Contains(lower, strings.ToLower(appName)) {
		return false
	}
	if goos == "windows" {
		if !strings.Contains(lower, "windows") && !strings.Contains(lower, "win") {
			return false
		}
	} else if !strings.Contains(lower, goos) {
		return false
	}
	return archMatches(lower, goarch)
}

func archMatches(name, goarch string) bool {
	aliases := map[string][]string{
		"amd64": {"amd64", "x64", "x86_64"},
		"386":   {"386", "x86", "ia32"},
		"arm64": {"arm64", "aarch64"},
	}
	tokens := aliases[goarch]
	if len(tokens) == 0 {
		tokens = []string{goarch}
	}
	for _, token := range tokens {
		if strings.Contains(name, token) {
			return true
		}
	}

	known := []string{"amd64", "x64", "x86_64", "386", "x86", "ia32", "arm64", "aarch64"}
	for _, token := range known {
		if strings.Contains(name, token) {
			return false
		}
	}
	return true
}

func installSupported() bool {
	if runtime.GOOS != "windows" {
		return false
	}
	exe, err := os.Executable()
	return err == nil && strings.EqualFold(filepath.Ext(exe), ".exe")
}

func compareVersions(a, b string) int {
	aa, apre := parseVersion(a)
	bb, bpre := parseVersion(b)
	maxLen := len(aa)
	if len(bb) > maxLen {
		maxLen = len(bb)
	}
	for i := 0; i < maxLen; i++ {
		av, bv := 0, 0
		if i < len(aa) {
			av = aa[i]
		}
		if i < len(bb) {
			bv = bb[i]
		}
		if av > bv {
			return 1
		}
		if av < bv {
			return -1
		}
	}
	if apre == "" && bpre != "" {
		return 1
	}
	if apre != "" && bpre == "" {
		return -1
	}
	return strings.Compare(apre, bpre)
}

func parseVersion(v string) ([]int, string) {
	v = strings.TrimSpace(v)
	v = strings.TrimPrefix(v, "refs/tags/")
	v = strings.TrimPrefix(v, "v")
	if plus := strings.IndexByte(v, '+'); plus >= 0 {
		v = v[:plus]
	}
	prerelease := ""
	if dash := strings.IndexByte(v, '-'); dash >= 0 {
		prerelease = v[dash+1:]
		v = v[:dash]
	}
	parts := strings.Split(v, ".")
	nums := make([]int, 0, len(parts))
	for _, part := range parts {
		n, err := strconv.Atoi(part)
		if err != nil {
			nums = append(nums, 0)
			continue
		}
		nums = append(nums, n)
	}
	return nums, prerelease
}

func updateDir(appName, tag string) (string, error) {
	base, err := os.UserCacheDir()
	if err != nil {
		base = os.TempDir()
	}
	dir := filepath.Join(base, appName, "updates", safeFilename(tag))
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return "", err
	}
	return dir, nil
}

func safeFilename(name string) string {
	name = filepath.Base(strings.TrimSpace(name))
	if name == "." || name == string(filepath.Separator) || name == "" {
		return "download"
	}
	replacer := strings.NewReplacer("\\", "_", "/", "_", ":", "_", "*", "_", "?", "_", "\"", "_", "<", "_", ">", "_", "|", "_")
	return replacer.Replace(name)
}

func downloadFile(ctx context.Context, url string, target string, cfg Config) (int64, string, error) {
	ctx, cancel := context.WithTimeout(ctx, 10*time.Minute)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return 0, "", err
	}
	req.Header.Set("User-Agent", cfg.AppName+"/"+cfg.CurrentVersion)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return 0, "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 2048))
		return 0, "", fmt.Errorf("download failed with %s: %s", resp.Status, strings.TrimSpace(string(body)))
	}

	tmp := target + ".download"
	if err := os.MkdirAll(filepath.Dir(target), 0o700); err != nil {
		return 0, "", err
	}
	out, err := os.Create(tmp)
	if err != nil {
		return 0, "", err
	}
	hasher := sha256.New()
	written, copyErr := io.Copy(out, io.TeeReader(resp.Body, hasher))
	closeErr := out.Close()
	if copyErr != nil {
		_ = os.Remove(tmp)
		return 0, "", copyErr
	}
	if closeErr != nil {
		_ = os.Remove(tmp)
		return 0, "", closeErr
	}
	if err := os.Remove(target); err != nil && !os.IsNotExist(err) {
		_ = os.Remove(tmp)
		return 0, "", err
	}
	if err := os.Rename(tmp, target); err != nil {
		_ = os.Remove(tmp)
		return 0, "", err
	}
	return written, hex.EncodeToString(hasher.Sum(nil)), nil
}

func extractExecutableFromZip(zipPath, dir, appName string) (string, error) {
	reader, err := zip.OpenReader(zipPath)
	if err != nil {
		return "", err
	}
	defer reader.Close()

	var candidate *zip.File
	for _, file := range reader.File {
		name := strings.ToLower(filepath.Base(file.Name))
		if file.FileInfo().IsDir() || !strings.HasSuffix(name, ".exe") {
			continue
		}
		if strings.Contains(name, strings.ToLower(appName)) {
			candidate = file
			break
		}
		if candidate == nil {
			candidate = file
		}
	}
	if candidate == nil {
		return "", fmt.Errorf("zip asset does not contain an executable")
	}

	src, err := candidate.Open()
	if err != nil {
		return "", err
	}
	defer src.Close()

	target := filepath.Join(dir, appName+".staged.exe")
	out, err := os.Create(target)
	if err != nil {
		return "", err
	}
	_, copyErr := io.Copy(out, src)
	closeErr := out.Close()
	if copyErr != nil {
		_ = os.Remove(target)
		return "", copyErr
	}
	if closeErr != nil {
		_ = os.Remove(target)
		return "", closeErr
	}
	return target, nil
}

func validateWindowsExecutable(path string) error {
	f, err := os.Open(path)
	if err != nil {
		return err
	}
	defer f.Close()

	header := make([]byte, 2)
	if _, err := io.ReadFull(f, header); err != nil {
		return fmt.Errorf("downloaded executable is too small: %w", err)
	}
	if string(header) != "MZ" {
		return fmt.Errorf("downloaded file is not a Windows executable")
	}
	return nil
}

func writeApplyScript(dir string) (string, error) {
	path := filepath.Join(dir, "apply-update.ps1")
	script := `param(
  [Parameter(Mandatory=$true)][string]$Target,
  [Parameter(Mandatory=$true)][string]$Source,
  [Parameter(Mandatory=$true)][int]$ProcessId,
  [Parameter(Mandatory=$true)][string]$LogPath
)

$ErrorActionPreference = "Stop"

function Write-UpdateLog([string]$Message) {
  $stamp = Get-Date -Format o
  Add-Content -LiteralPath $LogPath -Value "$stamp $Message"
}

try {
  Write-UpdateLog "Waiting for process $ProcessId to exit."
  for ($i = 0; $i -lt 180; $i++) {
    $process = Get-Process -Id $ProcessId -ErrorAction SilentlyContinue
    if ($null -eq $process) { break }
    Start-Sleep -Milliseconds 500
  }

  $targetDir = Split-Path -LiteralPath $Target -Parent
  $targetName = Split-Path -LiteralPath $Target -Leaf
  $backup = Join-Path $targetDir ($targetName + ".bak")
  $lastError = $null
  $applied = $false

  for ($i = 0; $i -lt 120; $i++) {
    try {
      if (Test-Path -LiteralPath $backup) {
        Remove-Item -LiteralPath $backup -Force
      }
      if (Test-Path -LiteralPath $Target) {
        Move-Item -LiteralPath $Target -Destination $backup -Force
      }
      Move-Item -LiteralPath $Source -Destination $Target -Force
      $applied = $true
      break
    } catch {
      $lastError = $_.Exception.Message
      try {
        if ((-not (Test-Path -LiteralPath $Target)) -and (Test-Path -LiteralPath $backup)) {
          Move-Item -LiteralPath $backup -Destination $Target -Force
        }
      } catch {}
      Start-Sleep -Milliseconds 500
    }
  }

  if (-not $applied) {
    throw "Failed to replace target executable: $lastError"
  }

  try {
    if (Test-Path -LiteralPath $backup) {
      Remove-Item -LiteralPath $backup -Force
    }
  } catch {}

  Write-UpdateLog "Update applied. Restarting app."
  Start-Process -FilePath $Target -WorkingDirectory $targetDir
} catch {
  Write-UpdateLog ("Update failed: " + $_.Exception.Message)
}
`
	if err := os.WriteFile(path, []byte(script), 0o600); err != nil {
		return "", err
	}
	return path, nil
}
