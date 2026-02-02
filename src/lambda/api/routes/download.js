import { Router } from "express";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import jwt from "jsonwebtoken";

const router = Router();
const s3Client = new S3Client({});
const ddbClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(ddbClient);
const sqsClient = new SQSClient({});

const BUCKET_NAME = process.env.BUCKET_NAME;
const FILES_TABLE = process.env.FILES_TABLE;
const JWT_SECRET = process.env.JWT_SECRET || "default-secret-change-me";
const FILE_DELETION_QUEUE_URL = process.env.FILE_DELETION_QUEUE_URL;

// Get file info from JWT token
router.get("/:token/info", async (req, res) => {
  try {
    const { token } = req.params;

    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      if (err.name === "TokenExpiredError") {
        return res.status(410).json({ error: "Link expired" });
      }
      return res.status(400).json({ error: "Invalid link" });
    }

    const file = await docClient.send(new GetCommand({
      TableName: FILES_TABLE,
      Key: { id: decoded.fileId }
    }));

    if (!file.Item) {
      return res.status(404).json({ error: "File not found" });
    }

    const fileData = file.Item;

    // Check if file is private type
    if (fileData.uploadType !== "private") {
      return res.status(400).json({ error: "Invalid file type for this endpoint" });
    }

    // Check if file has expired (TTL)
    if (fileData.ttl && fileData.ttl < Math.floor(Date.now() / 1000)) {
      return res.status(410).json({ error: "File has expired" });
    }

    // Check download limit
    const downloadsRemaining = fileData.maxDownloads 
      ? Math.max(0, fileData.maxDownloads - (fileData.downloadCount || 0))
      : null;

    if (fileData.maxDownloads && downloadsRemaining <= 0) {
      return res.status(410).json({ error: "Download limit reached" });
    }

    res.json({
      fileName: fileData.fileName,
      fileSize: fileData.fileSize,
      requiresPassword: false,
      expiresAt: decoded.exp ? new Date(decoded.exp * 1000).toISOString() : null,
      fileExpiresAt: fileData.expiresAt || null,
      downloadsRemaining,
      maxDownloads: fileData.maxDownloads || null
    });
  } catch (error) {
    console.error("File info error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get download URL from JWT token
router.post("/:token", async (req, res) => {
  try {
    const { token } = req.params;

    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      if (err.name === "TokenExpiredError") {
        return res.status(410).json({ error: "Link expired" });
      }
      return res.status(400).json({ error: "Invalid link" });
    }

    const file = await docClient.send(new GetCommand({
      TableName: FILES_TABLE,
      Key: { id: decoded.fileId }
    }));

    if (!file.Item) {
      return res.status(404).json({ error: "File not found" });
    }

    const fileData = file.Item;

    // Check if file is private type
    if (fileData.uploadType !== "private") {
      return res.status(400).json({ error: "Invalid file type for this endpoint" });
    }

    // Check if file has expired (TTL)
    if (fileData.ttl && fileData.ttl < Math.floor(Date.now() / 1000)) {
      return res.status(410).json({ error: "File has expired" });
    }

    // Check download limit before incrementing
    if (fileData.maxDownloads) {
      const currentDownloads = fileData.downloadCount || 0;
      if (currentDownloads >= fileData.maxDownloads) {
        return res.status(410).json({ error: "Download limit reached" });
      }
    }

    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: fileData.s3Key,
      ResponseContentDisposition: `attachment; filename="${fileData.fileName}"`
    });

    const downloadUrl = await getSignedUrl(s3Client, command, { expiresIn: 300 });

    // Increment download count and check if we should delete
    const updateResult = await docClient.send(new UpdateCommand({
      TableName: FILES_TABLE,
      Key: { id: decoded.fileId },
      UpdateExpression: "SET downloadCount = if_not_exists(downloadCount, :zero) + :one",
      ExpressionAttributeValues: { ":zero": 0, ":one": 1 },
      ReturnValues: "ALL_NEW"
    }));

    const updatedFile = updateResult.Attributes;

    // If download limit reached after this download, queue for deletion
    if (updatedFile.maxDownloads && updatedFile.downloadCount >= updatedFile.maxDownloads) {
      console.log(`Download limit reached for file ${decoded.fileId}, queuing for deletion...`);
      
      await sqsClient.send(new SendMessageCommand({
        QueueUrl: FILE_DELETION_QUEUE_URL,
        MessageBody: JSON.stringify({
          fileId: decoded.fileId,
          userId: fileData.userId,
          reason: "download_limit_reached"
        })
      }));
    }

    res.json({ 
      downloadUrl, 
      fileName: fileData.fileName,
      downloadsRemaining: updatedFile.maxDownloads 
        ? Math.max(0, updatedFile.maxDownloads - updatedFile.downloadCount)
        : null
    });
  } catch (error) {
    console.error("Download error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
