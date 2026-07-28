package cmd

import (
	"encoding/json"
	"fmt"
	"os"
	"strings"
	"text/tabwriter"
	"time"

	"github.com/datadrop/cli/internal/api"
	"github.com/datadrop/cli/internal/config"
	"github.com/spf13/cobra"
)

var (
	listType   string
	listOutput string
)

var listCmd = &cobra.Command{
	Use:   "list",
	Short: "List all uploaded files",
	Long: `List all files you have uploaded to DataDrop.

Output formats (--output/-o):
  table      Compact aligned table (default)
  detailed   One block per file with all fields
  json       Raw JSON array

Examples:
  datadrop list
  datadrop list --type cdn
  datadrop list -o detailed
  datadrop list -o json`,
	Args:      cobra.MaximumNArgs(1),
	ValidArgs: []string{"table", "detailed", "json"},
	RunE:      runList,
}

func init() {
	listCmd.Flags().StringVarP(&listType, "type", "t", "", "Filter by type: 'cdn' or 'private'")
	listCmd.Flags().StringVarP(&listOutput, "output", "o", "table", "Output format: 'table', 'detailed', or 'json'")
}

func runList(cmd *cobra.Command, args []string) error {
	// Allow the format as a positional arg too, e.g. "datadrop list table".
	if len(args) > 0 {
		listOutput = args[0]
	}
	format := strings.ToLower(strings.TrimSpace(listOutput))
	switch format {
	case "", "table":
		format = "table"
	case "detailed", "wide", "json":
		// ok
	default:
		return fmt.Errorf("invalid output format %q: use 'table', 'detailed', or 'json'", listOutput)
	}

	cfg, err := config.Load()
	if err != nil {
		return fmt.Errorf("failed to load config: %w", err)
	}

	if cfg == nil || !cfg.IsValid() {
		return fmt.Errorf("not logged in. Run 'datadrop login' first")
	}

	client := api.NewClient(cfg)

	files, err := client.ListFiles()
	if err != nil {
		return fmt.Errorf("failed to list files: %w", err)
	}

	// Filter by type if specified
	if listType != "" {
		filtered := make([]api.FileInfo, 0)
		for _, f := range files {
			if f.UploadType == listType {
				filtered = append(filtered, f)
			}
		}
		files = filtered
	}

	switch format {
	case "json":
		return printFilesJSON(files)
	case "detailed", "wide":
		return printFilesDetailed(files)
	default:
		return printFilesTable(files)
	}
}

func printFilesJSON(files []api.FileInfo) error {
	// Always emit a valid JSON array, even when empty.
	if files == nil {
		files = []api.FileInfo{}
	}
	enc := json.NewEncoder(os.Stdout)
	enc.SetIndent("", "  ")
	return enc.Encode(files)
}

func printFilesTable(files []api.FileInfo) error {
	if len(files) == 0 {
		fmt.Println(noFilesMessage())
		return nil
	}

	w := tabwriter.NewWriter(os.Stdout, 0, 4, 2, ' ', 0)
	fmt.Fprintln(w, "NAME\tTYPE\tSTATUS\tSIZE\tCREATED\tID")
	for _, f := range files {
		status := f.Status
		if f.IsExpired {
			status = "expired"
		}
		fmt.Fprintf(w, "%s\t%s\t%s\t%s\t%s\t%s\n",
			truncate(f.FileName, 40),
			f.UploadType,
			status,
			formatSize(f.FileSize),
			shortTime(f.CreatedAt),
			f.ID,
		)
	}
	return w.Flush()
}

func printFilesDetailed(files []api.FileInfo) error {
	if len(files) == 0 {
		fmt.Println(noFilesMessage())
		return nil
	}

	fmt.Printf("Found %d file(s):\n\n", len(files))

	for _, f := range files {
		status := f.Status
		if f.IsExpired {
			status = "expired"
		}

		fmt.Printf("%s  [%s, %s]\n", f.FileName, f.UploadType, status)
		fmt.Printf("   ID: %s\n", f.ID)
		fmt.Printf("   Size: %s | Type: %s | Status: %s\n", formatSize(f.FileSize), f.UploadType, f.Status)

		if f.CreatedAt != "" {
			if t, err := time.Parse(time.RFC3339, f.CreatedAt); err == nil {
				fmt.Printf("   Created: %s\n", t.Format("2006-01-02 15:04:05"))
			}
		}

		if f.ExpiresAt != nil {
			if t, err := time.Parse(time.RFC3339, *f.ExpiresAt); err == nil {
				fmt.Printf("   Expires: %s\n", t.Format("2006-01-02 15:04:05"))
			}
		}

		if f.MaxDownloads != nil && f.DownloadsRemaining != nil {
			fmt.Printf("   Downloads: %d/%d remaining\n", *f.DownloadsRemaining, *f.MaxDownloads)
		}

		if f.CdnURL != nil {
			fmt.Printf("   CDN URL: %s\n", *f.CdnURL)
		}

		fmt.Println()
	}

	return nil
}

func noFilesMessage() string {
	if listType != "" {
		return fmt.Sprintf("No %s files found", listType)
	}
	return "No files found"
}

// shortTime renders an RFC3339 timestamp as "2006-01-02 15:04", or "-" if empty/invalid.
func shortTime(s string) string {
	if s == "" {
		return "-"
	}
	if t, err := time.Parse(time.RFC3339, s); err == nil {
		return t.Format("2006-01-02 15:04")
	}
	return s
}

// truncate shortens a string to max runes, adding an ellipsis when cut.
func truncate(s string, max int) string {
	r := []rune(s)
	if len(r) <= max {
		return s
	}
	if max <= 3 {
		return string(r[:max])
	}
	return string(r[:max-3]) + "..."
}
