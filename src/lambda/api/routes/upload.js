import { Router } from "express";
import { S3Client, PutObjectCommand, CreateMultipartUploadCommand, UploadPartCommand, CompleteMultipartUploadCommand, AbortMultipartUploadCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { v4 as uuidv4 } from "uuid";

// 5GB threshold for multipart uploads
const MULTIPART_THRESHOLD = 5 * 1024 * 1024 * 1024;
// Part size: 100MB
const PART_SIZE = 100 * 1024 * 1024;

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
    // CDN files stored with cdn/ prefix to match CloudFront path pattern directly
    const s3Key = isCdn ? `cdn/${fileId}/${fileName}` : `uploads/${fileId}/${fileName}`;

    // For files > 5GB, use multipart upload
    const useMultipart = fileSize > MULTIPART_THRESHOLD;

    let uploadUrl = null;
    let multipartUploadId = null;
    let partCount = null;

    if (useMultipart) {
      // Initiate multipart upload
      const createCommand = new CreateMultipartUploadCommand({
        Bucket: bucket,
        Key: s3Key,
        ContentType: fileType
      });
      const multipartResult = await s3Client.send(createCommand);
      multipartUploadId = multipartResult.UploadId;
      partCount = Math.ceil(fileSize / PART_SIZE);
    } else {
      const command = new PutObjectCommand({
        Bucket: bucket,
        Key: s3Key,
        ContentType: fileType,
        ContentLength: fileSize
      });

      // Sign the content-length header to enforce file size at S3 level
      uploadUrl = await getSignedUrl(s3Client, command, { 
        expiresIn: 3600,
        signableHeaders: new Set(['content-length', 'content-type', 'host'])
      });
    }

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

    // Add multipart info if applicable
    if (useMultipart) {
      item.multipartUploadId = multipartUploadId;
      item.partCount = partCount;
      item.partSize = PART_SIZE;
    }

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
      maxFileSizeBytes: req.user.maxFileSizeBytes,
      multipart: useMultipart ? {
        uploadId: multipartUploadId,
        partCount,
        partSize: PART_SIZE
      } : null
    });
  } catch (error) {
    console.error("Upload error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get presigned URL for a multipart upload part
router.post("/:fileId/part", async (req, res) => {
  try {
    const { fileId } = req.params;
    const { partNumber } = req.body;

    if (!partNumber || partNumber < 1) {
      return res.status(400).json({ error: "Invalid partNumber" });
    }

    // Get file info from DynamoDB
    const result = await docClient.send(new GetCommand({
      TableName: FILES_TABLE,
      Key: { id: fileId }
    }));

    if (!result.Item) {
      return res.status(404).json({ error: "File not found" });
    }

    const file = result.Item;

    // Verify ownership
    if (file.userId !== req.user.userId) {
      return res.status(403).json({ error: "Access denied" });
    }

    // Verify this is a multipart upload
    if (!file.multipartUploadId) {
      return res.status(400).json({ error: "Not a multipart upload" });
    }

    // Verify part number is valid
    if (partNumber > file.partCount) {
      return res.status(400).json({ error: "Part number exceeds total parts" });
    }

    // Generate presigned URL for this part
    const command = new UploadPartCommand({
      Bucket: file.bucket,
      Key: file.s3Key,
      UploadId: file.multipartUploadId,
      PartNumber: partNumber
    });

    const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });

    res.json({ uploadUrl, partNumber });
  } catch (error) {
    console.error("Part URL error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Complete multipart upload
router.post("/:fileId/complete", async (req, res) => {
  try {
    const { fileId } = req.params;
    const { parts } = req.body; // Array of { partNumber, etag }

    if (!parts || !Array.isArray(parts) || parts.length === 0) {
      return res.status(400).json({ error: "Missing parts array" });
    }

    // Get file info from DynamoDB
    const result = await docClient.send(new GetCommand({
      TableName: FILES_TABLE,
      Key: { id: fileId }
    }));

    if (!result.Item) {
      return res.status(404).json({ error: "File not found" });
    }

    const file = result.Item;

    // Verify ownership
    if (file.userId !== req.user.userId) {
      return res.status(403).json({ error: "Access denied" });
    }

    // Verify this is a multipart upload
    if (!file.multipartUploadId) {
      return res.status(400).json({ error: "Not a multipart upload" });
    }

    // Complete the multipart upload
    const command = new CompleteMultipartUploadCommand({
      Bucket: file.bucket,
      Key: file.s3Key,
      UploadId: file.multipartUploadId,
      MultipartUpload: {
        Parts: parts.map(p => ({
          PartNumber: p.partNumber,
          ETag: p.etag
        }))
      }
    });

    await s3Client.send(command);

    // Update file status
    await docClient.send(new UpdateCommand({
      TableName: FILES_TABLE,
      Key: { id: fileId },
      UpdateExpression: "SET #status = :status REMOVE multipartUploadId, partCount, partSize",
      ExpressionAttributeNames: { "#status": "status" },
      ExpressionAttributeValues: { ":status": "ready" }
    }));

    res.json({ success: true, fileId });
  } catch (error) {
    console.error("Complete multipart error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Abort multipart upload
router.post("/:fileId/abort", async (req, res) => {
  try {
    const { fileId } = req.params;

    // Get file info from DynamoDB
    const result = await docClient.send(new GetCommand({
      TableName: FILES_TABLE,
      Key: { id: fileId }
    }));

    if (!result.Item) {
      return res.status(404).json({ error: "File not found" });
    }

    const file = result.Item;

    // Verify ownership
    if (file.userId !== req.user.userId) {
      return res.status(403).json({ error: "Access denied" });
    }

    // Abort the multipart upload if it exists
    if (file.multipartUploadId) {
      const command = new AbortMultipartUploadCommand({
        Bucket: file.bucket,
        Key: file.s3Key,
        UploadId: file.multipartUploadId
      });
      await s3Client.send(command);
    }

    // Update file status
    await docClient.send(new UpdateCommand({
      TableName: FILES_TABLE,
      Key: { id: fileId },
      UpdateExpression: "SET #status = :status",
      ExpressionAttributeNames: { "#status": "status" },
      ExpressionAttributeValues: { ":status": "aborted" }
    }));

    res.json({ success: true });
  } catch (error) {
    console.error("Abort multipart error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
