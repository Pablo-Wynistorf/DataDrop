<p align="center">
  <img src="datadropcli/demo.gif" alt="DataDrop CLI Demo" width="800" />
</p>

<h1 align="center">DataDrop</h1>

<p align="center">
  A self-hosted file sharing platform with a web UI and CLI. Upload, share, and manage files with OIDC authentication, CDN delivery, and time-limited private links.
</p>

<p align="center">
  <a href="#web-ui">Web UI</a> •
  <a href="#cli">CLI</a> •
  <a href="#deploy">Deploy</a> •
  <a href="#architecture">Architecture</a>
</p>

---

## Features

- OIDC authentication (any provider: Google, GitHub, Keycloak, etc.)
- Two upload modes: public CDN (permanent URL via CloudFront) and private (time-limited, download-limited)
- Drag & drop web interface with batch upload, folder upload, search, and filters
- Full-featured CLI with auto-update, QR code sharing, and shell completion
- Auto-delete files after expiry or download limit reached
- Multipart upload support for large files
- Fully serverless on AWS (Lambda, S3, DynamoDB, CloudFront, API Gateway, SQS)
- Infrastructure as code with Terraform

---

## Web UI

The web interface provides a clean dashboard for managing files:

- Drag & drop or select files/folders to upload
- Choose between CDN (public, permanent) or Private (expiring, download-limited) upload types
- Search and filter files by type, size, expiry status, and download limits
- Generate share links for private files with configurable expiry
- Edit file settings (expiry, download limits) after upload
- Responsive design that works on mobile

---

## CLI

Install with a single command:

```bash
curl -fsSL https://raw.githubusercontent.com/pablo-wynistorf/datadrop/main/src/frontend/install.sh | bash
```

Or download a binary from [Releases](https://github.com/pablo-wynistorf/datadrop/releases).

### Usage

```bash
# Login (defaults to https://datadrop.onedns.ch)
datadrop login

# Upload files
datadrop upload myfile.txt
datadrop upload myfile.txt --type private --expires 86400 --max-downloads 5
datadrop upload *.txt                    # batch upload
datadrop upload ./my-folder              # upload folder contents
datadrop upload myfile.txt --clipboard   # copy share URL to clipboard

# Manage files
datadrop list
datadrop info myfile.txt
datadrop rename myfile.txt --name newname.txt
datadrop delete myfile.txt

# Share & download
datadrop share myfile.txt                # get share URL
datadrop share myfile.txt --qr           # show QR code in terminal
datadrop download myfile.txt -o ~/Downloads/

# Maintenance
datadrop update                          # self-update to latest version
datadrop status                          # check login status
datadrop completion zsh >> ~/.zshrc      # shell completions
```

All commands accept a file name or UUID directly as a positional argument. If multiple files share the same name, an interactive picker is shown.

See [datadropcli/README.md](datadropcli/README.md) for full CLI documentation.

---

## Deploy

### Prerequisites

- AWS account with appropriate permissions
- Terraform >= 1.0
- An OIDC provider (Keycloak, Auth0, Google, etc.)
- Node.js (for Lambda dependencies)

### Setup

1. Install Lambda dependencies:

```bash
npm run install:api
npm run install:deletion
```

2. Configure Terraform variables:

```bash
cd terraform
cp terraform.tfvars.example terraform.tfvars
```

Edit `terraform.tfvars`:

```hcl
project_name       = "datadrop"
aws_region         = "us-east-1"
oidc_issuer        = "https://your-oidc-provider.com"
oidc_client_id     = "your-client-id"
oidc_client_secret = "your-client-secret"
jwt_secret         = "a-random-secret-for-share-links"

# Optional: custom domain
domain_name         = "datadrop.example.com"
acm_certificate_arn = "arn:aws:acm:us-east-1:..."
```

3. Deploy:

```bash
terraform init
terraform apply
```

4. Configure your OIDC provider's redirect URI to the value from:

```bash
terraform output oidc_redirect_uri
```

---

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│  CloudFront  │────▶│  S3 Frontend │     │  S3 (CDN)   │
│  Distribution│     └──────────────┘     │  Public Files│
│              │                          └─────────────┘
│              │     ┌──────────────┐     ┌─────────────┐
│              │────▶│ API Gateway  │────▶│   Lambda     │
└─────────────┘     └──────────────┘     │   (API)      │
                                          └──────┬──────┘
                                                 │
                                    ┌────────────┼────────────┐
                                    ▼            ▼            ▼
                              ┌──────────┐ ┌──────────┐ ┌─────────┐
                              │ DynamoDB  │ │ S3 Files │ │   SQS   │
                              │ (metadata)│ │ (private)│ │ (delete)│
                              └──────────┘ └──────────┘ └────┬────┘
                                                              ▼
                                                        ┌──────────┐
                                                        │  Lambda   │
                                                        │ (deletion)│
                                                        └──────────┘
```

- CloudFront serves the frontend and proxies API requests to API Gateway
- Lambda handles authentication, file management, upload/download URL generation
- Private files are stored in S3 with presigned URLs for access
- CDN files are served directly through CloudFront from a public S3 bucket
- DynamoDB stores file metadata, expiry TTLs, and download counts
- SQS + Lambda handles async file deletion (on expiry or download limit)

---

## Project Structure

```
├── src/
│   ├── frontend/          # Static web UI (HTML, JS, Tailwind)
│   └── lambda/
│       ├── api/           # Main API Lambda (auth, upload, files, download)
│       └── deletion/      # File deletion Lambda (SQS consumer)
├── datadropcli/           # Go CLI tool
│   ├── cmd/               # Cobra commands
│   ├── internal/          # API client, auth, config
│   └── demo.tape          # VHS demo script
├── terraform/             # Infrastructure as code
└── .github/workflows/     # CI/CD (auto-release, demo GIF generation)
```

## License

[MIT](LICENSE)
