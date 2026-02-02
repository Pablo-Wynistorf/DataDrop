package cmd

import (
	"bufio"
	"fmt"
	"os"
	"strings"

	"github.com/datadrop/cli/internal/api"
	"github.com/datadrop/cli/internal/config"
	"github.com/spf13/cobra"
)

var (
	deleteFileID   string
	deleteFileName string
	deleteForce    bool
)

var deleteCmd = &cobra.Command{
	Use:   "delete",
	Short: "Delete a file",
	Long: `Delete a file from DataDrop.

Examples:
  datadrop delete --id abc123
  datadrop delete --name myfile.txt
  datadrop delete --id abc123 --force`,
	RunE: runDelete,
}

func init() {
	deleteCmd.Flags().StringVar(&deleteFileID, "id", "", "File ID")
	deleteCmd.Flags().StringVar(&deleteFileName, "name", "", "File name (uses first match)")
	deleteCmd.Flags().BoolVarP(&deleteForce, "force", "f", false, "Skip confirmation")
}

func runDelete(cmd *cobra.Command, args []string) error {
	cfg, err := config.Load()
	if err != nil {
		return fmt.Errorf("failed to load config: %w", err)
	}

	if cfg == nil || !cfg.IsValid() {
		return fmt.Errorf("not logged in. Run 'datadrop login' first")
	}

	if deleteFileID == "" && deleteFileName == "" {
		return fmt.Errorf("either --id or --name is required")
	}

	client := api.NewClient(cfg)

	// If name provided, find the file ID
	var targetFile *api.FileInfo
	if deleteFileID == "" && deleteFileName != "" {
		files, err := client.ListFiles()
		if err != nil {
			return fmt.Errorf("failed to list files: %w", err)
		}

		for _, f := range files {
			if f.FileName == deleteFileName {
				deleteFileID = f.ID
				targetFile = &f
				break
			}
		}

		if deleteFileID == "" {
			return fmt.Errorf("file not found: %s", deleteFileName)
		}
	}

	// Confirm deletion
	if !deleteForce {
		name := deleteFileName
		if targetFile != nil {
			name = targetFile.FileName
		}
		fmt.Printf("Are you sure you want to delete '%s'? [y/N]: ", name)
		reader := bufio.NewReader(os.Stdin)
		answer, _ := reader.ReadString('\n')
		if strings.ToLower(strings.TrimSpace(answer)) != "y" {
			fmt.Println("Cancelled")
			return nil
		}
	}

	if err := client.DeleteFile(deleteFileID); err != nil {
		return fmt.Errorf("failed to delete file: %w", err)
	}

	fmt.Println("✓ File deletion queued")
	return nil
}
