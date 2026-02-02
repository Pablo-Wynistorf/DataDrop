package cmd

import (
	"fmt"
	"io"
	"mime"
	"os"
	"path/filepath"

	"github.com/datadrop/cli/internal/api"
	"github.com/datadrop/cli/internal/config"
	"github.com/spf13/cobra"
)

var (
	uploadType       string
	expiresInSeconds int
	maxDownloads     int
)

var uploadCmd = &cobra.Command{
	Use:   "upload <file>",
	Short: "Upload a file to DataDrop",
	Long: `Upload a file to DataDrop. 

Examples:
  datadrop upload myfile.txt
  datadrop upload myfile.txt --type private --expires 86400 --max-downloads 5
  datadrop upload myfile.txt --type cdn`,
	Args: cobra.ExactArgs(1),
	RunE: runUpload,
}

func init() {
	uploadCmd.Flags().StringVarP(&uploadType, "type", "t", "private", "Upload type: 'cdn' or 'private'")
	uploadCmd.Flags().IntVarP(&expiresInSeconds, "expires", "e", 0, "Expiration time in seconds (private files only)")
	uploadCmd.Flags().IntVarP(&maxDownloads, "max-downloads", "m", 0, "Maximum number of downloads (private files only)")
}

func runUpload(cmd *cobra.Command, args []string) error {
	cfg, err := config.Load()
	if err != nil {
		return fmt.Errorf("failed to load config: %w", err)
	}

	if cfg == nil || !cfg.IsValid() {
		return fmt.Errorf("not logged in. Run 'datadrop login' first")
	}

	filePath := args[0]

	// Check file exists
	fileInfo, err := os.Stat(filePath)
	if err != nil {
		return fmt.Errorf("file not found: %w", err)
	}

	if fileInfo.IsDir() {
		return fmt.Errorf("cannot upload directories")
	}

	// Open file
	file, err := os.Open(filePath)
	if err != nil {
		return fmt.Errorf("failed to open file: %w", err)
	}
	defer file.Close()

	fileName := filepath.Base(filePath)
	fileSize := fileInfo.Size()

	// Detect content type
	contentType := mime.TypeByExtension(filepath.Ext(fileName))
	if contentType == "" {
		contentType = "application/octet-stream"
	}

	client := api.NewClient(cfg)

	// Build upload request
	uploadReq := &api.UploadRequest{
		FileName:   fileName,
		FileType:   contentType,
		FileSize:   fileSize,
		UploadType: uploadType,
	}

	if uploadType == "private" {
		if expiresInSeconds > 0 {
			uploadReq.ExpiresInSeconds = &expiresInSeconds
		}
		if maxDownloads > 0 {
			uploadReq.MaxDownloads = &maxDownloads
		}
	}

	fmt.Printf("Uploading %s (%s)...\n", fileName, formatSize(fileSize))

	// Get presigned URL
	uploadResp, err := client.GetUploadURL(uploadReq)
	if err != nil {
		return fmt.Errorf("failed to get upload URL: %w", err)
	}

	// Check if multipart upload is needed
	if uploadResp.Multipart != nil {
		// Multipart upload for large files
		if err := doMultipartUpload(client, uploadResp, file, fileSize); err != nil {
			// Try to abort on failure
			client.AbortMultipartUpload(uploadResp.FileID)
			return fmt.Errorf("upload failed: %w", err)
		}
	} else {
		// Single PUT upload for smaller files
		if err := client.UploadToS3(uploadResp.UploadURL, file, fileSize, contentType); err != nil {
			return fmt.Errorf("upload failed: %w", err)
		}

		// Confirm upload
		if err := client.ConfirmUpload(uploadResp.FileID); err != nil {
			return fmt.Errorf("failed to confirm upload: %w", err)
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

	return nil
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

func doMultipartUpload(client *api.Client, uploadResp *api.UploadResponse, file *os.File, fileSize int64) error {
	mp := uploadResp.Multipart
	fmt.Printf("Using multipart upload (%d parts of %s each)\n", mp.PartCount, formatSize(mp.PartSize))

	parts := make([]api.UploadPart, 0, mp.PartCount)

	for partNum := 1; partNum <= mp.PartCount; partNum++ {
		// Calculate part size (last part may be smaller)
		offset := int64(partNum-1) * mp.PartSize
		partSize := mp.PartSize
		if offset+partSize > fileSize {
			partSize = fileSize - offset
		}

		fmt.Printf("\r  Uploading part %d/%d (%s)...", partNum, mp.PartCount, formatSize(partSize))

		// Get presigned URL for this part
		partResp, err := client.GetPartURL(uploadResp.FileID, partNum)
		if err != nil {
			return fmt.Errorf("failed to get part %d URL: %w", partNum, err)
		}

		// Seek to the correct position
		if _, err := file.Seek(offset, io.SeekStart); err != nil {
			return fmt.Errorf("failed to seek: %w", err)
		}

		// Create a limited reader for this part
		partReader := io.LimitReader(file, partSize)

		// Upload the part
		etag, err := client.UploadPart(partResp.UploadURL, partReader, partSize)
		if err != nil {
			return fmt.Errorf("failed to upload part %d: %w", partNum, err)
		}

		parts = append(parts, api.UploadPart{
			PartNumber: partNum,
			ETag:       etag,
		})
	}

	fmt.Println("\n  Completing upload...")

	// Complete the multipart upload
	if err := client.CompleteMultipartUpload(uploadResp.FileID, parts); err != nil {
		return fmt.Errorf("failed to complete multipart upload: %w", err)
	}

	return nil
}
