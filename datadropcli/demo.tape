# DataDrop CLI Demo
# Generate with: vhs demo.tape

Output demo.gif

Require datadrop

Set Shell "bash"
Set FontSize 16
Set Width 1000
Set Height 600
Set Padding 20
Set Theme "Catppuccin Mocha"
Set TypingSpeed 50ms

# Show version
Type "datadrop version"
Enter
Sleep 1s

# Show help
Type "datadrop --help"
Enter
Sleep 3s

# Login
Type "datadrop login"
Enter
Sleep 2s

# Check login status
Type "datadrop status"
Enter
Sleep 1.5s

# Upload a private file with options
Type "datadrop upload secret.pdf --type private --expires 86400 --max-downloads 5"
Enter
Sleep 3s

# Upload a CDN file
Type "datadrop upload image.png --type cdn"
Enter
Sleep 3s

# Batch upload
Type "datadrop upload *.txt"
Enter
Sleep 3s

# Upload and copy share URL to clipboard
Type "datadrop upload notes.md --clipboard"
Enter
Sleep 3s

# List files
Type "datadrop list"
Enter
Sleep 2s

# Get file info
Type "datadrop info notes.md"
Enter
Sleep 2s

# Share a file with QR code
Type "datadrop share notes.md --qr"
Enter
Sleep 4s

# Get URL with expiry
Type "datadrop get-url notes.md --expires 3600"
Enter
Sleep 2s

# Download a file
Type "datadrop download notes.md -o ~/Downloads/"
Enter
Sleep 3s

# Rename a file
Type "datadrop rename notes.md --name renamed.md"
Enter
Sleep 2s

# Delete a file
Type "datadrop delete renamed.md --force"
Enter
Sleep 2s

# Shell completion
Type "datadrop completion zsh > /dev/null && echo '✓ Shell completion generated'"
Enter
Sleep 1.5s

# Update CLI
Type "datadrop update"
Enter
Sleep 2s

# Logout
Type "datadrop logout"
Enter
Sleep 1.5s

Type "# That's DataDrop CLI! 🚀"
Sleep 2s
