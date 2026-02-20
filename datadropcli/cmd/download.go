package cmd

import (
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/datadrop/cli/internal/api"
	"github.com/datadrop/cli/internal/config"
	"github.com/spf13/cobra"
)

var (
	downloadFileID   string
	downloadFileName string
	downloadFileArg  string
	downloadOutput   string
)

var downloadCmd = &cobra.Command{
	Use:   "download",
	Short: "Download a file from DataDrop",
	Long: `Download a file directly to your current directory.

Examples:
  datadrop download --file myfile.txt
  datadrop download --file abc12345-...
  datadrop download --id abc123 -o ~/Downloads/`,
	RunE: runDownload,
}

func init() {
	downloadCmd.Flags().StringVar(&downloadFileArg, "file", "", "File ID or name (auto-detected)")
	downloadCmd.Flags().StringVar(&downloadFileID, "id", "", "File ID")
	downloadCmd.Flags().StringVar(&downloadFileName, "file-name", "", "File name")
	downloadCmd.Flags().StringVarP(&downloadOutput, "output", "o", ".", "Output directory or file path")
}

func runDownload(cmd *cobra.Command, args []string) error {
	cfg, err := config.Load()
	if err != nil {
		return fmt.Errorf("failed to load config: %w", err)
	}

	if cfg == nil || !cfg.IsValid() {
		return fmt.Errorf("not logged in. Run 'datadrop login' first")
	}

	identifier, err := getFileIdentifier(downloadFileID, downloadFileName, downloadFileArg, args)
	if err != nil {
		return err
	}

	client := api.NewClient(cfg)

	fileInfo, err := resolveFileArgWithInfo(client, identifier)
	if err != nil {
		return err
	}

	resolvedID := fileInfo.ID
	resolvedName := fileInfo.FileName

	fmt.Printf("Fetching download URL for %s...\n", resolvedName)

	downloadResp, err := client.GetDownloadURL(resolvedID)
	if err != nil {
		return fmt.Errorf("failed to get download URL: %w", err)
	}

	// Determine output path
	outputPath := downloadOutput
	info, err := os.Stat(outputPath)
	if err == nil && info.IsDir() {
		outputPath = filepath.Join(outputPath, resolvedName)
	} else if outputPath == "." {
		outputPath = resolvedName
	}

	// Avoid overwriting without notice
	if _, err := os.Stat(outputPath); err == nil {
		ext := filepath.Ext(outputPath)
		base := strings.TrimSuffix(outputPath, ext)
		outputPath = fmt.Sprintf("%s_%d%s", base, time.Now().Unix(), ext)
		fmt.Printf("File already exists, saving as %s\n", filepath.Base(outputPath))
	}

	fmt.Printf("Downloading to %s...\n", outputPath)

	if err := downloadFromURL(downloadResp.DownloadURL, outputPath); err != nil {
		return fmt.Errorf("download failed: %w", err)
	}

	fmt.Printf("\n✓ Downloaded %s\n", outputPath)

	if downloadResp.DownloadsRemaining != nil {
		fmt.Printf("  Downloads remaining: %d\n", *downloadResp.DownloadsRemaining)
	}

	return nil
}

func downloadFromURL(url, destPath string) error {
	resp, err := http.Get(url)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("server returned %s", resp.Status)
	}

	out, err := os.Create(destPath)
	if err != nil {
		return fmt.Errorf("failed to create file: %w", err)
	}
	defer out.Close()

	totalSize := resp.ContentLength
	if totalSize > 0 {
		pt := newProgressTracker(totalSize)
		pr := &progressWriter{
			writer: out,
			total:  totalSize,
			onProgress: func(written, total int64) {
				printProgressBar(written, total, pt, "")
			},
		}
		_, err = io.Copy(pr, resp.Body)
	} else {
		_, err = io.Copy(out, resp.Body)
	}

	return err
}

type progressWriter struct {
	writer     io.Writer
	total      int64
	written    int64
	onProgress func(written, total int64)
	lastCb     time.Time
}

func (pw *progressWriter) Write(p []byte) (int, error) {
	n, err := pw.writer.Write(p)
	if n > 0 {
		pw.written += int64(n)
		if pw.onProgress != nil && time.Since(pw.lastCb) > 100*time.Millisecond {
			pw.onProgress(pw.written, pw.total)
			pw.lastCb = time.Now()
		}
	}
	return n, err
}
