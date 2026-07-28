import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

// Multi-page build: the main dashboard, the public download page, and the
// public upload page each get their own HTML entry point. CloudFront serves
// them at "/", "/file" and "/upload" respectively.
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        file: resolve(__dirname, "file.html"),
        upload: resolve(__dirname, "upload.html"),
      },
    },
  },
  server: {
    proxy: {
      "/api": "http://localhost:3000",
    },
  },
});
