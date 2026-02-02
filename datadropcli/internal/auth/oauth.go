package auth

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/pkg/browser"
)

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

	// Step 2: Show code and try to open browser
	fmt.Println()
	fmt.Println("┌─────────────────────────────────────────┐")
	fmt.Println("│         DataDrop CLI Login              │")
	fmt.Println("├─────────────────────────────────────────┤")
	fmt.Printf("│  Verification code: %s            │\n", loginResp.DisplayCode)
	fmt.Println("└─────────────────────────────────────────┘")
	fmt.Println()

	// Try to open browser
	browserOpened := false
	if err := browser.OpenURL(loginResp.AuthURL); err == nil {
		browserOpened = true
		fmt.Println("✓ Browser opened. Please log in and authorize the CLI.")
	}

	if !browserOpened {
		fmt.Println("Could not open browser automatically.")
		fmt.Println()
		fmt.Println("Open this URL in any browser (you can use another device):")
		fmt.Println()
		fmt.Printf("  %s\n", loginResp.AuthURL)
		fmt.Println()
		fmt.Printf("Then enter the verification code: %s\n", loginResp.DisplayCode)
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
