package cmd

import (
	"fmt"
	"time"

	"github.com/datadrop/cli/internal/api"
	"github.com/datadrop/cli/internal/config"
	qrcode "github.com/skip2/go-qrcode"
	"github.com/spf13/cobra"
)

var (
	uploadURLName        string
	uploadURLMaxSizeMB   int
	uploadURLExpiresIn   int
	uploadURLDescription string
	uploadURLClipboard   bool
	uploadURLShowQR      bool
)

var createUploadURLCmd = &cobra.Command{
	Use:   "create-upload-url",
	Short: "Create an upload URL for external users",
	Long: `Create a shareable upload URL that allows anyone with the link to upload files.
Files will be stored in a folder named after the project.

Examples:
  datadrop create-upload-url --name my-project
  datadrop create-upload-url --name photos --max-size 50 --expires 86400
  datadrop create-upload-url --name submissions --max-size 200 --description "Submit your files here"
  datadrop create-upload-url --name docs --clipboard`,
	RunE: runCreateUploadURL,
}

var listUploadURLsCmd = &cobra.Command{
	Use:   "list-upload-urls",
	Short: "List your upload URL projects",
	Long: `List all upload URL projects you have created.

Examples:
  datadrop list-upload-urls`,
	RunE: runListUploadURLs,
}

func init() {
	createUploadURLCmd.Flags().StringVarP(&uploadURLName, "name", "n", "", "Project name (required, used as folder name)")
	createUploadURLCmd.Flags().IntVar(&uploadURLMaxSizeMB, "max-size", 100, "Maximum file size in MB (default 100)")
	createUploadURLCmd.Flags().IntVar(&uploadURLExpiresIn, "expires", 604800, "Link expiration in seconds (default 7 days)")
	createUploadURLCmd.Flags().StringVarP(&uploadURLDescription, "description", "d", "", "Description shown on the upload page")
	createUploadURLCmd.Flags().BoolVar(&uploadURLClipboard, "clipboard", false, "Copy upload URL to clipboard")
	createUploadURLCmd.Flags().BoolVar(&uploadURLShowQR, "qr", false, "Display QR code in terminal")
	createUploadURLCmd.MarkFlagRequired("name")
}

func runCreateUploadURL(cmd *cobra.Command, args []string) error {
	cfg, err := config.Load()
	if err != nil {
		return fmt.Errorf("failed to load config: %w", err)
	}

	if cfg == nil || !cfg.IsValid() {
		return fmt.Errorf("not logged in. Run 'datadrop login' first")
	}

	client := api.NewClient(cfg)

	req := &api.CreateUploadURLRequest{
		Name:             uploadURLName,
		MaxFileSizeMB:    uploadURLMaxSizeMB,
		ExpiresInSeconds: uploadURLExpiresIn,
		Description:      uploadURLDescription,
	}

	result, err := client.CreateUploadURL(req)
	if err != nil {
		return fmt.Errorf("failed to create upload URL: %w", err)
	}

	fmt.Printf("Upload URL created!\n\n")
	fmt.Printf("  Name:          %s\n", result.Name)
	fmt.Printf("  Max file size: %d MB\n", result.MaxFileSizeMB)
	fmt.Printf("  Expires:       %s\n", result.ExpiresAt)
	fmt.Printf("  Project ID:    %s\n", result.ProjectID)
	fmt.Printf("\n  Upload URL: %s\n", result.UploadURL)
	fmt.Printf("\nShare this URL with anyone to let them upload files.\n")
	fmt.Printf("Uploaded files will appear in the /%s folder.\n", result.Name)

	if uploadURLClipboard {
		if err := copyToClipboard(result.UploadURL); err != nil {
			fmt.Printf("\nFailed to copy to clipboard: %v\n", err)
		} else {
			fmt.Println("\nURL copied to clipboard!")
		}
	}

	if uploadURLShowQR {
		qr, err := qrcode.New(result.UploadURL, qrcode.Medium)
		if err != nil {
			return fmt.Errorf("failed to generate QR code: %w", err)
		}
		fmt.Println()
		fmt.Println(qr.ToSmallString(false))
	}

	return nil
}

func runListUploadURLs(cmd *cobra.Command, args []string) error {
	cfg, err := config.Load()
	if err != nil {
		return fmt.Errorf("failed to load config: %w", err)
	}

	if cfg == nil || !cfg.IsValid() {
		return fmt.Errorf("not logged in. Run 'datadrop login' first")
	}

	client := api.NewClient(cfg)

	projects, err := client.ListUploadURLs()
	if err != nil {
		return fmt.Errorf("failed to list upload URLs: %w", err)
	}

	if len(projects) == 0 {
		fmt.Println("No upload URL projects found")
		return nil
	}

	fmt.Printf("Found %d upload URL project(s):\n\n", len(projects))

	for _, p := range projects {
		status := "active"
		if p.IsExpired {
			status = "expired"
		}

		fmt.Printf("[%s] %s\n", status, p.Name)
		fmt.Printf("   ID: %s\n", p.ID)
		fmt.Printf("   Max file size: %s\n", formatSize(p.MaxFileSizeBytes))
		fmt.Printf("   Files: %d | Total size: %s\n", p.FileCount, formatSize(p.TotalSize))

		if p.CreatedAt != "" {
			if t, err := time.Parse(time.RFC3339, p.CreatedAt); err == nil {
				fmt.Printf("   Created: %s\n", t.Format("2006-01-02 15:04:05"))
			}
		}

		if p.ExpiresAt != "" {
			if t, err := time.Parse(time.RFC3339, p.ExpiresAt); err == nil {
				fmt.Printf("   Expires: %s\n", t.Format("2006-01-02 15:04:05"))
			}
		}

		if p.Description != "" {
			fmt.Printf("   Description: %s\n", p.Description)
		}

		fmt.Println()
	}

	return nil
}
