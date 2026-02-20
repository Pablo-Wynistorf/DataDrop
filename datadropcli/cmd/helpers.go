package cmd

import (
	"bufio"
	"fmt"
	"os"
	"strconv"
	"strings"

	"github.com/datadrop/cli/internal/api"
)

// resolveFileByName finds a file ID by name. If multiple files share the same
// name, it presents an interactive picker so the user can choose.
func resolveFileByName(client *api.Client, name string) (string, error) {
	files, err := client.ListFiles()
	if err != nil {
		return "", fmt.Errorf("failed to list files: %w", err)
	}

	var matches []api.FileInfo
	for _, f := range files {
		if f.FileName == name {
			matches = append(matches, f)
		}
	}

	if len(matches) == 0 {
		return "", fmt.Errorf("file not found: %s", name)
	}

	if len(matches) == 1 {
		return matches[0].ID, nil
	}

	// Multiple matches — interactive selection
	fmt.Printf("Multiple files named '%s' found:\n\n", name)
	for i, f := range matches {
		size := formatSize(f.FileSize)
		fmt.Printf("  [%d] %s  (%s, %s, %s)\n", i+1, f.ID, f.UploadType, size, f.CreatedAt)
	}
	fmt.Println()

	reader := bufio.NewReader(os.Stdin)
	for {
		fmt.Printf("Select file [1-%d]: ", len(matches))
		input, _ := reader.ReadString('\n')
		input = strings.TrimSpace(input)

		idx, err := strconv.Atoi(input)
		if err == nil && idx >= 1 && idx <= len(matches) {
			return matches[idx-1].ID, nil
		}
		fmt.Println("Invalid selection, try again.")
	}
}

// resolveFileByNameWithInfo is like resolveFileByName but also returns the FileInfo.
func resolveFileByNameWithInfo(client *api.Client, name string) (*api.FileInfo, error) {
	files, err := client.ListFiles()
	if err != nil {
		return nil, fmt.Errorf("failed to list files: %w", err)
	}

	var matches []api.FileInfo
	for _, f := range files {
		if f.FileName == name {
			matches = append(matches, f)
		}
	}

	if len(matches) == 0 {
		return nil, fmt.Errorf("file not found: %s", name)
	}

	if len(matches) == 1 {
		return &matches[0], nil
	}

	fmt.Printf("Multiple files named '%s' found:\n\n", name)
	for i, f := range matches {
		size := formatSize(f.FileSize)
		fmt.Printf("  [%d] %s  (%s, %s, %s)\n", i+1, f.ID, f.UploadType, size, f.CreatedAt)
	}
	fmt.Println()

	reader := bufio.NewReader(os.Stdin)
	for {
		fmt.Printf("Select file [1-%d]: ", len(matches))
		input, _ := reader.ReadString('\n')
		input = strings.TrimSpace(input)

		idx, err := strconv.Atoi(input)
		if err == nil && idx >= 1 && idx <= len(matches) {
			return &matches[idx-1], nil
		}
		fmt.Println("Invalid selection, try again.")
	}
}

// copyToClipboard copies text to the system clipboard.
func copyToClipboard(text string) error {
	return copyToClipboardOS(text)
}
