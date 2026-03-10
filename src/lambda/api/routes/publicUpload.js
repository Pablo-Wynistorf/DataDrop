import { Router } from "express";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
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

// Middleware to validate upload token
function validateUploadToken(req, res, next) {
  const token = req.params.token || req.query.token;
  if (!token) {
    return res.status(400).json({ error: "Missing upload token" });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.type !== "upload_url") {
      return res.status(400).json({ error: "Invalid token type" });
    }
    req.uploadProject = decoded;
    req.uploadToken = token;
    next();
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      return res.status(410).json({ error: "Upload link has expired" });
    }
    return res.status(400).json({ error: "Invalid upload link" });
  }
}

// Get upload project info (public, token-validated)
router.get("/:token/info", validateUploadToken, async (req, res) => {
  try {
    const result = await docClient.send(new GetCommand({
      TableName: UPLOAD_URLS_TABLE,
      Key: { id: req.uploadProject.projectId }
    }));

    if (!result.Item) {
      return res.status(404).json({ error: "Upload project not found" });
    }

    const project = result.Item;

    // Check TTL expiry
    if (project.ttl && project.ttl < Math.floor(Date.now() / 1000)) {
      return res.status(410).json({ error: "Upload link has expired" });
    }

    res.json({
      name: project.name,
      description: project.description || "",
      maxFileSizeMB: Math.round(project.maxFileSizeBytes / (1024 * 1024)),
      maxFileSizeBytes: project.maxFileSizeBytes,
      expiresAt: project.expiresAt,
      fileCount: project.fileCount || 0
    });
  } catch (error) {
    console.error("Get upload info error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Request presigned upload URL (public, token-validated)
router.post("/:token/upload", validateUploadToken, async (req, res) => {
  try {
    const { fileName, fileType, fileSize } = req.body;

    if (!fileName || !fileType) {
      return res.status(400).json({ error: "Missing fileName or fileType" });
    }

    if (!fileSize || fileSize <= 0) {
      return res.status(400).json({ error: "Missing or invalid fileSize" });
    }

    // Get project info
    const projectResult = await docClient.send(new GetCommand({
      TableName: UPLOAD_URLS_TABLE,
      Key: { id: req.uploadProject.projectId }
    }));

    if (!projectResult.Item) {
      return res.status(404).json({ error: "Upload project not found" });
    }

    const project = projectResult.Item;

    // Check TTL expiry
    if (project.ttl && project.ttl < Math.floor(Date.now() / 1000)) {
      return res.status(410).json({ error: "Upload link has expired" });
    }

    // Check file size limit
    if (fileSize > project.maxFileSizeBytes) {
      const maxMB = Math.round(project.maxFileSizeBytes / (1024 * 1024));
      return res.status(413).json({
        error: `File size exceeds the limit of ${maxMB}MB for this upload link`,
        maxFileSizeBytes: project.maxFileSizeBytes
      });
    }

    const fileId = uuidv4();
    const s3Key = `uploads/${fileId}/${fileName}`;

    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: s3Key,
      ContentType: fileType,
      ContentLength: fileSize
    });

    const uploadUrl = await getSignedUrl(s3Client, command, {
      expiresIn: 3600,
      signableHeaders: new Set(["content-length", "content-type", "host"])
    });

    // Default retention: 30 days for upload URL files
    const retentionSeconds = 30 * 24 * 60 * 60;
    const ttl = Math.floor(Date.now() / 1000) + retentionSeconds;
    const expiresAt = new Date(ttl * 1000).toISOString();

    const item = {
      id: fileId,
      userId: project.userId,
      fileName,
      fileType,
      fileSize,
      s3Key,
      bucket: BUCKET_NAME,
      uploadType: "private",
      cdnUrl: null,
      createdAt: new Date().toISOString(),
      status: "pending",
      downloadCount: 0,
      folderPath: `/${project.name}`,
      ttl,
      expiresAt,
      uploadProjectId: project.id,
      uploadedVia: "upload_url"
    };

    await docClient.send(new PutCommand({
      TableName: FILES_TABLE,
      Item: item
    }));

    // Increment file count on project
    await docClient.send(new UpdateCommand({
      TableName: UPLOAD_URLS_TABLE,
      Key: { id: project.id },
      UpdateExpression: "SET fileCount = if_not_exists(fileCount, :zero) + :one, totalSize = if_not_exists(totalSize, :zero) + :size",
      ExpressionAttributeValues: { ":zero": 0, ":one": 1, ":size": fileSize }
    }));

    res.json({
      uploadUrl,
      fileId,
      s3Key
    });
  } catch (error) {
    console.error("Public upload error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Confirm upload (public, token-validated)
router.post("/:token/confirm/:fileId", validateUploadToken, async (req, res) => {
  try {
    const { fileId } = req.params;

    const file = await docClient.send(new GetCommand({
      TableName: FILES_TABLE,
      Key: { id: fileId }
    }));

    if (!file.Item || file.Item.uploadProjectId !== req.uploadProject.projectId) {
      return res.status(404).json({ error: "File not found" });
    }

    await docClient.send(new UpdateCommand({
      TableName: FILES_TABLE,
      Key: { id: fileId },
      UpdateExpression: "SET #status = :status",
      ConditionExpression: "uploadProjectId = :projectId",
      ExpressionAttributeNames: { "#status": "status" },
      ExpressionAttributeValues: { ":status": "uploaded", ":projectId": req.uploadProject.projectId }
    }));

    res.json({ success: true });
  } catch (error) {
    console.error("Confirm public upload error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
