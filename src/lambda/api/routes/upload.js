import { Router } from "express";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import { v4 as uuidv4 } from "uuid";

const router = Router();
const s3Client = new S3Client({});
const ddbClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(ddbClient);

const BUCKET_NAME = process.env.BUCKET_NAME;
const CDN_BUCKET_NAME = process.env.CDN_BUCKET_NAME;
const CDN_URL = process.env.CDN_URL;
const FILES_TABLE = process.env.FILES_TABLE;

// Default retention: 7 days
const DEFAULT_RETENTION_SECONDS = 7 * 24 * 60 * 60;
// Max retention: 30 days
const MAX_RETENTION_SECONDS = 30 * 24 * 60 * 60;

router.post("/", async (req, res) => {
  try {
    const { fileName, fileType, fileSize, uploadType, expiresAt, expiresInSeconds, maxDownloads } = req.body;

    if (!fileName || !fileType) {
      return res.status(400).json({ error: "Missing fileName or fileType" });
    }

    if (!fileSize || fileSize <= 0) {
      return res.status(400).json({ error: "Missing or invalid fileSize" });
    }

    const isCdn = uploadType === "cdn";

    // Check role-based permissions
    if (isCdn && !req.user.canUploadCdn) {
      return res.status(403).json({ error: "You don't have permission to upload CDN files. Required role: cdnUser" });
    }
    if (!isCdn && !req.user.canUploadFile) {
      return res.status(403).json({ error: "You don't have permission to upload private files. Required role: fileUser" });
    }

    // Check file size limit
    if (fileSize && fileSize > req.user.maxFileSizeBytes) {
      const maxSizeGB = req.user.maxFileSizeBytes / (1024 * 1024 * 1024);
      return res.status(413).json({ 
        error: `File size exceeds your limit of ${maxSizeGB}GB. Add fileSize_X role to increase.`,
        maxFileSizeBytes: req.user.maxFileSizeBytes
      });
    }

    const fileId = uuidv4();
    const bucket = isCdn ? CDN_BUCKET_NAME : BUCKET_NAME;
    const s3Key = isCdn ? `${fileId}/${fileName}` : `uploads/${fileId}/${fileName}`;

    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: s3Key,
      ContentType: fileType,
      ContentLength: fileSize
    });

    // Sign the content-length header to enforce file size at S3 level
    // This prevents users from uploading larger files than declared
    const uploadUrl = await getSignedUrl(s3Client, command, { 
      expiresIn: 3600,
      signableHeaders: new Set(['content-length', 'content-type', 'host'])
    });

    // For CDN files, generate the public URL
    const cdnUrl = isCdn ? `${CDN_URL}/${fileId}/${encodeURIComponent(fileName)}` : null;

    // Calculate TTL for private files
    let ttl = null;
    let fileExpiresAt = null;
    
    if (!isCdn) {
      let retentionSeconds = DEFAULT_RETENTION_SECONDS;
      
      if (expiresAt) {
        // Custom expiry date provided
        const expiryDate = new Date(expiresAt);
        const now = Date.now();
        retentionSeconds = Math.floor((expiryDate.getTime() - now) / 1000);
      } else if (expiresInSeconds) {
        retentionSeconds = parseInt(expiresInSeconds, 10);
      }
      
      // Clamp retention to valid range
      retentionSeconds = Math.max(60, Math.min(retentionSeconds, MAX_RETENTION_SECONDS));
      
      ttl = Math.floor(Date.now() / 1000) + retentionSeconds;
      fileExpiresAt = new Date(ttl * 1000).toISOString();
    }

    // Validate maxDownloads
    let downloadLimit = null;
    if (!isCdn && maxDownloads) {
      downloadLimit = Math.max(1, parseInt(maxDownloads, 10));
    }

    const item = {
      id: fileId,
      userId: req.user.userId,
      fileName,
      fileType,
      fileSize: fileSize,
      s3Key,
      bucket,
      uploadType: isCdn ? "cdn" : "private",
      cdnUrl,
      createdAt: new Date().toISOString(),
      status: "pending",
      downloadCount: 0
    };

    // Add TTL and expiry for private files
    if (!isCdn) {
      item.ttl = ttl;
      item.expiresAt = fileExpiresAt;
      if (downloadLimit) {
        item.maxDownloads = downloadLimit;
      }
    }

    await docClient.send(new PutCommand({
      TableName: FILES_TABLE,
      Item: item
    }));

    res.json({ 
      uploadUrl, 
      fileId, 
      s3Key, 
      cdnUrl,
      expiresAt: fileExpiresAt,
      maxDownloads: downloadLimit,
      maxFileSizeBytes: req.user.maxFileSizeBytes
    });
  } catch (error) {
    console.error("Upload error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
