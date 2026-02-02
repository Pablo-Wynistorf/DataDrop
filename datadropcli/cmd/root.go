package cmd

import (
	"fmt"

	"github.com/spf13/cobra"
)

var version = "dev"

func SetVersion(v string) {
	version = v
}

var rootCmd = &cobra.Command{
	Use:   "datadrop",
	Short: "DataDrop CLI - Upload and manage files",
	Long:  `DataDrop CLI allows you to upload, list, and manage files from the command line.`,
}

var versionCmd = &cobra.Command{
	Use:   "version",
	Short: "Print the version number",
	Run: func(cmd *cobra.Command, args []string) {
		fmt.Printf("DataDrop CLI %s\n", version)
	},
}

func Execute() error {
	return rootCmd.Execute()
}

func init() {
	rootCmd.AddCommand(loginCmd)
	rootCmd.AddCommand(logoutCmd)
	rootCmd.AddCommand(uploadCmd)
	rootCmd.AddCommand(listCmd)
	rootCmd.AddCommand(getURLCmd)
	rootCmd.AddCommand(deleteCmd)
	rootCmd.AddCommand(statusCmd)
	rootCmd.AddCommand(versionCmd)
}
