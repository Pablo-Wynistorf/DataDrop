package cmd

import (
	"fmt"

	"github.com/datadrop/cli/internal/api"
	"github.com/datadrop/cli/internal/config"
	"github.com/spf13/cobra"
)

var (
	renameFileID   string
	renameFileName string
	renameNewName  string
)

var renameCmd = &cobra.Command{
	Use:   "rename",
	Short: "Rename a file",
	Long: `Rename a file on DataDrop.

Examples:
  datadrop rename --id abc123 --name newname.txt
  datadrop rename --file-name old.txt --name new.txt`,
	RunE: runRename,
}

func init() {
	renameCmd.Flags().StringVar(&renameFileID, "id", "", "File ID")
	renameCmd.Flags().StringVar(&renameFileName, "file-name", "", "Current file name")
	renameCmd.Flags().StringVar(&renameNewName, "name", "", "New file name")
	renameCmd.MarkFlagRequired("name")
}

func runRename(cmd *cobra.Command, args []string) error {
	cfg, err := config.Load()
	if err != nil {
		return fmt.Errorf("failed to load config: %w", err)
	}

	if cfg == nil || !cfg.IsValid() {
		return fmt.Errorf("not logged in. Run 'datadrop login' first")
	}

	if renameFileID == "" && renameFileName == "" {
		return fmt.Errorf("either --id or --file-name is required")
	}

	client := api.NewClient(cfg)

	if renameFileID == "" && renameFileName != "" {
		resolved, err := resolveFileByName(client, renameFileName)
		if err != nil {
			return err
		}
		renameFileID = resolved
	}

	if err := client.RenameFile(renameFileID, renameNewName); err != nil {
		return fmt.Errorf("failed to rename file: %w", err)
	}

	fmt.Printf("✓ Renamed to %s\n", renameNewName)
	return nil
}
