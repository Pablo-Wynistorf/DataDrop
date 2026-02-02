package cmd

import (
	"bufio"
	"fmt"
	"os"
	"strings"

	"github.com/datadrop/cli/internal/auth"
	"github.com/datadrop/cli/internal/config"
	"github.com/spf13/cobra"
)

var apiEndpoint string

var loginCmd = &cobra.Command{
	Use:   "login",
	Short: "Authenticate with DataDrop",
	Long:  `Opens a browser window to authenticate with DataDrop and stores the credentials locally.`,
	RunE:  runLogin,
}

func init() {
	loginCmd.Flags().StringVar(&apiEndpoint, "api", "", "API endpoint URL (e.g., https://api.example.com)")
}

func runLogin(cmd *cobra.Command, args []string) error {
	// Check if already logged in
	cfg, _ := config.Load()
	if cfg != nil && cfg.IsValid() {
		fmt.Printf("Already logged in as %s (%s)\n", cfg.Name, cfg.Email)
		fmt.Print("Do you want to re-authenticate? [y/N]: ")
		reader := bufio.NewReader(os.Stdin)
		answer, _ := reader.ReadString('\n')
		if strings.ToLower(strings.TrimSpace(answer)) != "y" {
			return nil
		}
	}

	// Prompt for API endpoint if not provided
	reader := bufio.NewReader(os.Stdin)

	if apiEndpoint == "" {
		if cfg != nil && cfg.APIEndpoint != "" {
			apiEndpoint = cfg.APIEndpoint
			fmt.Printf("Using saved API endpoint: %s\n", apiEndpoint)
		} else {
			fmt.Print("API endpoint URL: ")
			apiEndpoint, _ = reader.ReadString('\n')
			apiEndpoint = strings.TrimSpace(apiEndpoint)
		}
	}

	// Perform login via browser
	result, err := auth.Login(apiEndpoint)
	if err != nil {
		return fmt.Errorf("authentication failed: %w", err)
	}

	// Save config
	newCfg := &config.Config{
		APIEndpoint: apiEndpoint,
		IDToken:     result.Token,
		ExpiresAt:   result.ExpiresAt,
		UserID:      result.UserID,
		Email:       result.Email,
		Name:        result.Name,
	}

	if err := config.Save(newCfg); err != nil {
		return fmt.Errorf("failed to save config: %w", err)
	}

	fmt.Printf("\n✓ Logged in as %s (%s)\n", result.Name, result.Email)
	fmt.Printf("  Token expires: %s\n", result.ExpiresAt.Format("2006-01-02 15:04:05"))

	return nil
}
