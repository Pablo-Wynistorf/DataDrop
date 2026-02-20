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
	deleteFileArg  string
	deleteForce    bool
)

var deleteCmd = &cobra.Command{
	Use:   "delete",
	Short: "Delete a file",
	Long: `Delete a file from DataDrop.

Examples:
  datadrop delete --file myfile.txt
  datadrop delete --file abc12345-...
  datadrop delete --id abc123 --force`,
	RunE: runDelete,
}

func init() {
	deleteCmd.Flags().StringVar(&deleteFileArg, "file", "", "File ID or name (auto-detected)")
	deleteCmd.Flags().StringVar(&deleteFileID, "id", "", "File ID")
	deleteCmd.Flags().StringVar(&deleteFileName, "name", "", "File name")
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

	identifier, err := getFileIdentifier(deleteFileID, deleteFileName, deleteFileArg, args)
	if err != nil {
		return err
	}

	client := api.NewClient(cfg)

	fileInfo, err := resolveFileArgWithInfo(client, identifier)
	if err != nil {
		return err
	}

	if !deleteForce {
		fmt.Printf("Are you sure you want to delete '%s'? [y/N]: ", fileInfo.FileName)
		reader := bufio.NewReader(os.Stdin)
		answer, _ := reader.ReadString('\n')
		if strings.ToLower(strings.TrimSpace(answer)) != "y" {
			fmt.Println("Cancelled")
			return nil
		}
	}

	if err := client.DeleteFile(fileInfo.ID); err != nil {
		return fmt.Errorf("failed to delete file: %w", err)
	}

	fmt.Println("✓ File deletion queued")
	return nil
}
