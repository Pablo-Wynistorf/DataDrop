import serverlessExpress from "@codegenie/serverless-express";
import express from "express";
import cookieParser from "cookie-parser";
import authRoutes from "./routes/auth.js";
import uploadRoutes from "./routes/upload.js";
import filesRoutes from "./routes/files.js";
import downloadRoutes from "./routes/download.js";
import { requireAuth } from "./middleware/auth.js";

const app = express();

app.use(express.json());
app.use(cookieParser());

const FRONTEND_URL = process.env.FRONTEND_URL || "";

app.use((req, res, next) => {
  const origin = req.headers.origin;
  // Allow frontend URL and CLI requests (no origin)
  if (origin === FRONTEND_URL || !origin) {
    res.header("Access-Control-Allow-Origin", origin || "*");
  }
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.header("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  res.header("Access-Control-Allow-Credentials", "true");
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

// Auth routes (login/callback don't need auth, verify needs the middleware)
app.use("/api/auth", authRoutes);

// Protected routes
app.use("/api/upload", requireAuth, uploadRoutes);
app.use("/api/files", requireAuth, filesRoutes);
app.use("/api/file", downloadRoutes);

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

export const handler = serverlessExpress({ app });
