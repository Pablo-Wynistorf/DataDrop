# DataDrop CLI Demo
# Generate with:
#   1. Run `datadrop login` first in your real terminal
#   2. Then run `vhs demo.tape`

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
Sleep 2s

# Show help
Type "datadrop --help"
Enter
Sleep 4s

# Check login status
Type "datadrop status"
Enter
Sleep 3s

# Create test files
Type "echo 'Hello from DataDrop CLI!' > demo-file.txt"
Enter
Sleep 1s

Type "echo 'Second file for batch demo' > demo-file2.txt"
Enter
Sleep 1s

# Upload a private file with expiry and download limit
Type "datadrop upload demo-file.txt --type private --expires 86400 --max-downloads 10"
Enter
Sleep 10s

# Upload second file
Type "datadrop upload demo-file2.txt"
Enter
Sleep 10s

# List all files
Type "datadrop list"
Enter
Sleep 4s

# Show file info
Type "datadrop info demo-file.txt"
Enter
Sleep 4s

# Share with QR code
Type "datadrop share demo-file.txt --qr"
Enter
Sleep 6s

# Get URL with custom expiry
Type "datadrop get-url demo-file.txt --expires 3600"
Enter
Sleep 4s

# Download the file
Type "datadrop download demo-file.txt -o /tmp/"
Enter
Sleep 10s

# Rename a file
Type "datadrop rename demo-file2.txt --name renamed-demo.txt"
Enter
Sleep 4s

# Delete the renamed file
Type "datadrop delete renamed-demo.txt --force"
Enter
Sleep 4s

# Check for updates
Type "datadrop update"
Enter
Sleep 5s

# Logout
Type "datadrop logout"
Enter
Sleep 3s

# Clean up
Type "rm -f demo-file.txt demo-file2.txt"
Enter
Sleep 1s

Type "# That's DataDrop CLI! 🚀"
Sleep 3s
