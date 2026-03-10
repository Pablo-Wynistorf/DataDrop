import { Router } from "express";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";

const router = Router();
const ddbClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(ddbClient);

const FILES_TABLE = process.env.FILES_TABLE;

// Helper: normalize a folder path to always start with "/" and never end with "/" (except root)
function normalizePath(p) {
  if (!p || p === "/") return "/";
  let normalized = p.startsWith("/") ? p : "/" + p;
  if (normalized.length > 1 && normalized.endsWith("/")) {
    normalized = normalized.slice(0, -1);
  }
  return normalized;
}

// Helper: validate folder path segment names
function isValidPath(p) {
  if (p === "/") return true;
  const segments = p.split("/").filter(Boolean);
  return segments.length > 0 && segments.every(s => s.trim().length > 0 && !s.includes("\\"));
}

// List all distinct folders for the current user (derived from file folderPath values)
router.get("/", async (req, res) => {
  try {
    const result = await docClient.send(new QueryCommand({
      TableName: FILES_TABLE,
      IndexName: "userId-index",
      KeyConditionExpression: "userId = :userId",
      ExpressionAttributeValues: { ":userId": req.user.userId },
      ProjectionExpression: "folderPath"
    }));

    // Collect all unique folder paths including intermediate paths
    const pathSet = new Set();
    pathSet.add("/");

    for (const item of result.Items || []) {
      const fp = item.folderPath || "/";
      if (fp === "/") continue;
      // Add the path and all parent paths
      const segments = fp.split("/").filter(Boolean);
      let current = "";
      for (const seg of segments) {
        current += "/" + seg;
        pathSet.add(current);
      }
    }

    const folders = Array.from(pathSet).sort();
    res.json({ folders });
  } catch (error) {
    console.error("List folders error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Move a single file to a folder path
router.post("/move-file", async (req, res) => {
  try {
    const { fileId, folderPath } = req.body;

    if (!fileId) {
      return res.status(400).json({ error: "fileId is required" });
    }

    const targetPath = normalizePath(folderPath || "/");
    if (!isValidPath(targetPath)) {
      return res.status(400).json({ error: "Invalid folder path" });
    }

    const file = await docClient.send(new GetCommand({
      TableName: FILES_TABLE,
      Key: { id: fileId }
    }));

    if (!file.Item || file.Item.userId !== req.user.userId) {
      return res.status(404).json({ error: "File not found" });
    }

    if (targetPath === "/") {
      // Move to root — remove the attribute
      await docClient.send(new UpdateCommand({
        TableName: FILES_TABLE,
        Key: { id: fileId },
        UpdateExpression: "REMOVE #folderPath",
        ConditionExpression: "userId = :userId",
        ExpressionAttributeNames: { "#folderPath": "folderPath" },
        ExpressionAttributeValues: { ":userId": req.user.userId }
      }));
    } else {
      await docClient.send(new UpdateCommand({
        TableName: FILES_TABLE,
        Key: { id: fileId },
        UpdateExpression: "SET #folderPath = :folderPath",
        ConditionExpression: "userId = :userId",
        ExpressionAttributeNames: { "#folderPath": "folderPath" },
        ExpressionAttributeValues: { ":folderPath": targetPath, ":userId": req.user.userId }
      }));
    }

    res.json({ success: true, folderPath: targetPath });
  } catch (error) {
    if (error.name === "ConditionalCheckFailedException") {
      return res.status(403).json({ error: "Access denied" });
    }
    console.error("Move file error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Bulk move files to a folder path
router.post("/move-files", async (req, res) => {
  try {
    const { fileIds, folderPath } = req.body;

    if (!fileIds || !Array.isArray(fileIds) || fileIds.length === 0) {
      return res.status(400).json({ error: "fileIds array is required" });
    }

    const targetPath = normalizePath(folderPath || "/");
    if (!isValidPath(targetPath)) {
      return res.status(400).json({ error: "Invalid folder path" });
    }

    const results = [];
    for (const fileId of fileIds) {
      try {
        const file = await docClient.send(new GetCommand({
          TableName: FILES_TABLE,
          Key: { id: fileId }
        }));

        if (!file.Item || file.Item.userId !== req.user.userId) {
          results.push({ fileId, status: "not_found" });
          continue;
        }

        if (targetPath === "/") {
          await docClient.send(new UpdateCommand({
            TableName: FILES_TABLE,
            Key: { id: fileId },
            UpdateExpression: "REMOVE #folderPath",
            ConditionExpression: "userId = :userId",
            ExpressionAttributeNames: { "#folderPath": "folderPath" },
            ExpressionAttributeValues: { ":userId": req.user.userId }
          }));
        } else {
          await docClient.send(new UpdateCommand({
            TableName: FILES_TABLE,
            Key: { id: fileId },
            UpdateExpression: "SET #folderPath = :folderPath",
            ConditionExpression: "userId = :userId",
            ExpressionAttributeNames: { "#folderPath": "folderPath" },
            ExpressionAttributeValues: { ":folderPath": targetPath, ":userId": req.user.userId }
          }));
        }

        results.push({ fileId, status: "moved" });
      } catch (err) {
        if (err.name === "ConditionalCheckFailedException") {
          results.push({ fileId, status: "access_denied" });
        } else {
          results.push({ fileId, status: "error" });
        }
      }
    }

    res.json({ success: true, results });
  } catch (error) {
    console.error("Bulk move files error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Rename a folder — updates folderPath on all files under that path
router.post("/rename", async (req, res) => {
  try {
    const { oldPath, newName } = req.body;

    if (!oldPath || !newName || typeof newName !== "string" || newName.trim().length === 0) {
      return res.status(400).json({ error: "oldPath and newName are required" });
    }

    const normalizedOld = normalizePath(oldPath);
    if (normalizedOld === "/") {
      return res.status(400).json({ error: "Cannot rename root" });
    }

    // Build new path: replace last segment
    const segments = normalizedOld.split("/").filter(Boolean);
    segments[segments.length - 1] = newName.trim();
    const newPath = "/" + segments.join("/");

    if (!isValidPath(newPath)) {
      return res.status(400).json({ error: "Invalid new folder name" });
    }

    // Find all files belonging to user
    const result = await docClient.send(new QueryCommand({
      TableName: FILES_TABLE,
      IndexName: "userId-index",
      KeyConditionExpression: "userId = :userId",
      ExpressionAttributeValues: { ":userId": req.user.userId },
      ProjectionExpression: "id, folderPath"
    }));

    let updated = 0;
    for (const item of result.Items || []) {
      const fp = item.folderPath || "/";
      // Match exact path or children (e.g. /a matches /a and /a/b but not /ab)
      if (fp === normalizedOld || fp.startsWith(normalizedOld + "/")) {
        const updatedPath = newPath + fp.slice(normalizedOld.length);
        await docClient.send(new UpdateCommand({
          TableName: FILES_TABLE,
          Key: { id: item.id },
          UpdateExpression: "SET #folderPath = :folderPath",
          ConditionExpression: "userId = :userId",
          ExpressionAttributeNames: { "#folderPath": "folderPath" },
          ExpressionAttributeValues: { ":folderPath": updatedPath, ":userId": req.user.userId }
        }));
        updated++;
      }
    }

    res.json({ success: true, oldPath: normalizedOld, newPath, filesUpdated: updated });
  } catch (error) {
    if (error.name === "ConditionalCheckFailedException") {
      return res.status(403).json({ error: "Access denied" });
    }
    console.error("Rename folder error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Delete a folder — moves all files in it to parent folder
router.post("/delete", async (req, res) => {
  try {
    const { folderPath } = req.body;

    if (!folderPath) {
      return res.status(400).json({ error: "folderPath is required" });
    }

    const normalizedPath = normalizePath(folderPath);
    if (normalizedPath === "/") {
      return res.status(400).json({ error: "Cannot delete root" });
    }

    // Parent path
    const segments = normalizedPath.split("/").filter(Boolean);
    segments.pop();
    const parentPath = segments.length === 0 ? "/" : "/" + segments.join("/");

    // Find all files belonging to user
    const result = await docClient.send(new QueryCommand({
      TableName: FILES_TABLE,
      IndexName: "userId-index",
      KeyConditionExpression: "userId = :userId",
      ExpressionAttributeValues: { ":userId": req.user.userId },
      ProjectionExpression: "id, folderPath"
    }));

    let updated = 0;
    for (const item of result.Items || []) {
      const fp = item.folderPath || "/";

      if (fp === normalizedPath) {
        // Files directly in this folder → move to parent
        if (parentPath === "/") {
          await docClient.send(new UpdateCommand({
            TableName: FILES_TABLE,
            Key: { id: item.id },
            UpdateExpression: "REMOVE #folderPath",
            ConditionExpression: "userId = :userId",
            ExpressionAttributeNames: { "#folderPath": "folderPath" },
            ExpressionAttributeValues: { ":userId": req.user.userId }
          }));
        } else {
          await docClient.send(new UpdateCommand({
            TableName: FILES_TABLE,
            Key: { id: item.id },
            UpdateExpression: "SET #folderPath = :folderPath",
            ConditionExpression: "userId = :userId",
            ExpressionAttributeNames: { "#folderPath": "folderPath" },
            ExpressionAttributeValues: { ":folderPath": parentPath, ":userId": req.user.userId }
          }));
        }
        updated++;
      } else if (fp.startsWith(normalizedPath + "/")) {
        // Files in subfolders → reparent under parent
        const remainder = fp.slice(normalizedPath.length); // e.g. "/sub/deep"
        const newPath = parentPath === "/" ? remainder : parentPath + remainder;
        await docClient.send(new UpdateCommand({
          TableName: FILES_TABLE,
          Key: { id: item.id },
          UpdateExpression: "SET #folderPath = :folderPath",
          ConditionExpression: "userId = :userId",
          ExpressionAttributeNames: { "#folderPath": "folderPath" },
          ExpressionAttributeValues: { ":folderPath": newPath, ":userId": req.user.userId }
        }));
        updated++;
      }
    }

    res.json({ success: true, filesUpdated: updated });
  } catch (error) {
    if (error.name === "ConditionalCheckFailedException") {
      return res.status(403).json({ error: "Access denied" });
    }
    console.error("Delete folder error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Move a folder (and all its contents) to a new parent path
router.post("/move", async (req, res) => {
  try {
    const { folderPath, targetParentPath } = req.body;

    if (!folderPath) {
      return res.status(400).json({ error: "folderPath is required" });
    }

    const normalizedSource = normalizePath(folderPath);
    const normalizedTarget = normalizePath(targetParentPath || "/");

    if (normalizedSource === "/") {
      return res.status(400).json({ error: "Cannot move root" });
    }

    if (!isValidPath(normalizedTarget)) {
      return res.status(400).json({ error: "Invalid target path" });
    }

    // Prevent moving into itself or its own children
    if (normalizedTarget === normalizedSource || normalizedTarget.startsWith(normalizedSource + "/")) {
      return res.status(400).json({ error: "Cannot move a folder into itself or its descendant" });
    }

    // Get the folder name (last segment)
    const folderName = normalizedSource.split("/").filter(Boolean).pop();
    const newBasePath = normalizedTarget === "/" ? "/" + folderName : normalizedTarget + "/" + folderName;

    const result = await docClient.send(new QueryCommand({
      TableName: FILES_TABLE,
      IndexName: "userId-index",
      KeyConditionExpression: "userId = :userId",
      ExpressionAttributeValues: { ":userId": req.user.userId },
      ProjectionExpression: "id, folderPath"
    }));

    let updated = 0;
    for (const item of result.Items || []) {
      const fp = item.folderPath || "/";

      if (fp === normalizedSource || fp.startsWith(normalizedSource + "/")) {
        const newPath = newBasePath + fp.slice(normalizedSource.length);
        await docClient.send(new UpdateCommand({
          TableName: FILES_TABLE,
          Key: { id: item.id },
          UpdateExpression: "SET #folderPath = :folderPath",
          ConditionExpression: "userId = :userId",
          ExpressionAttributeNames: { "#folderPath": "folderPath" },
          ExpressionAttributeValues: { ":folderPath": newPath, ":userId": req.user.userId }
        }));
        updated++;
      }
    }

    res.json({ success: true, newPath: newBasePath, filesUpdated: updated });
  } catch (error) {
    if (error.name === "ConditionalCheckFailedException") {
      return res.status(403).json({ error: "Access denied" });
    }
    console.error("Move folder error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
