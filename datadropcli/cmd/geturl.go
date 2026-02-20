package cmd

import (
	"fmt"

	"github.com/datadrop/cli/internal/api"
	"github.com/datadrop/cli/internal/config"
	qrcode "github.com/skip2/go-qrcode"
	"github.com/spf13/cobra"
)

var (
	fileID        string
	fileName      string
	linkExpiresIn int
	showQR        bool
)

var getURLCmd = &cobra.Command{
	Use:   "get-url",
	Short: "Get a shareable URL for a file",
	Long: `Generate a shareable URL for a file.

Examples:
  datadrop get-url --id abc123
  datadrop get-url --name myfile.txt
  datadrop get-url --id abc123 --expires 3600
  datadrop get-url --id abc123 --qr`,
	RunE: runGetURL,
}

func init() {
	getURLCmd.Flags().StringVar(&fileID, "id", "", "File ID")
	getURLCmd.Flags().StringVar(&fileName, "name", "", "File name")
	getURLCmd.Flags().IntVar(&linkExpiresIn, "expires", 86400, "Link expiration in seconds (default 24h)")
	getURLCmd.Flags().BoolVar(&showQR, "qr", false, "Display QR code in terminal")
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

	if fileID == "" && fileName != "" {
		resolved, err := resolveFileByName(client, fileName)
		if err != nil {
			return err
		}
		fileID = resolved
	}

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

	if showQR {
		qr, err := qrcode.New(shareResp.ShareURL, qrcode.Medium)
		if err != nil {
			return fmt.Errorf("failed to generate QR code: %w", err)
		}
		fmt.Println()
		fmt.Println(qr.ToSmallString(false))
	}

	return nil
}
