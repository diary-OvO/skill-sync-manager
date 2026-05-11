package settings

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"

	"skill-sync-manager/internal/models"
)

// SettingsPath returns the absolute path to settings.json under
// %APPDATA%\skill-sync-manager, falling back to ~/.skill-sync-manager.
func SettingsPath() (string, error) {
	if appdata := os.Getenv("APPDATA"); appdata != "" {
		return filepath.Join(appdata, "skill-sync-manager", "settings.json"), nil
	}
	home, err := os.UserHomeDir()
	if err != nil || home == "" {
		return "", errors.New("could not resolve APPDATA or user home directory")
	}
	return filepath.Join(home, ".skill-sync-manager", "settings.json"), nil
}

// LoadSettings returns the persisted AppSettings, or a zero-value struct
// (not an error) if the file doesn't exist or can't be parsed. Callers treat
// "no settings" as a normal startup state.
func LoadSettings() (models.AppSettings, error) {
	path, err := SettingsPath()
	if err != nil {
		return models.AppSettings{}, nil
	}
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return models.AppSettings{}, nil
		}
		return models.AppSettings{}, nil
	}
	var parsed models.AppSettings
	if err := json.Unmarshal(data, &parsed); err != nil {
		return models.AppSettings{}, nil
	}
	return parsed, nil
}

func SaveSettings(settings models.AppSettings) error {
	path, err := SettingsPath()
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	data, err := json.MarshalIndent(settings, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0o644)
}
