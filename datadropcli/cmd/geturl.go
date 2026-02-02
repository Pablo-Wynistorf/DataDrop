package cmd

import (
	"fmt"

	"github.com/datadrop/cli/internal/api"
	"github.com/datadrop/cli/internal/config"
	"github.com/spf13/cobra"
)

var (
	fileID          string
	fileName        string
	linkExpiresIn   int
)

var getURLCmd = &cobra.Command{
	Use:   "get-url",
	Short: "Get a shareable URL for a file",
	Long: `Generate a shareable URL for a file.

Examples:
  datadrop get-url --id abc123
  datadrop get-url --name myfile.txt
  datadrop get-url --id abc123 --expires 3600`,
	RunE: runGetURL,
}

func init() {
	getURLCmd.Flags().StringVar(&fileID, "id", "", "File ID")
	getURLCmd.Flags().StringVar(&fileName, "name", "", "File name (uses first match)")
	getURLCmd.Flags().IntVar(&linkExpiresIn, "expires", 86400, "Link expiration in seconds (default 24h)")
}

func runGetURL(cmd *cobra.Command, args []string) error {
	cfg, err := config.Load()
	if err != nil {
		return fmt.Errorf("failed to load config: %w", err)
	}

	if cfg == nil || !cfg.IsValid() {
		return fmt.Errorf("not logged in. Run 'datadrop login' first")
	}

	if fileID == "" && fileName == "" {
		return fmt.Errorf("either --id or --name is required")
	}

	client := api.NewClient(cfg)

	// If name provided, find the file ID
	if fileID == "" && fileName != "" {
		files, err := client.ListFiles()
		if err != nil {
			return fmt.Errorf("failed to list files: %w", err)
		}

		for _, f := range files {
			if f.FileName == fileName {
				fileID = f.ID
				break
			}
		}

		if fileID == "" {
			return fmt.Errorf("file not found: %s", fileName)
		}
	}

	// Get share URL
	shareResp, err := client.GetShareURL(fileID, linkExpiresIn)
	if err != nil {
		return fmt.Errorf("failed to get share URL: %w", err)
	}

	fmt.Printf("Share URL: %s\n", shareResp.ShareURL)
	fmt.Printf("Type: %s\n", shareResp.Type)

	if shareResp.ExpiresAt != nil {
		fmt.Printf("Link expires: %s\n", *shareResp.ExpiresAt)
	}

	if shareResp.FileExpiresAt != nil {
		fmt.Printf("File expires: %s\n", *shareResp.FileExpiresAt)
	}

	if shareResp.MaxDownloads != nil && shareResp.DownloadsRemaining != nil {
		fmt.Printf("Downloads remaining: %d/%d\n", *shareResp.DownloadsRemaining, *shareResp.MaxDownloads)
	}

	return nil
}
