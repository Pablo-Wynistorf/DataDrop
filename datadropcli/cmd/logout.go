package cmd

import (
	"fmt"

	"github.com/datadrop/cli/internal/config"
	"github.com/spf13/cobra"
)

var logoutCmd = &cobra.Command{
	Use:   "logout",
	Short: "Log out and remove stored credentials",
	RunE:  runLogout,
}

func runLogout(cmd *cobra.Command, args []string) error {
	cfg, err := config.Load()
	if err != nil {
		return fmt.Errorf("failed to load config: %w", err)
	}

	if cfg == nil {
		fmt.Println("Not logged in")
		return nil
	}

	if err := config.Delete(); err != nil {
		return fmt.Errorf("failed to delete config: %w", err)
	}

	fmt.Println("✓ Logged out successfully")
	return nil
}
