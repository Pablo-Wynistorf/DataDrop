import { Router } from "express";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, GetCommand, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { v4 as uuidv4 } from "uuid";
import jwt from "jsonwebtoken";

const router = Router();
const s3Client = new S3Client({});
const ddbClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(ddbClient);

const BUCKET_NAME = process.env.BUCKET_NAME;
const FILES_TABLE = process.env.FILES_TABLE;
const UPLOAD_URLS_TABLE = process.env.UPLOAD_URLS_TABLE;
const JWT_SECRET = process.env.JWT_SECRET || "default-secret-change-me";
const FRONTEND_URL = process.env.FRONTEND_URL;

// Create a new upload URL project
router.post("/", async (req, res) => {
  try {
    const { name, maxFileSizeMB, expiresInSeconds, description } = req.body;

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return res.status(400).json({ error: "Project name is required" });
    }

    // Validate name (alphanumeric, hyphens, underscores)
    const sanitizedName = name.trim().replace(/[^a-zA-Z0-9_-]/g, "_");

    const maxSize = maxFileSizeMB ? parseInt(maxFileSizeMB, 10) * 1024 * 1024 : 100 * 1024 * 1024; // default 100MB
    const linkExpiry = expiresInSeconds ? Math.max(3600, parseInt(expiresInSeconds, 10)) : 7 * 24 * 3600; // default 7 days, min 1 hour

    const projectId = uuidv4();
    const ttl = Math.floor(Date.now() / 1000) + linkExpiry;
    const expiresAt = new Date(ttl * 1000).toISOString();

    const token = jwt.sign(
      { projectId, type: "upload_url" },
      JWT_SECRET,
      { expiresIn: linkExpiry }
    );

    const baseUrl = FRONTEND_URL.startsWith("https://") ? FRONTEND_URL : `https://${FRONTEND_URL}`;
    const uploadPageUrl = `${baseUrl}/upload?token=${token}`;

    const item = {
      id: projectId,
      userId: req.user.userId,
      name: sanitizedName,
      description: description || "",
      maxFileSizeBytes: maxSize,
      createdAt: new Date().toISOString(),
      expiresAt,
      ttl,
      fileCount: 0,
      totalSize: 0,
      token
    };

    await docClient.send(new PutCommand({
      TableName: UPLOAD_URLS_TABLE,
      Item: item
    }));

    res.json({
      projectId,
      name: sanitizedName,
      uploadUrl: uploadPageUrl,
      token,
      maxFileSizeMB: Math.round(maxSize / (1024 * 1024)),
      expiresAt
    });
  } catch (error) {
    console.error("Create upload URL error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// List upload URL projects for the current user
router.get("/", async (req, res) => {
  try {
    const result = await docClient.send(new QueryCommand({
      TableName: UPLOAD_URLS_TABLE,
      IndexName: "userId-index",
      KeyConditionExpression: "userId = :userId",
      ExpressionAttributeValues: { ":userId": req.user.userId }
    }));

    const projects = (result.Items || []).map(p => ({
      ...p,
      isExpired: p.ttl && p.ttl < Math.floor(Date.now() / 1000)
    }));

    res.json({ projects });
  } catch (error) {
    console.error("List upload URLs error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get upload URL project details
router.get("/:projectId", async (req, res) => {
  try {
    const { projectId } = req.params;

    const result = await docClient.send(new GetCommand({
      TableName: UPLOAD_URLS_TABLE,
      Key: { id: projectId }
    }));

    if (!result.Item || result.Item.userId !== req.user.userId) {
      return res.status(404).json({ error: "Upload project not found" });
    }

    // Get files in this project
    const filesResult = await docClient.send(new QueryCommand({
      TableName: FILES_TABLE,
      IndexName: "userId-index",
      KeyConditionExpression: "userId = :userId",
      ExpressionAttributeValues: { ":userId": req.user.userId }
    }));

    const projectFolder = `/${result.Item.name}`;
    const projectFiles = (filesResult.Items || []).filter(f => f.folderPath === projectFolder);

    res.json({
      project: {
        ...result.Item,
        isExpired: result.Item.ttl && result.Item.ttl < Math.floor(Date.now() / 1000)
      },
      files: projectFiles
    });
  } catch (error) {
    console.error("Get upload URL project error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
