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
	UploadURL        string  `json:"uploadUrl"`
	FileID           string  `json:"fileId"`
	S3Key            string  `json:"s3Key"`
	CdnURL           *string `json:"cdnUrl"`
	ExpiresAt        *string `json:"expiresAt"`
	MaxDownloads     *int    `json:"maxDownloads"`
	MaxFileSizeBytes int64   `json:"maxFileSizeBytes"`
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

func (c *Client) UploadToS3(uploadURL string, file *os.File, fileSize int64, contentType string) error {
	req, err := http.NewRequest("PUT", uploadURL, file)
	if err != nil {
		return err
	}

	req.Header.Set("Content-Type", contentType)
	req.ContentLength = fileSize

	resp, err := c.httpClient.Do(req)
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
