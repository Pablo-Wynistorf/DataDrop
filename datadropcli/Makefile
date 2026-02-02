.PHONY: build build-all clean install

BINARY_NAME=datadrop
VERSION?=1.0.0

# Build for current platform
build:
	go build -ldflags="-s -w" -o bin/$(BINARY_NAME) .

# Build for all platforms
build-all: build-linux-amd64 build-linux-arm64 build-darwin-amd64 build-darwin-arm64 build-windows

build-linux-amd64:
	GOOS=linux GOARCH=amd64 go build -ldflags="-s -w" -o bin/$(BINARY_NAME)-linux-amd64 .

build-linux-arm64:
	GOOS=linux GOARCH=arm64 go build -ldflags="-s -w" -o bin/$(BINARY_NAME)-linux-arm64 .

build-darwin-amd64:
	GOOS=darwin GOARCH=amd64 go build -ldflags="-s -w" -o bin/$(BINARY_NAME)-darwin-amd64 .

build-darwin-arm64:
	GOOS=darwin GOARCH=arm64 go build -ldflags="-s -w" -o bin/$(BINARY_NAME)-darwin-arm64 .

build-windows:
	GOOS=windows GOARCH=amd64 go build -ldflags="-s -w" -o bin/$(BINARY_NAME)-windows-amd64.exe .

# Install to GOPATH/bin
install:
	go install .

# Clean build artifacts
clean:
	rm -rf bin/

# Run tests
test:
	go test ./...

# Download dependencies
deps:
	go mod download
	go mod tidy
