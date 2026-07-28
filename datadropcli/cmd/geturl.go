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
	fileArg       string
	linkExpiresIn int
	showQR        bool
)

var getURLCmd = &cobra.Command{
	Use:   "get-url",
	Short: "Get a shareable URL for a file",
	Long: `Generate a shareable URL for a file.

Examples:
  datadrop get-url --file myfile.txt
  datadrop get-url --file abc12345-...
  datadrop get-url --id abc123 --expires 3600
  datadrop get-url --file myfile.txt --qr`,
	RunE: runGetURL,
}

var shareCmd = &cobra.Command{
	Use:   "share",
	Short: "Share a file (alias for get-url)",
	Long: `Generate a shareable URL for a file.

Examples:
  datadrop share --file myfile.txt
  datadrop share --file abc123 --qr`,
	RunE: runGetURL,
}

func init() {
	for _, cmd := range []*cobra.Command{getURLCmd, shareCmd} {
		cmd.Flags().StringVar(&fileArg, "file", "", "File ID or name (auto-detected)")
		cmd.Flags().StringVar(&fileID, "id", "", "File ID")
		cmd.Flags().StringVar(&fileName, "name", "", "File name")
		cmd.Flags().IntVar(&linkExpiresIn, "expires", 86400, "Link expiration in seconds (default 24h)")
		cmd.Flags().BoolVar(&showQR, "qr", false, "Display QR code in terminal")
	}
}

func runGetURL(cmd *cobra.Command, args []string) error {
	cfg, err := config.Load()
	if err != nil {
		return fmt.Errorf("failed to load config: %w", err)
	}

	if cfg == nil || !cfg.IsValid() {
		return fmt.Errorf("not logged in. Run 'datadrop login' first")
	}

	identifier, err := getFileIdentifier(fileID, fileName, fileArg, args)
	if err != nil {
		return err
	}

	client := api.NewClient(cfg)

	resolvedID, err := resolveFileArg(client, identifier)
	if err != nil {
		return err
	}

	shareResp, err := client.GetShareURL(resolvedID, linkExpiresIn)
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
		// ToString renders each module as two full-width characters by one line,
		// which stays square in terminals. ToSmallString packs two rows per line
		// using half-blocks and comes out rectangular on most terminals.
		fmt.Println(qr.ToString(false))
	}

	return nil
}
