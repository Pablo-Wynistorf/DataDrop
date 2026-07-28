package cmd

import (
	"fmt"
	"io"
	"mime"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/datadrop/cli/internal/api"
	"github.com/datadrop/cli/internal/config"
	"github.com/spf13/cobra"
)

const progressBarWidth = 40

type progressTracker struct {
	startTime    time.Time
	totalBytes   int64
	lastUpdate   time.Time
	lastBytes    int64
	speedSamples []float64
}

var (
	uploadType       string
	expiresInSeconds int
	maxDownloads     int
	clipboardFlag    bool
)

var uploadCmd = &cobra.Command{
	Use:   "upload <file> [files...]",
	Short: "Upload files to DataDrop",
	Long: `Upload one or more files to DataDrop.

The destination folder is derived from the path you provide, so there's no
folder flag to manage. Uploading a directory preserves its structure, and
uploading a file via a relative path places it in a matching folder:

  datadrop upload report.pdf              -> uploads to the root folder
  datadrop upload reports/q1/data.csv     -> uploads to the /reports/q1 folder
  datadrop upload ./photos                -> mirrors the photos/ tree

Absolute paths (e.g. /Users/me/file.txt) upload to the root folder so your
local filesystem layout isn't mirrored.

Examples:
  datadrop upload myfile.txt
  datadrop upload myfile.txt --type private --expires 86400 --max-downloads 5
  datadrop upload *.txt
  datadrop upload ./myfolder
  datadrop upload myfile.txt --clipboard`,
	Args: cobra.MinimumNArgs(1),
	RunE: runUpload,
}

func init() {
	uploadCmd.Flags().StringVarP(&uploadType, "type", "t", "private", "Upload type: 'cdn' or 'private'")
	uploadCmd.Flags().IntVarP(&expiresInSeconds, "expires", "e", 0, "Expiration time in seconds (private files only)")
	uploadCmd.Flags().IntVarP(&maxDownloads, "max-downloads", "m", 0, "Maximum number of downloads (private files only)")
	uploadCmd.Flags().BoolVar(&clipboardFlag, "clipboard", false, "Copy share URL to clipboard after upload")
}

// uploadItem is a local file paired with the remote folder it should land in.
type uploadItem struct {
	path       string
	folderPath string // "/" for root, otherwise "/segment/segment"
}

// folderFromRelPath turns a relative path like "reports/q1/data.csv" into the
// folder it belongs to ("/reports/q1"). Files with no directory component, or
// only "." / ".." segments, resolve to the root folder ("/").
func folderFromRelPath(rel string) string {
	rel = filepath.ToSlash(rel)
	idx := strings.LastIndex(rel, "/")
	if idx < 0 {
		return "/"
	}
	var segs []string
	for _, s := range strings.Split(rel[:idx], "/") {
		if s == "" || s == "." || s == ".." {
			continue
		}
		segs = append(segs, s)
	}
	if len(segs) == 0 {
		return "/"
	}
	return "/" + strings.Join(segs, "/")
}

// expandPaths takes the raw args and expands them into individual files, each
// paired with the folder it should be uploaded into. The folder is inferred
// from the path the user provided so no extra flag is required:
//   - a plain file name uploads to the root folder
//   - a relative path (reports/q1/data.csv) mirrors its directories
//   - a directory is walked recursively, preserving its structure
//   - an absolute file path uploads to the root folder
func expandPaths(args []string) ([]uploadItem, error) {
	var items []uploadItem
	for _, arg := range args {
		info, err := os.Stat(arg)
		if err != nil {
			return nil, fmt.Errorf("not found: %s", arg)
		}
		if !info.IsDir() {
			folder := "/"
			if !filepath.IsAbs(arg) {
				folder = folderFromRelPath(arg)
			}
			items = append(items, uploadItem{path: arg, folderPath: folder})
			continue
		}
		// Directory: walk recursively and preserve the structure, rooted at the
		// directory's own name (e.g. "photos/2024/pic.jpg" -> "/photos/2024").
		parent := filepath.Dir(filepath.Clean(arg))
		walkErr := filepath.WalkDir(arg, func(p string, d os.DirEntry, err error) error {
			if err != nil {
				return err
			}
			if d.IsDir() {
				return nil
			}
			rel, relErr := filepath.Rel(parent, p)
			if relErr != nil {
				rel = filepath.Base(p)
			}
			items = append(items, uploadItem{path: p, folderPath: folderFromRelPath(rel)})
			return nil
		})
		if walkErr != nil {
			return nil, fmt.Errorf("failed to read directory %s: %w", arg, walkErr)
		}
	}
	return items, nil
}

