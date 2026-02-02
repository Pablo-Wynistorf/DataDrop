package config

import (
	"encoding/json"
	"os"
	"path/filepath"
	"time"
)

const (
	ConfigDir  = ".datadrop"
	ConfigFile = "config.json"
)

type Config struct {
	APIEndpoint string    `json:"api_endpoint"`
	IDToken     string    `json:"id_token"`
	ExpiresAt   time.Time `json:"expires_at"`
	UserID      string    `json:"user_id"`
	Email       string    `json:"email"`
	Name        string    `json:"name"`
}

func GetConfigPath() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(home, ConfigDir, ConfigFile), nil
}

func GetConfigDir() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(home, ConfigDir), nil
}

func Load() (*Config, error) {
	path, err := GetConfigPath()
	if err != nil {
		return nil, err
	}

	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, err
	}

	var cfg Config
	if err := json.Unmarshal(data, &cfg); err != nil {
		return nil, err
	}

	return &cfg, nil
}

func Save(cfg *Config) error {
	dir, err := GetConfigDir()
	if err != nil {
		return err
	}

	if err := os.MkdirAll(dir, 0700); err != nil {
		return err
	}

	path, err := GetConfigPath()
	if err != nil {
		return err
	}

	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return err
	}

	return os.WriteFile(path, data, 0600)
}

func Delete() error {
	path, err := GetConfigPath()
	if err != nil {
		return err
	}
	return os.Remove(path)
}

func (c *Config) IsValid() bool {
	if c == nil || c.IDToken == "" {
		return false
	}
	return time.Now().Before(c.ExpiresAt)
}
