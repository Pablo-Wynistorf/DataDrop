# DataDrop CLI

A command-line tool for uploading, downloading, sharing, and managing files on DataDrop.

<p align="center">
  <img src="demo.gif" alt="DataDrop CLI Demo" width="800" />
</p>

## Install

```bash
curl -fsSL https://raw.githubusercontent.com/pablo-wynistorf/datadrop/main/src/web/public/install.sh | bash
```

Or download a binary from [Releases](https://github.com/pablo-wynistorf/datadrop/releases).

## Quick Start

```bash
# Login (defaults to https://datadrop.onedns.ch)
datadrop login

# Upload a file
datadrop upload myfile.txt

# List your files
datadrop list

# Download a file
datadrop download myfile.txt
```

## Commands

| Command | Description |
|---------|-------------|
| `login` | Authenticate with DataDrop |
| `logout` | Remove stored credentials |
| `upload` | Upload files (supports globs and directories) |
| `download` | Download a file to your machine |
| `list` | List all your files |
| `share` | Generate a shareable URL (with optional `--qr`) |
| `get-url` | Alias for share |
| `info` | Show detailed file metadata |
| `rename` | Rename a file |
| `delete` | Delete a file |
| `status` | Show login status |
| `update` | Update CLI to the latest version |
| `completion` | Generate shell completions (bash/zsh/fish/powershell) |
| `version` | Print version |

## File Selection

All commands that target a file accept a positional argument that auto-detects whether you're passing an ID or a file name:

```bash
datadrop share myfile.txt
datadrop share abc12345-xxxx-xxxx-xxxx-xxxxxxxxxxxx
datadrop download myfile.txt -o ~/Downloads/
datadrop delete myfile.txt --force
datadrop info myfile.txt
datadrop rename myfile.txt --name newname.txt
```

If multiple files share the same name, you'll get an interactive picker.

Flags `--id`, `--name`, and `--file` are also supported for backward compatibility.

## Upload Options

```bash
# Private file with expiry and download limit
datadrop upload secret.pdf --type private --expires 86400 --max-downloads 5

# CDN file (permanent public URL)
datadrop upload image.png --type cdn

# Batch upload
datadrop upload *.txt
datadrop upload ./my-folder

# Copy share URL to clipboard after upload
datadrop upload myfile.txt --clipboard
```

## Shell Completion

```bash
# Bash
source <(datadrop completion bash)

# Zsh (add to ~/.zshrc)
source <(datadrop completion zsh)

# Fish
datadrop completion fish | source
```
