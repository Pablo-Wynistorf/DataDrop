import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

// Extensionless routes served by CloudFront -> HTML entry points. "/" is the
// static landing page (no JS bundle at all); the React app lives at "/app".
const ROUTES = {
  "/app": "/app.html",
  "/file": "/file.html",
  "/upload": "/upload.html",
  "/admin": "/admin.html",
};

// Dev-only: mirror the CloudFront path -> S3 key mapping so `npm run dev`
// resolves /app, /file, /upload and /admin like production does.
function routeRewrite() {
  return {
    name: "datadrop-route-rewrite",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        const [path, query] = req.url.split("?");
        const target = ROUTES[path.replace(/\/$/, "")];
        if (target) req.url = query ? `${target}?${query}` : target;
        next();
      });
    },
  };
}

// Multi-page build: the static landing page, the React app, the public download
// page, the public upload page, and the admin page each get their own HTML entry.
export default defineConfig({
  plugins: [react(), routeRewrite()],
  build: {
    outDir: "dist",
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        app: resolve(__dirname, "app.html"),
        file: resolve(__dirname, "file.html"),
        upload: resolve(__dirname, "upload.html"),
        admin: resolve(__dirname, "admin.html"),
      },
    },
  },
  server: {
    proxy: {
      "/api": "http://localhost:3000",
    },
  },
});
