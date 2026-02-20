package cmd

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"runtime"
	"strings"

	"github.com/spf13/cobra"
)

const githubRepo = "pablo-wynistorf/datadrop"

type githubRelease struct {
	TagName string `json:"tag_name"`
}

var updateCmd = &cobra.Command{
	Use:   "update",
	Short: "Update DataDrop CLI to the latest version",
	RunE:  runUpdate,
}

func runUpdate(cmd *cobra.Command, args []string) error {
	fmt.Println("Checking for updates...")

	// Fetch latest release from GitHub
	resp, err := http.Get("https://api.github.com/repos/" + githubRepo + "/releases/latest")
	if err != nil {
		return fmt.Errorf("failed to check for updates: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("failed to check for updates: %s", resp.Status)
	}

	var release githubRelease
	if err := json.NewDecoder(resp.Body).Decode(&release); err != nil {
		return fmt.Errorf("failed to parse release info: %w", err)
	}

	latest := strings.TrimPrefix(release.TagName, "v")
	current := strings.TrimPrefix(version, "v")

	if current != "dev" && latest == current {
		fmt.Printf("Already on the latest version (%s)\n", version)
		return nil
	}

	fmt.Printf("Current: %s → Latest: %s\n", version, release.TagName)

	// Determine binary name for this platform
	goos := runtime.GOOS
	goarch := runtime.GOARCH
	binaryName := fmt.Sprintf("datadrop-%s-%s", goos, goarch)
	if goos == "windows" {
		binaryName += ".exe"
	}

	downloadURL := fmt.Sprintf("https://github.com/%s/releases/download/%s/%s", githubRepo, release.TagName, binaryName)

	fmt.Printf("Downloading %s...\n", binaryName)

	binResp, err := http.Get(downloadURL)
	if err != nil {
		return fmt.Errorf("failed to download update: %w", err)
	}
	defer binResp.Body.Close()

	if binResp.StatusCode != http.StatusOK {
		return fmt.Errorf("failed to download binary: %s", binResp.Status)
	}

	// Write to a temp file next to the current executable
	execPath, err := os.Executable()
	if err != nil {
		return fmt.Errorf("failed to determine executable path: %w", err)
	}

	tmpFile, err := os.CreateTemp("", "datadrop-update-*")
	if err != nil {
		return fmt.Errorf("failed to create temp file: %w", err)
	}
	tmpPath := tmpFile.Name()

	if _, err := io.Copy(tmpFile, binResp.Body); err != nil {
		tmpFile.Close()
		os.Remove(tmpPath)
		return fmt.Errorf("failed to write update: %w", err)
	}
	tmpFile.Close()

	// Make executable
	if err := os.Chmod(tmpPath, 0755); err != nil {
		os.Remove(tmpPath)
		return fmt.Errorf("failed to set permissions: %w", err)
	}

	// Replace current binary
	if err := os.Rename(tmpPath, execPath); err != nil {
		// Rename can fail across filesystems or due to permissions — try copy fallback
		os.Remove(tmpPath)
		return fmt.Errorf("failed to replace binary (you may need sudo): %w", err)
	}

	fmt.Printf("\n✓ Updated to %s\n", release.TagName)
	return nil
}
