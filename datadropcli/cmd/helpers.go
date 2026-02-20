package cmd

import (
	"bufio"
	"fmt"
	"os"
	"os/exec"
	"regexp"
	"runtime"
	"strconv"
	"strings"

	"github.com/datadrop/cli/internal/api"
)

var uuidRegex = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)

// isUUID returns true if the string looks like a UUID v4.
func isUUID(s string) bool {
	return uuidRegex.MatchString(s)
}

// resolveFileArg takes a value that could be either a UUID or a file name,
// auto-detects which it is, and returns the file ID.
func resolveFileArg(client *api.Client, value string) (string, error) {
	if isUUID(value) {
		return value, nil
	}
	return resolveFileByName(client, value)
}

// resolveFileArgWithInfo is like resolveFileArg but returns the full FileInfo.
func resolveFileArgWithInfo(client *api.Client, value string) (*api.FileInfo, error) {
	if isUUID(value) {
		files, err := client.ListFiles()
		if err != nil {
			return nil, fmt.Errorf("failed to list files: %w", err)
		}
		for _, f := range files {
			if f.ID == value {
				return &f, nil
			}
		}
		return nil, fmt.Errorf("file not found: %s", value)
	}
	return resolveFileByNameWithInfo(client, value)
}

// resolveFileByName finds a file ID by name. If multiple files share the same
// name, it presents an interactive picker so the user can choose.
func resolveFileByName(client *api.Client, name string) (string, error) {
	f, err := resolveFileByNameWithInfo(client, name)
	if err != nil {
		return "", err
	}
	return f.ID, nil
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
			return &matches[idx-1], nil
		}
		fmt.Println("Invalid selection, try again.")
	}
}

// getFileIdentifier consolidates positional args, --id, --name/--file-name, and --file flags.
func getFileIdentifier(id, name, file string, args []string) (string, error) {
	if len(args) > 0 {
		return args[0], nil
	}
	if file != "" {
		return file, nil
	}
	if id != "" {
		return id, nil
	}
	if name != "" {
		return name, nil
	}
	return "", fmt.Errorf("specify a file: datadrop <command> <id-or-name>")
}

// copyToClipboard copies text to the system clipboard.
func copyToClipboard(text string) error {
	switch runtime.GOOS {
	case "darwin":
		cmd := exec.Command("pbcopy")
		cmd.Stdin = strings.NewReader(text)
		return cmd.Run()
	case "linux":
		for _, tool := range []string{"xclip", "xsel"} {
			if _, err := exec.LookPath(tool); err == nil {
				var cmd *exec.Cmd
				if tool == "xclip" {
					cmd = exec.Command("xclip", "-selection", "clipboard")
				} else {
					cmd = exec.Command("xsel", "--clipboard", "--input")
				}
				cmd.Stdin = strings.NewReader(text)
				return cmd.Run()
			}
		}
		return fmt.Errorf("no clipboard tool found (install xclip or xsel)")
	case "windows":
		cmd := exec.Command("cmd", "/c", "clip")
		cmd.Stdin = strings.NewReader(text)
		return cmd.Run()
	default:
		return fmt.Errorf("clipboard not supported on %s", runtime.GOOS)
	}
}
