package cmd

import (
	"fmt"
	"os/exec"
	"strings"
)

func copyToClipboardOS(text string) error {
	// Try xclip first, then xsel
	for _, tool := range []string{"xclip", "xsel"} {
		if _, err := exec.LookPath(tool); err == nil {
			var cmd *exec.Cmd
			if tool == "xclip" {
				cmd = exec.Command("xclip", "-selection", "clipboard")
			} else {
				cmd = exec.Command("xsel", "--clipboard", "--input")
			}
			cmd.Stdin = strings.NewReader(text)
			return cmd.Run()
		}
	}
	return fmt.Errorf("no clipboard tool found (install xclip or xsel)")
}
