package cmd

import (
	"fmt"

	"github.com/datadrop/cli/internal/api"
	"github.com/datadrop/cli/internal/config"
	"github.com/spf13/cobra"
)

var (
	convertFileArg      string
	convertFileID       string
	convertFileName     string
	convertType         string
	convertExpiresIn    int
	convertMaxDownloads int
)

var convertCmd = &cobra.Command{
	Use:   "convert",
	Short: "Convert a file between private and CDN storage",
	Long: `Convert an existing file from private to CDN storage or vice versa.

When converting to private you may set an expiry (--expires, seconds) and a
download limit (--max-downloads). Converting to CDN makes the file public and
permanent, dropping any expiry or download limit.

Examples:
  datadrop convert myfile.txt --type cdn
  datadrop convert myfile.txt --type private --expires 86400 --max-downloads 5
  datadrop convert --id abc123 --type private`,
	RunE: runConvert,
}

func init() {
	convertCmd.Flags().StringVar(&convertFileArg, "file", "", "File ID or name (auto-detected)")
	convertCmd.Flags().StringVar(&convertFileID, "id", "", "File ID")
	convertCmd.Flags().StringVar(&convertFileName, "file-name", "", "Current file name")
	convertCmd.Flags().StringVarP(&convertType, "type", "t", "", "Target type: 'cdn' or 'private' (required)")
	convertCmd.Flags().IntVarP(&convertExpiresIn, "expires", "e", 0, "Expiration in seconds when converting to private")
	convertCmd.Flags().IntVarP(&convertMaxDownloads, "max-downloads", "m", 0, "Max downloads when converting to private")
	convertCmd.MarkFlagRequired("type")
}

func runConvert(cmd *cobra.Command, args []string) error {
	cfg, err := config.Load()
	if err != nil {
		return fmt.Errorf("failed to load config: %w", err)
	}

	if cfg == nil || !cfg.IsValid() {
		return fmt.Errorf("not logged in. Run 'datadrop login' first")
	}

	if convertType != "cdn" && convertType != "private" {
		return fmt.Errorf("invalid type %q: must be 'cdn' or 'private'", convertType)
	}

	identifier, err := getFileIdentifier(convertFileID, convertFileName, convertFileArg, args)
	if err != nil {
		return err
	}

	client := api.NewClient(cfg)

	resolvedID, err := resolveFileArg(client, identifier)
	if err != nil {
		return err
	}

	req := &api.ConvertRequest{UploadType: convertType}
	if convertType == "private" {
		if convertExpiresIn > 0 {
			req.ExpiresInSeconds = &convertExpiresIn
		}
		if convertMaxDownloads > 0 {
			req.MaxDownloads = &convertMaxDownloads
		}
	}

	result, err := client.ConvertFile(resolvedID, req)
	if err != nil {
		return fmt.Errorf("failed to convert file: %w", err)
	}

	fmt.Printf("Converted file to %s\n", result.UploadType)
	if result.CdnURL != nil && *result.CdnURL != "" {
		fmt.Printf("  CDN URL: %s\n", *result.CdnURL)
	}
	if result.ExpiresAt != nil && *result.ExpiresAt != "" {
		fmt.Printf("  Expires: %s\n", *result.ExpiresAt)
	}
	if result.MaxDownloads != nil {
		fmt.Printf("  Max downloads: %d\n", *result.MaxDownloads)
	}
	return nil
}
