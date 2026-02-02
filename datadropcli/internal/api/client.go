package api

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/datadrop/cli/internal/config"
)

// ProgressFunc is called with bytes uploaded and total bytes
type ProgressFunc func(uploaded, total int64)

// progressReader wraps an io.Reader to track progress
type progressReader struct {
	reader     io.Reader
	total      int64
	uploaded   int64
	onProgress ProgressFunc
}

func (pr *progressReader) Read(p []byte) (int, error) {
	n, err := pr.reader.Read(p)
	if n > 0 {
		pr.uploaded += int64(n)
		if pr.onProgress != nil {
			pr.onProgress(pr.uploaded, pr.total)
		}
	}
	return n, err
}

type Client struct {
	baseURL    string
	httpClient *http.Client
	token      string
}

type FileInfo struct {
	ID                 string  `json:"id"`
	FileName           string  `json:"fileName"`
	FileSize           int64   `json:"fileSize"`
	FileType           string  `json:"fileType"`
	UploadType         string  `json:"uploadType"`
	Status             string  `json:"status"`
	CreatedAt          string  `json:"createdAt"`
	ExpiresAt          *string `json:"expiresAt"`
	CdnURL             *string `json:"cdnUrl"`
	MaxDownloads       *int    `json:"maxDownloads"`
	DownloadsRemaining *int    `json:"downloadsRemaining"`
	IsExpired          bool    `json:"isExpired"`
}

type UploadRequest struct {
	FileName         string `json:"fileName"`
	FileType         string `json:"fileType"`
	FileSize         int64  `json:"fileSize"`
	UploadType       string `json:"uploadType"`
	ExpiresInSeconds *int   `json:"expiresInSeconds,omitempty"`
	MaxDownloads     *int   `json:"maxDownloads,omitempty"`
}

type UploadResponse struct {
	UploadURL        string            `json:"uploadUrl"`
	FileID           string            `json:"fileId"`
	S3Key            string            `json:"s3Key"`
	CdnURL           *string           `json:"cdnUrl"`
	ExpiresAt        *string           `json:"expiresAt"`
	MaxDownloads     *int              `json:"maxDownloads"`
	MaxFileSizeBytes int64             `json:"maxFileSizeBytes"`
	Multipart        *MultipartInfo    `json:"multipart"`
}

type MultipartInfo struct {
	UploadID  string `json:"uploadId"`
	PartCount int    `json:"partCount"`
	PartSize  int64  `json:"partSize"`
}

type PartURLResponse struct {
	UploadURL  string `json:"uploadUrl"`
	PartNumber int    `json:"partNumber"`
}

type UploadPart struct {
	PartNumber int    `json:"partNumber"`
	ETag       string `json:"etag"`
}

type ShareRequest struct {
	ExpiresInSeconds int `json:"expiresInSeconds"`
}

type ShareResponse struct {
	ShareURL           string  `json:"shareUrl"`
	Type               string  `json:"type"`
	ExpiresAt          *string `json:"expiresAt"`
	FileExpiresAt      *string `json:"fileExpiresAt"`
	MaxDownloads       *int    `json:"maxDownloads"`
	DownloadsRemaining *int    `json:"downloadsRemaining"`
}

type UserInfo struct {
	UserID           string   `json:"userId"`
	Email            string   `json:"email"`
	Name             string   `json:"name"`
	Roles            []string `json:"roles"`
	CanUploadCdn     bool     `json:"canUploadCdn"`
	CanUploadFile    bool     `json:"canUploadFile"`
	MaxFileSizeBytes int64    `json:"maxFileSizeBytes"`
}

func NewClient(cfg *config.Config) *Client {
	baseURL := cfg.APIEndpoint
	// Ensure endpoint includes /api path
	if !strings.HasSuffix(baseURL, "/api") {
		baseURL = strings.TrimSuffix(baseURL, "/") + "/api"
	}
	
	return &Client{
		baseURL: baseURL,
		httpClient: &http.Client{
			Timeout: 30 * time.Second,
		},
		token: cfg.IDToken,
	}
}

