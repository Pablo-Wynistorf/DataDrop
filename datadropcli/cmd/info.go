package cmd

import (
	"fmt"

	"github.com/datadrop/cli/internal/api"
	"github.com/datadrop/cli/internal/config"
	"github.com/spf13/cobra"
)

var (
	infoFileID   string
	infoFileName string
	infoFileArg  string
)

var infoCmd = &cobra.Command{
	Use:   "info",
	Short: "Show detailed file information",
	Long: `Display metadata for a file.

Examples:
  datadrop info --file myfile.txt
  datadrop info --file abc12345-...
  datadrop info --id abc123`,
	RunE: runInfo,
}

func init() {
	infoCmd.Flags().StringVar(&infoFileArg, "file", "", "File ID or name (auto-detected)")
	infoCmd.Flags().StringVar(&infoFileID, "id", "", "File ID")
	infoCmd.Flags().StringVar(&infoFileName, "name", "", "File name")
}

func runInfo(cmd *cobra.Command, args []string) error {
	cfg, err := config.Load()
	if err != nil {
		return fmt.Errorf("failed to load config: %w", err)
	}

	if cfg == nil || !cfg.IsValid() {
		return fmt.Errorf("not logged in. Run 'datadrop login' first")
	}

	identifier, err := getFileIdentifier(infoFileID, infoFileName, infoFileArg, args)
	if err != nil {
		return err
	}

	client := api.NewClient(cfg)

	file, err := resolveFileArgWithInfo(client, identifier)
	if err != nil {
		return err
	}

	fmt.Printf("  Name:       %s\n", file.FileName)
	fmt.Printf("  ID:         %s\n", file.ID)
	fmt.Printf("  Size:       %s\n", formatSize(file.FileSize))
	fmt.Printf("  Type:       %s\n", file.FileType)
	fmt.Printf("  Upload:     %s\n", file.UploadType)
	fmt.Printf("  Status:     %s\n", file.Status)
	fmt.Printf("  Created:    %s\n", file.CreatedAt)

	if file.ExpiresAt != nil {
		fmt.Printf("  Expires:    %s\n", *file.ExpiresAt)
	}

	if file.IsExpired {
		fmt.Printf("  Expired:    yes\n")
	}

	if file.CdnURL != nil {
		fmt.Printf("  CDN URL:    %s\n", *file.CdnURL)
	}

	if file.MaxDownloads != nil {
		remaining := 0
		if file.DownloadsRemaining != nil {
			remaining = *file.DownloadsRemaining
		}
		fmt.Printf("  Downloads:  %d/%d remaining\n", remaining, *file.MaxDownloads)
	}

	return nil
}
