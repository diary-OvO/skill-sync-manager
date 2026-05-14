package updater

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
)

func TestCompareVersions(t *testing.T) {
	tests := []struct {
		a    string
		b    string
		want int
	}{
		{a: "v0.10.0", b: "v0.9.0", want: 1},
		{a: "0.2.0", b: "v0.2.0", want: 0},
		{a: "v1.0.0", b: "v1.0.0-beta.1", want: 1},
		{a: "v1.0.0-beta.1", b: "v1.0.0", want: -1},
		{a: "refs/tags/v2.1.0", b: "v2.0.9", want: 1},
	}

	for _, tt := range tests {
		got := compareVersions(tt.a, tt.b)
		if (got > 0 && tt.want <= 0) || (got < 0 && tt.want >= 0) || (got == 0 && tt.want != 0) {
			t.Fatalf("compareVersions(%q, %q) = %d, want sign %d", tt.a, tt.b, got, tt.want)
		}
	}
}

func TestSelectAssetPrefersExeOverZip(t *testing.T) {
	assets := []githubAsset{
		{Name: "skill-sync-manager-v0.3.0-windows-amd64.zip", BrowserDownloadURL: "https://example.test/app.zip"},
		{Name: "skill-sync-manager-v0.3.0-windows-amd64.exe", BrowserDownloadURL: "https://example.test/app.exe"},
	}

	asset, kind, ok := selectAsset(assets, "skill-sync-manager", "windows", "amd64")
	if !ok {
		t.Fatal("expected compatible asset")
	}
	if kind != "exe" {
		t.Fatalf("kind = %q, want exe", kind)
	}
	if asset.Name != "skill-sync-manager-v0.3.0-windows-amd64.exe" {
		t.Fatalf("asset = %q", asset.Name)
	}
}

func TestSelectAssetRejectsWrongArch(t *testing.T) {
	assets := []githubAsset{
		{Name: "skill-sync-manager-v0.3.0-windows-arm64.exe", BrowserDownloadURL: "https://example.test/app.exe"},
	}

	_, _, ok := selectAsset(assets, "skill-sync-manager", "windows", "amd64")
	if ok {
		t.Fatal("expected wrong-arch asset to be rejected")
	}
}

func TestDownloadFileOverwritesExistingTarget(t *testing.T) {
	body := []byte("new exe bytes")
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write(body)
	}))
	defer server.Close()

	target := filepath.Join(t.TempDir(), "skill-sync-manager.exe")
	if err := os.WriteFile(target, []byte("old bytes"), 0o600); err != nil {
		t.Fatal(err)
	}

	written, sum, err := downloadFile(
		context.Background(),
		server.URL,
		target,
		Config{AppName: "skill-sync-manager", CurrentVersion: "v0.2.0"},
	)
	if err != nil {
		t.Fatalf("downloadFile: %v", err)
	}
	if written != int64(len(body)) {
		t.Fatalf("written = %d, want %d", written, len(body))
	}
	got, err := os.ReadFile(target)
	if err != nil {
		t.Fatal(err)
	}
	if string(got) != string(body) {
		t.Fatalf("target content = %q, want %q", got, body)
	}
	wantSumBytes := sha256.Sum256(body)
	if want := hex.EncodeToString(wantSumBytes[:]); sum != want {
		t.Fatalf("sha256 = %q, want %q", sum, want)
	}
}
