package settings

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"

	"skill-sync-manager/internal/models"
)

// SettingsPath 返回 settings.json 的绝对路径。
// 默认放在 %APPDATA%\skill-sync-manager 下，若 APPDATA 未设置，
// 则退回 ~/.skill-sync-manager 目录。
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

// LoadSettings 返回已持久化的 AppSettings。
// 文件不存在或无法解析时，返回零值结构体（不是错误）：
// 调用方把"没有设置"视为正常的启动状态。
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
