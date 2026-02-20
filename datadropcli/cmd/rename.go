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
	renameFileArg  string
	renameNewName  string
)

var renameCmd = &cobra.Command{
	Use:   "rename",
	Short: "Rename a file",
	Long: `Rename a file on DataDrop.

Examples:
  datadrop rename --file myfile.txt --name newname.txt
  datadrop rename --file abc12345-... --name newname.txt
  datadrop rename --id abc123 --name newname.txt`,
	RunE: runRename,
}

func init() {
	renameCmd.Flags().StringVar(&renameFileArg, "file", "", "File ID or name (auto-detected)")
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

	identifier, err := getFileIdentifier(renameFileID, renameFileName, renameFileArg, args)
	if err != nil {
		return err
	}

	client := api.NewClient(cfg)

	resolvedID, err := resolveFileArg(client, identifier)
	if err != nil {
		return err
	}

	if err := client.RenameFile(resolvedID, renameNewName); err != nil {
		return fmt.Errorf("failed to rename file: %w", err)
	}

	fmt.Printf("✓ Renamed to %s\n", renameNewName)
	return nil
}
