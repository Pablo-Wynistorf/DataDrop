package auth

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"runtime"
	"strings"
	"time"

	"github.com/pkg/browser"
)

// hasGUIBrowser checks if a real GUI browser is available (not terminal browsers)
func hasGUIBrowser() bool {
	switch runtime.GOOS {
	case "darwin":
		// macOS always has a GUI browser available if running with a display
		return os.Getenv("DISPLAY") != "" || os.Getenv("TERM_PROGRAM") != ""
	case "windows":
		// Windows always has a default browser
		return true
	default:
		// Linux/Unix: check for DISPLAY and common GUI browsers
		if os.Getenv("DISPLAY") == "" && os.Getenv("WAYLAND_DISPLAY") == "" {
			return false
		}
		// Check for common GUI browsers (exclude terminal browsers)
		guiBrowsers := []string{
			"xdg-open", "firefox", "google-chrome", "chromium", "chromium-browser",
			"brave", "brave-browser", "opera", "vivaldi", "epiphany", "konqueror",
			"microsoft-edge", "safari",
		}
		for _, b := range guiBrowsers {
			if _, err := exec.LookPath(b); err == nil {
				return true
			}
		}
		return false
	}
}

type CLILoginResponse struct {
	Code        string `json:"code"`
	DisplayCode string `json:"displayCode"`
	AuthURL     string `json:"authUrl"`
	ExpiresIn   int    `json:"expiresIn"`
}

type CLIPollResponse struct {
	Status    string `json:"status"`
	Token     string `json:"token,omitempty"`
	ExpiresAt string `json:"expiresAt,omitempty"`
	User      *struct {
		UserID string `json:"userId"`
		Email  string `json:"email"`
		Name   string `json:"name"`
	} `json:"user,omitempty"`
	Error string `json:"error,omitempty"`
}

type AuthResult struct {
	Token     string
	ExpiresAt time.Time
	UserID    string
	Email     string
	Name      string
}

func Login(apiEndpoint string) (*AuthResult, error) {
	// Ensure endpoint ends without trailing slash
	apiEndpoint = strings.TrimSuffix(apiEndpoint, "/")
	
	// Ensure endpoint includes /api path
	if !strings.HasSuffix(apiEndpoint, "/api") {
		apiEndpoint = apiEndpoint + "/api"
	}
	
	// Step 1: Initiate CLI login
	resp, err := http.Post(apiEndpoint+"/auth/cli/login", "application/json", nil)
	if err != nil {
		return nil, fmt.Errorf("failed to initiate login: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("failed to initiate login: %s - %s", resp.Status, string(body))
	}

	var loginResp CLILoginResponse
	if err := json.NewDecoder(resp.Body).Decode(&loginResp); err != nil {
		return nil, fmt.Errorf("failed to parse login response: %w", err)
	}

	// Step 2: Show code and URL (always displayed for use on another device)
	fmt.Println()
	fmt.Println("┌─────────────────────────────────────────┐")
	fmt.Println("│         DataDrop CLI Login              │")
	fmt.Println("├─────────────────────────────────────────┤")
	fmt.Printf("│  Verification code: %s            │\n", loginResp.DisplayCode)
	fmt.Println("└─────────────────────────────────────────┘")
	fmt.Println()
	fmt.Println("Open this URL in a browser (or use another device):")
	fmt.Println()
	fmt.Printf("  %s\n", loginResp.AuthURL)
	fmt.Println()

	// Try to open a real GUI browser (skip terminal browsers)
	if hasGUIBrowser() {
		if err := browser.OpenURL(loginResp.AuthURL); err == nil {
			fmt.Println("✓ Browser opened automatically.")
		}
	}

	fmt.Println("Waiting for authorization...")

	// Step 3: Poll for completion
	client := &http.Client{Timeout: 10 * time.Second}
	pollURL := apiEndpoint + "/auth/cli/login/" + loginResp.Code
	deadline := time.Now().Add(time.Duration(loginResp.ExpiresIn) * time.Second)

	for time.Now().Before(deadline) {
		pollResp, err := client.Get(pollURL)
		if err != nil {
			time.Sleep(2 * time.Second)
			continue
		}

		var result CLIPollResponse
		if err := json.NewDecoder(pollResp.Body).Decode(&result); err != nil {
			pollResp.Body.Close()
			time.Sleep(2 * time.Second)
			continue
		}
		pollResp.Body.Close()

		if result.Status == "authorized" && result.Token != "" {
			expiresAt, _ := time.Parse(time.RFC3339, result.ExpiresAt)
			return &AuthResult{
				Token:     result.Token,
				ExpiresAt: expiresAt,
				UserID:    result.User.UserID,
				Email:     result.User.Email,
				Name:      result.User.Name,
			}, nil
		}

		if result.Error != "" {
			return nil, fmt.Errorf("authorization failed: %s", result.Error)
		}

		time.Sleep(2 * time.Second)
	}

	return nil, fmt.Errorf("authorization timeout - please try again")
}