func (c *Client) doRequest(method, path string, body interface{}) (*http.Response, error) {
	var bodyReader io.Reader
	if body != nil {
		data, err := json.Marshal(body)
		if err != nil {
			return nil, err
		}
		bodyReader = bytes.NewReader(data)
	}

	req, err := http.NewRequest(method, c.baseURL+path, bodyReader)
	if err != nil {
		return nil, err
	}

	req.Header.Set("Authorization", "Bearer "+c.token)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}

	return c.httpClient.Do(req)
}

func (c *Client) Verify() (*UserInfo, error) {
	resp, err := c.doRequest("GET", "/auth/verify", nil)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("authentication failed: %s", resp.Status)
	}

	var user UserInfo
	if err := json.NewDecoder(resp.Body).Decode(&user); err != nil {
		return nil, err
	}

	return &user, nil
}

func (c *Client) ListFiles() ([]FileInfo, error) {
	resp, err := c.doRequest("GET", "/files", nil)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("failed to list files: %s - %s", resp.Status, string(body))
	}

	var result struct {
		Files []FileInfo `json:"files"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}

	return result.Files, nil
}

func (c *Client) GetUploadURL(req *UploadRequest) (*UploadResponse, error) {
	resp, err := c.doRequest("POST", "/upload", req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("failed to get upload URL: %s - %s", resp.Status, string(body))
	}

	var result UploadResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}

	return &result, nil
}

func (c *Client) ConfirmUpload(fileID string) error {
	resp, err := c.doRequest("POST", "/files/"+fileID+"/confirm", nil)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("failed to confirm upload: %s - %s", resp.Status, string(body))
	}

	return nil
}

func (c *Client) UploadToS3(uploadURL string, file *os.File, fileSize int64, contentType string, onProgress ProgressFunc) error {
	pr := &progressReader{
		reader:     file,
		total:      fileSize,
		onProgress: onProgress,
	}

	req, err := http.NewRequest("PUT", uploadURL, pr)
	if err != nil {
		return err
	}

	req.Header.Set("Content-Type", contentType)
	req.ContentLength = fileSize

	// Use a client without timeout for large uploads
	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("S3 upload failed: %s - %s", resp.Status, string(body))
	}

	return nil
}

func (c *Client) GetPartURL(fileID string, partNumber int) (*PartURLResponse, error) {
	body := map[string]int{"partNumber": partNumber}
	resp, err := c.doRequest("POST", "/upload/"+fileID+"/part", body)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("failed to get part URL: %s - %s", resp.Status, string(body))
	}

	var result PartURLResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}

	return &result, nil
}

func (c *Client) UploadPart(uploadURL string, data io.Reader, partSize int64, onProgress ProgressFunc) (string, error) {
	pr := &progressReader{
		reader:     data,
		total:      partSize,
		onProgress: onProgress,
	}

	req, err := http.NewRequest("PUT", uploadURL, pr)
	if err != nil {
		return "", err
	}

	req.ContentLength = partSize

	// Use a client without timeout for large uploads
	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("part upload failed: %s - %s", resp.Status, string(body))
	}

	// Get ETag from response header
	etag := resp.Header.Get("ETag")
	return etag, nil
}

func (c *Client) CompleteMultipartUpload(fileID string, parts []UploadPart) error {
	body := map[string]interface{}{"parts": parts}
	resp, err := c.doRequest("POST", "/upload/"+fileID+"/complete", body)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("failed to complete multipart upload: %s - %s", resp.Status, string(respBody))
	}

	return nil
}

func (c *Client) AbortMultipartUpload(fileID string) error {
	resp, err := c.doRequest("POST", "/upload/"+fileID+"/abort", nil)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	return nil
}

func (c *Client) GetShareURL(fileID string, expiresInSeconds int) (*ShareResponse, error) {
	req := &ShareRequest{ExpiresInSeconds: expiresInSeconds}
	resp, err := c.doRequest("POST", "/files/"+fileID+"/share", req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("failed to get share URL: %s - %s", resp.Status, string(body))
	}

	var result ShareResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}

	return &result, nil
}

func (c *Client) DeleteFile(fileID string) error {
	resp, err := c.doRequest("DELETE", "/files/"+fileID, nil)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("failed to delete file: %s - %s", resp.Status, string(body))
	}

	return nil
}