func runUpload(cmd *cobra.Command, args []string) error {
	cfg, err := config.Load()
	if err != nil {
		return fmt.Errorf("failed to load config: %w", err)
	}

	if cfg == nil || !cfg.IsValid() {
		return fmt.Errorf("not logged in. Run 'datadrop login' first")
	}

	items, err := expandPaths(args)
	if err != nil {
		return err
	}

	if len(items) == 0 {
		return fmt.Errorf("no files to upload")
	}

	client := api.NewClient(cfg)
	batch := len(items) > 1

	type result struct {
		name   string
		fileID string
		cdnURL *string
		err    error
	}
	var results []result

	for i, item := range items {
		if batch {
			fmt.Printf("\n[%d/%d] ", i+1, len(items))
		}

		fileID, cdnURL, err := uploadSingleFile(client, item.path, item.folderPath)
		results = append(results, result{filepath.Base(item.path), fileID, cdnURL, err})
		if err != nil {
			fmt.Printf("✗ %s: %v\n", filepath.Base(item.path), err)
		}
	}

	// Batch summary
	if batch {
		succeeded := 0
		for _, r := range results {
			if r.err == nil {
				succeeded++
			}
		}
		fmt.Printf("\n%d/%d files uploaded successfully\n", succeeded, len(results))
	}

	// Clipboard: copy share URL of the last successful upload
	if clipboardFlag {
		var lastID string
		for i := len(results) - 1; i >= 0; i-- {
			if results[i].err == nil {
				lastID = results[i].fileID
				break
			}
		}
		if lastID != "" {
			shareResp, err := client.GetShareURL(lastID, 86400)
			if err == nil {
				if err := copyToClipboard(shareResp.ShareURL); err == nil {
					fmt.Println("✓ Share URL copied to clipboard")
				}
			}
		}
	}

	return nil
}

func uploadSingleFile(client *api.Client, filePath, folderPath string) (string, *string, error) {
	fileInfo, err := os.Stat(filePath)
	if err != nil {
		return "", nil, fmt.Errorf("file not found: %w", err)
	}
	if fileInfo.IsDir() {
		return "", nil, fmt.Errorf("cannot upload directories directly")
	}

	file, err := os.Open(filePath)
	if err != nil {
		return "", nil, fmt.Errorf("failed to open file: %w", err)
	}
	defer file.Close()

	name := filepath.Base(filePath)
	fileSize := fileInfo.Size()

	contentType := mime.TypeByExtension(filepath.Ext(name))
	if contentType == "" {
		contentType = "application/octet-stream"
	}

	uploadReq := &api.UploadRequest{
		FileName:   name,
		FileType:   contentType,
		FileSize:   fileSize,
		UploadType: uploadType,
	}
	if folderPath != "" && folderPath != "/" {
		uploadReq.FolderPath = folderPath
	}

	if uploadType == "private" {
		if expiresInSeconds > 0 {
			uploadReq.ExpiresInSeconds = &expiresInSeconds
		}
		if maxDownloads > 0 {
			uploadReq.MaxDownloads = &maxDownloads
		}
	}

	if folderPath != "" && folderPath != "/" {
		fmt.Printf("Uploading %s (%s) → %s...\n", name, formatSize(fileSize), folderPath)
	} else {
		fmt.Printf("Uploading %s (%s)...\n", name, formatSize(fileSize))
	}

	uploadResp, err := client.GetUploadURL(uploadReq)
	if err != nil {
		return "", nil, fmt.Errorf("failed to get upload URL: %w", err)
	}

	if uploadResp.Multipart != nil {
		if err := doMultipartUpload(client, uploadResp, file, fileSize); err != nil {
			client.AbortMultipartUpload(uploadResp.FileID)
			return "", nil, fmt.Errorf("upload failed: %w", err)
		}
	} else {
		pt := newProgressTracker(fileSize)
		progressFn := func(uploaded, total int64) {
			printProgressBar(uploaded, total, pt, "")
		}
		if err := client.UploadToS3(uploadResp.UploadURL, file, fileSize, contentType, progressFn); err != nil {
			return "", nil, fmt.Errorf("upload failed: %w", err)
		}
		fmt.Println()

		if err := client.ConfirmUpload(uploadResp.FileID); err != nil {
			return "", nil, fmt.Errorf("failed to confirm upload: %w", err)
		}
	}

	fmt.Println("\n✓ Upload complete!")
	fmt.Printf("  File ID: %s\n", uploadResp.FileID)

	if uploadResp.CdnURL != nil {
		fmt.Printf("  CDN URL: %s\n", *uploadResp.CdnURL)
	}
	if uploadResp.ExpiresAt != nil {
		fmt.Printf("  Expires: %s\n", *uploadResp.ExpiresAt)
	}
	if uploadResp.MaxDownloads != nil {
		fmt.Printf("  Max downloads: %d\n", *uploadResp.MaxDownloads)
	}

	return uploadResp.FileID, uploadResp.CdnURL, nil
}

func formatSize(bytes int64) string {
	const unit = 1024
	if bytes < unit {
		return fmt.Sprintf("%d B", bytes)
	}
	div, exp := int64(unit), 0
	for n := bytes / unit; n >= unit; n /= unit {
		div *= unit
		exp++
	}
	return fmt.Sprintf("%.1f %cB", float64(bytes)/float64(div), "KMGTPE"[exp])
}

