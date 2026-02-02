package cmd

import (
	"fmt"
	"time"

	"github.com/datadrop/cli/internal/api"
	"github.com/datadrop/cli/internal/config"
	"github.com/spf13/cobra"
)

var listType string

var listCmd = &cobra.Command{
	Use:   "list",
	Short: "List all uploaded files",
	Long: `List all files you have uploaded to DataDrop.

Examples:
  datadrop list
  datadrop list --type cdn
  datadrop list --type private`,
	RunE: runList,
}

func init() {
	listCmd.Flags().StringVarP(&listType, "type", "t", "", "Filter by type: 'cdn' or 'private'")
}

func runList(cmd *cobra.Command, args []string) error {
	cfg, err := config.Load()
	if err != nil {
		return fmt.Errorf("failed to load config: %w", err)
	}

	if cfg == nil || !cfg.IsValid() {
		return fmt.Errorf("not logged in. Run 'datadrop login' first")
	}

	client := api.NewClient(cfg)

	files, err := client.ListFiles()
	if err != nil {
		return fmt.Errorf("failed to list files: %w", err)
	}

	if len(files) == 0 {
		fmt.Println("No files found")
		return nil
	}

	// Filter by type if specified
	if listType != "" {
		filtered := make([]api.FileInfo, 0)
		for _, f := range files {
			if f.UploadType == listType {
				filtered = append(filtered, f)
			}
		}
		files = filtered
	}

	if len(files) == 0 {
		fmt.Printf("No %s files found\n", listType)
		return nil
	}

	fmt.Printf("Found %d file(s):\n\n", len(files))

	for _, f := range files {
		typeIcon := "🔒"
		if f.UploadType == "cdn" {
			typeIcon = "🌐"
		}

		statusIcon := "✓"
		if f.Status != "uploaded" {
			statusIcon = "⏳"
		}
		if f.IsExpired {
			statusIcon = "⏰"
		}

		fmt.Printf("%s %s %s\n", typeIcon, statusIcon, f.FileName)
		fmt.Printf("   ID: %s\n", f.ID)
		fmt.Printf("   Size: %s | Type: %s | Status: %s\n", formatSize(f.FileSize), f.UploadType, f.Status)

		if f.CreatedAt != "" {
			if t, err := time.Parse(time.RFC3339, f.CreatedAt); err == nil {
				fmt.Printf("   Created: %s\n", t.Format("2006-01-02 15:04:05"))
			}
		}

		if f.ExpiresAt != nil {
			if t, err := time.Parse(time.RFC3339, *f.ExpiresAt); err == nil {
				fmt.Printf("   Expires: %s\n", t.Format("2006-01-02 15:04:05"))
			}
		}

		if f.MaxDownloads != nil && f.DownloadsRemaining != nil {
			fmt.Printf("   Downloads: %d/%d remaining\n", *f.DownloadsRemaining, *f.MaxDownloads)
		}

		if f.CdnURL != nil {
			fmt.Printf("   CDN URL: %s\n", *f.CdnURL)
		}

		fmt.Println()
	}

	return nil
}
