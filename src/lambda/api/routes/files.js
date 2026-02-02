import { Router } from "express";
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import jwt from "jsonwebtoken";

const router = Router();
const sqsClient = new SQSClient({});
const ddbClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(ddbClient);

const FILES_TABLE = process.env.FILES_TABLE;
const FILE_DELETION_QUEUE_URL = process.env.FILE_DELETION_QUEUE_URL;
const JWT_SECRET = process.env.JWT_SECRET || "default-secret-change-me";
const FRONTEND_URL = process.env.FRONTEND_URL;

router.get("/", async (req, res) => {
  try {
    const result = await docClient.send(new QueryCommand({
      TableName: FILES_TABLE,
      IndexName: "userId-index",
      KeyConditionExpression: "userId = :userId",
      ExpressionAttributeValues: { ":userId": req.user.userId }
    }));

    // Add computed fields for display
    const files = (result.Items || []).map(file => ({
      ...file,
      // CDN files never expire
      expiresAt: file.uploadType === "cdn" ? null : file.expiresAt,
      isExpired: file.uploadType !== "cdn" && file.ttl && file.ttl < Math.floor(Date.now() / 1000),
      downloadsRemaining: file.maxDownloads ? Math.max(0, file.maxDownloads - (file.downloadCount || 0)) : null
    }));

    res.json({ files });
  } catch (error) {
    console.error("List files error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/:fileId/confirm", async (req, res) => {
  try {
    const { fileId } = req.params;

    const file = await docClient.send(new GetCommand({
      TableName: FILES_TABLE,
      Key: { id: fileId }
    }));

    if (!file.Item || file.Item.userId !== req.user.userId) {
      return res.status(404).json({ error: "File not found" });
    }

    await docClient.send(new UpdateCommand({
      TableName: FILES_TABLE,
      Key: { id: fileId },
      UpdateExpression: "SET #status = :status",
      ExpressionAttributeNames: { "#status": "status" },
      ExpressionAttributeValues: { ":status": "uploaded" }
    }));

    res.json({ success: true });
  } catch (error) {
    console.error("Confirm upload error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Create share link for private files (JWT-based)
router.post("/:fileId/share", async (req, res) => {
  try {
    const { fileId } = req.params;
    const { expiresInSeconds, expiresAt } = req.body;

    const file = await docClient.send(new GetCommand({
      TableName: FILES_TABLE,
      Key: { id: fileId }
    }));

    if (!file.Item || file.Item.userId !== req.user.userId) {
      return res.status(404).json({ error: "File not found" });
    }

    const fileData = file.Item;

    // CDN files don't need JWT - they have a permanent public URL
    if (fileData.uploadType === "cdn") {
      return res.json({ 
        shareUrl: fileData.cdnUrl,
        type: "cdn",
        expiresAt: null,
        maxDownloads: null,
        downloadsRemaining: null
      });
    }

    // Calculate link expiry
    let linkExpirySeconds;
    
    if (expiresAt) {
      const expiryDate = new Date(expiresAt);
      linkExpirySeconds = Math.floor((expiryDate.getTime() - Date.now()) / 1000);
    } else if (expiresInSeconds) {
      linkExpirySeconds = parseInt(expiresInSeconds, 10);
    } else {
      linkExpirySeconds = 86400; // Default 24 hours
    }

    if (linkExpirySeconds < 60) {
      return res.status(400).json({ error: "Link expiry must be at least 60 seconds" });
    }

    // Cap link expiry to file expiry if file has TTL
    if (fileData.ttl) {
      const fileExpiresInSeconds = fileData.ttl - Math.floor(Date.now() / 1000);
      if (linkExpirySeconds > fileExpiresInSeconds) {
        linkExpirySeconds = Math.max(60, fileExpiresInSeconds);
      }
    }

    const token = jwt.sign(
      { fileId: fileData.id },
      JWT_SECRET,
      { expiresIn: linkExpirySeconds }
    );

    const baseUrl = FRONTEND_URL.startsWith("https://") ? FRONTEND_URL : `https://${FRONTEND_URL}`;
    const shareUrl = `${baseUrl}/file?token=${token}`;
    const linkExpiresAt = new Date(Date.now() + linkExpirySeconds * 1000).toISOString();

    const downloadsRemaining = fileData.maxDownloads 
      ? Math.max(0, fileData.maxDownloads - (fileData.downloadCount || 0))
      : null;

    res.json({ 
      shareUrl,
      type: "private",
      expiresAt: linkExpiresAt,
      fileExpiresAt: fileData.expiresAt,
      maxDownloads: fileData.maxDownloads || null,
      downloadsRemaining
    });
  } catch (error) {
    console.error("Create share link error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Edit private file settings (expiry and download limit)
router.patch("/:fileId", async (req, res) => {
  try {
    const { fileId } = req.params;
    const { expiresInSeconds, expiresAt, maxDownloads } = req.body;

    console.log("PATCH request for file:", fileId, "body:", req.body);

    const file = await docClient.send(new GetCommand({
      TableName: FILES_TABLE,
      Key: { id: fileId }
    }));

    if (!file.Item || file.Item.userId !== req.user.userId) {
      return res.status(404).json({ error: "File not found" });
    }

    if (file.Item.uploadType === "cdn") {
      return res.status(400).json({ error: "CDN files cannot be edited" });
    }

    const setParts = [];
    const removeParts = [];
    const expNames = {};
    const expValues = {};

    // Handle expiry update
    if (expiresAt || expiresInSeconds) {
      let newTtl;
      let newExpiresAt;

      if (expiresAt) {
        const expiryDate = new Date(expiresAt);
        if (isNaN(expiryDate.getTime())) {
          return res.status(400).json({ error: "Invalid expiry date format" });
        }
        newTtl = Math.floor(expiryDate.getTime() / 1000);
        newExpiresAt = expiryDate.toISOString();
      } else {
        const seconds = Math.max(60, parseInt(expiresInSeconds, 10) || 604800);
        newTtl = Math.floor(Date.now() / 1000) + seconds;
        newExpiresAt = new Date(newTtl * 1000).toISOString();
      }

      setParts.push("#ttl = :ttl");
      setParts.push("#expiresAt = :expiresAt");
      expNames["#ttl"] = "ttl";
      expNames["#expiresAt"] = "expiresAt";
      expValues[":ttl"] = newTtl;
      expValues[":expiresAt"] = newExpiresAt;
    }

    // Handle maxDownloads update
    if (maxDownloads !== undefined) {
      if (maxDownloads === null || maxDownloads === "" || maxDownloads === "unlimited") {
        // Remove maxDownloads and downloadCount to make it unlimited
        removeParts.push("#maxDownloads");
        removeParts.push("#downloadCount");
        expNames["#maxDownloads"] = "maxDownloads";
        expNames["#downloadCount"] = "downloadCount";
      } else {
        const newMax = parseInt(maxDownloads, 10);
        if (!isNaN(newMax) && newMax > 0) {
          // Set new maxDownloads and reset downloadCount to 0
          setParts.push("#maxDownloads = :maxDownloads");
          setParts.push("#downloadCount = :zero");
          expNames["#maxDownloads"] = "maxDownloads";
          expNames["#downloadCount"] = "downloadCount";
          expValues[":maxDownloads"] = newMax;
          expValues[":zero"] = 0;
        }
      }
    }

    if (setParts.length === 0 && removeParts.length === 0) {
      return res.status(400).json({ error: "No valid updates provided" });
    }

    // Build update expression with SET and/or REMOVE clauses
    let updateExpression = "";
    if (setParts.length > 0) {
      updateExpression = "SET " + setParts.join(", ");
    }
    if (removeParts.length > 0) {
      updateExpression += (updateExpression ? " " : "") + "REMOVE " + removeParts.join(", ");
    }

    console.log("Update expression:", updateExpression);
    console.log("Expression names:", expNames);
    console.log("Expression values:", expValues);

    const updateParams = {
      TableName: FILES_TABLE,
      Key: { id: fileId },
      UpdateExpression: updateExpression,
      ExpressionAttributeNames: expNames,
      ReturnValues: "ALL_NEW"
    };
    
    // Only include ExpressionAttributeValues if there are values to set
    if (Object.keys(expValues).length > 0) {
      updateParams.ExpressionAttributeValues = expValues;
    }

    const result = await docClient.send(new UpdateCommand(updateParams));

    const updated = result.Attributes;
    res.json({
      success: true,
      expiresAt: updated.expiresAt,
      maxDownloads: updated.maxDownloads || null,
      downloadsRemaining: updated.maxDownloads 
        ? Math.max(0, updated.maxDownloads - (updated.downloadCount || 0))
        : null
    });
  } catch (error) {
    console.error("Edit file error:", error);
    console.error("Error stack:", error.stack);
    res.status(500).json({ error: "Internal server error", details: error.message });
  }
});

router.delete("/:fileId", async (req, res) => {
  try {
    const { fileId } = req.params;

    const file = await docClient.send(new GetCommand({
      TableName: FILES_TABLE,
      Key: { id: fileId }
    }));

    if (!file.Item || file.Item.userId !== req.user.userId) {
      return res.status(404).json({ error: "File not found" });
    }

    // Send deletion request to SQS queue
    await sqsClient.send(new SendMessageCommand({
      QueueUrl: FILE_DELETION_QUEUE_URL,
      MessageBody: JSON.stringify({
        fileId,
        userId: req.user.userId
      })
    }));

    res.json({ success: true, message: "File deletion queued" });
  } catch (error) {
    console.error("Delete file error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