func newProgressTracker(totalBytes int64) *progressTracker {
	return &progressTracker{
		startTime:    time.Now(),
		totalBytes:   totalBytes,
		lastUpdate:   time.Now(),
		speedSamples: make([]float64, 0, 10),
	}
}

func (pt *progressTracker) update(currentBytes int64) (speed float64, eta time.Duration) {
	now := time.Now()
	elapsed := now.Sub(pt.lastUpdate).Seconds()

	if elapsed > 0.5 {
		bytesDiff := currentBytes - pt.lastBytes
		currentSpeed := float64(bytesDiff) / elapsed

		pt.speedSamples = append(pt.speedSamples, currentSpeed)
		if len(pt.speedSamples) > 10 {
			pt.speedSamples = pt.speedSamples[1:]
		}

		pt.lastUpdate = now
		pt.lastBytes = currentBytes
	}

	if len(pt.speedSamples) > 0 {
		var sum float64
		for _, s := range pt.speedSamples {
			sum += s
		}
		speed = sum / float64(len(pt.speedSamples))
	}

	remaining := pt.totalBytes - currentBytes
	if speed > 0 {
		eta = time.Duration(float64(remaining)/speed) * time.Second
	}

	return speed, eta
}

func formatDuration(d time.Duration) string {
	if d < 0 {
		return "--:--"
	}

	d = d.Round(time.Second)
	h := d / time.Hour
	d -= h * time.Hour
	m := d / time.Minute
	d -= m * time.Minute
	s := d / time.Second

	if h > 0 {
		return fmt.Sprintf("%dh%02dm", h, m)
	}
	return fmt.Sprintf("%d:%02d", m, s)
}

func formatSpeed(bytesPerSec float64) string {
	if bytesPerSec < 1024 {
		return fmt.Sprintf("%.0f B/s", bytesPerSec)
	} else if bytesPerSec < 1024*1024 {
		return fmt.Sprintf("%.1f KB/s", bytesPerSec/1024)
	} else if bytesPerSec < 1024*1024*1024 {
		return fmt.Sprintf("%.1f MB/s", bytesPerSec/(1024*1024))
	}
	return fmt.Sprintf("%.1f GB/s", bytesPerSec/(1024*1024*1024))
}

func printProgressBar(current, total int64, pt *progressTracker, suffix string) {
	percent := float64(current) / float64(total) * 100
	filled := int(float64(progressBarWidth) * float64(current) / float64(total))

	bar := strings.Repeat("█", filled) + strings.Repeat("░", progressBarWidth-filled)

	speed, eta := pt.update(current)
	etaStr := formatDuration(eta)
	speedStr := formatSpeed(speed)

	fmt.Printf("\r  [%s] %3.0f%% %s/%s %s ETA %s %s",
		bar, percent, formatSize(current), formatSize(total), speedStr, etaStr, suffix)
}

func doMultipartUpload(client *api.Client, uploadResp *api.UploadResponse, file *os.File, fileSize int64) error {
	mp := uploadResp.Multipart
	fmt.Printf("Using multipart upload (%d parts)\n", mp.PartCount)

	parts := make([]api.UploadPart, 0, mp.PartCount)
	var totalUploaded int64
	pt := newProgressTracker(fileSize)

	for partNum := 1; partNum <= mp.PartCount; partNum++ {
		offset := int64(partNum-1) * mp.PartSize
		partSize := mp.PartSize
		if offset+partSize > fileSize {
			partSize = fileSize - offset
		}

		partResp, err := client.GetPartURL(uploadResp.FileID, partNum)
		if err != nil {
			fmt.Println()
			return fmt.Errorf("failed to get part %d URL: %w", partNum, err)
		}

		if _, err := file.Seek(offset, io.SeekStart); err != nil {
			fmt.Println()
			return fmt.Errorf("failed to seek: %w", err)
		}

		partReader := io.LimitReader(file, partSize)

		partUploaded := int64(0)
		progressFn := func(uploaded, _ int64) {
			partUploaded = uploaded
			printProgressBar(totalUploaded+partUploaded, fileSize, pt, fmt.Sprintf("(part %d/%d)", partNum, mp.PartCount))
		}

		etag, err := client.UploadPart(partResp.UploadURL, partReader, partSize, progressFn)
		if err != nil {
			fmt.Println()
			return fmt.Errorf("failed to upload part %d: %w", partNum, err)
		}

		totalUploaded += partSize
		parts = append(parts, api.UploadPart{
			PartNumber: partNum,
			ETag:       etag,
		})
	}

	fmt.Println()
	fmt.Print("  Completing upload...")

	if err := client.CompleteMultipartUpload(uploadResp.FileID, parts); err != nil {
		fmt.Println()
		return fmt.Errorf("failed to complete multipart upload: %w", err)
	}

	fmt.Println(" done")
	return nil
}
