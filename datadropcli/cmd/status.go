package cmd

import (
	"fmt"

	"github.com/datadrop/cli/internal/api"
	"github.com/datadrop/cli/internal/config"
	"github.com/spf13/cobra"
)

var statusCmd = &cobra.Command{
	Use:   "status",
	Short: "Show current login status and account info",
	RunE:  runStatus,
}

func runStatus(cmd *cobra.Command, args []string) error {
	cfg, err := config.Load()
	if err != nil {
		return fmt.Errorf("failed to load config: %w", err)
	}

	if cfg == nil {
		fmt.Println("Not logged in")
		fmt.Println("\nRun 'datadrop login' to authenticate")
		return nil
	}

	if !cfg.IsValid() {
		fmt.Println("Session expired")
		fmt.Printf("  Was logged in as: %s (%s)\n", cfg.Name, cfg.Email)
		fmt.Println("\nRun 'datadrop login' to re-authenticate")
		return nil
	}

	fmt.Println("Logged in")
	fmt.Printf("  User: %s (%s)\n", cfg.Name, cfg.Email)
	fmt.Printf("  API: %s\n", cfg.APIEndpoint)
	fmt.Printf("  Token expires: %s\n", cfg.ExpiresAt.Format("2006-01-02 15:04:05"))

	// Verify with server and get permissions
	client := api.NewClient(cfg)
	user, err := client.Verify()
	if err != nil {
		fmt.Printf("\n⚠ Could not verify with server: %s\n", err)
		return nil
	}

	fmt.Println("\nPermissions:")
	fmt.Printf("  CDN uploads: %v\n", user.CanUploadCdn)
	fmt.Printf("  Private uploads: %v\n", user.CanUploadFile)
	fmt.Printf("  Max file size: %s\n", formatSize(user.MaxFileSizeBytes))

	if len(user.Roles) > 0 {
		fmt.Printf("  Roles: %v\n", user.Roles)
	}

	return nil
}
