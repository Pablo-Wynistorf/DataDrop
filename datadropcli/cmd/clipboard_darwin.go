package cmd

import (
	"os/exec"
	"strings"
)

func copyToClipboardOS(text string) error {
	cmd := exec.Command("pbcopy")
	cmd.Stdin = strings.NewReader(text)
	return cmd.Run()
}
