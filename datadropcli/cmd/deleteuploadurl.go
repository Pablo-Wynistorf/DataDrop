package cmd

import (
	"fmt"

	"github.com/datadrop/cli/internal/api"
	"github.com/datadrop/cli/internal/config"
	"github.com/spf13/cobra"
)

var deleteUploadURLID string

var deleteUploadURLCmd = &cobra.Command{
	Use:   "delete-upload-url",
	Short: "Delete (cancel) an upload URL project",
	Long: `Delete an upload URL project by its ID. This immediately disables the link;
files already uploaded through it are kept.

Examples:
  datadrop delete-upload-url --id abc123
  datadrop delete-upload-url abc123`,
	RunE: runDeleteUploadURL,
}

func init() {
	deleteUploadURLCmd.Flags().StringVar(&deleteUploadURLID, "id", "", "Upload URL project ID")
}

func runDeleteUploadURL(cmd *cobra.Command, args []string) error {
	cfg, err := config.Load()
	if err != nil {
		return fmt.Errorf("failed to load config: %w", err)
	}

	if cfg == nil || !cfg.IsValid() {
		return fmt.Errorf("not logged in. Run 'datadrop login' first")
	}

	projectID := deleteUploadURLID
	if projectID == "" && len(args) > 0 {
		projectID = args[0]
	}
	if projectID == "" {
		return fmt.Errorf("specify a project id: datadrop delete-upload-url <id>")
	}

	client := api.NewClient(cfg)

	if err := client.DeleteUploadURL(projectID); err != nil {
		return fmt.Errorf("failed to delete upload URL: %w", err)
	}

	fmt.Printf("Deleted upload URL project %s\n", projectID)
	return nil
}
