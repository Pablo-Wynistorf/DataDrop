#!/bin/bash
set -e

# DataDrop CLI Installer
# Usage: curl -fsSL https://your-domain.com/install.sh | bash

GITHUB_REPO="pablo-wynistorf/datadrop"
INSTALL_DIR="/usr/local/bin"
BINARY_NAME="datadrop"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}"
echo "  ____        _        ____                   "
echo " |  _ \  __ _| |_ __ _|  _ \ _ __ ___  _ __   "
echo " | | | |/ _\` | __/ _\` | | | | '__/ _ \| '_ \  "
echo " | |_| | (_| | || (_| | |_| | | | (_) | |_) | "
echo " |____/ \__,_|\__\__,_|____/|_|  \___/| .__/  "
echo "                                      |_|     "
echo -e "${NC}"
echo "CLI Installer"
echo ""

# Detect OS and architecture
OS=$(uname -s | tr '[:upper:]' '[:lower:]')
ARCH=$(uname -m)

case "$OS" in
    linux)
        OS="linux"
        ;;
    darwin)
        OS="darwin"
        ;;
    mingw*|msys*|cygwin*)
        echo -e "${RED}Windows detected. Please download manually from GitHub releases.${NC}"
        exit 1
        ;;
    *)
        echo -e "${RED}Unsupported operating system: $OS${NC}"
        exit 1
        ;;
esac

case "$ARCH" in
    x86_64|amd64)
        ARCH="amd64"
        ;;
    arm64|aarch64)
        ARCH="arm64"
        ;;
    *)
        echo -e "${RED}Unsupported architecture: $ARCH${NC}"
        exit 1
        ;;
esac

BINARY="datadrop-${OS}-${ARCH}"
echo -e "${YELLOW}Detected: ${OS}/${ARCH}${NC}"

# Get latest release version
echo -e "${YELLOW}Fetching latest release...${NC}"
LATEST_VERSION=$(curl -fsSL "https://api.github.com/repos/${GITHUB_REPO}/releases/latest" | grep '"tag_name"' | sed -E 's/.*"([^"]+)".*/\1/')

if [ -z "$LATEST_VERSION" ]; then
    echo -e "${RED}Failed to fetch latest version${NC}"
    exit 1
fi

echo -e "${GREEN}Latest version: ${LATEST_VERSION}${NC}"

# Download URL
DOWNLOAD_URL="https://github.com/${GITHUB_REPO}/releases/download/${LATEST_VERSION}/${BINARY}"

# Create temp directory
TMP_DIR=$(mktemp -d)
trap "rm -rf $TMP_DIR" EXIT

# Download binary
echo -e "${YELLOW}Downloading ${BINARY}...${NC}"
if ! curl -fsSL "$DOWNLOAD_URL" -o "$TMP_DIR/$BINARY_NAME"; then
    echo -e "${RED}Failed to download binary${NC}"
    exit 1
fi

# Make executable
chmod +x "$TMP_DIR/$BINARY_NAME"

# Install
echo -e "${YELLOW}Installing to ${INSTALL_DIR}...${NC}"
if [ -w "$INSTALL_DIR" ]; then
    mv "$TMP_DIR/$BINARY_NAME" "$INSTALL_DIR/$BINARY_NAME"
else
    echo -e "${YELLOW}Requesting sudo access to install to ${INSTALL_DIR}${NC}"
    sudo mv "$TMP_DIR/$BINARY_NAME" "$INSTALL_DIR/$BINARY_NAME"
fi

# Verify installation
if command -v datadrop &> /dev/null; then
    echo ""
    echo -e "${GREEN}✓ DataDrop CLI installed successfully!${NC}"
    echo ""
    datadrop version
    echo ""
    echo -e "${BLUE}Get started:${NC}"
    echo "  datadrop login --api https://your-datadrop-url"
    echo "  datadrop upload myfile.txt"
    echo "  datadrop list"
    echo ""
else
    echo ""
    echo -e "${GREEN}✓ DataDrop CLI installed to ${INSTALL_DIR}/${BINARY_NAME}${NC}"
    echo ""
    echo -e "${YELLOW}Note: Make sure ${INSTALL_DIR} is in your PATH${NC}"
    echo ""
fi
