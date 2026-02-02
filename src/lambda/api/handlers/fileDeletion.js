import { S3Client, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";

const s3Client = new S3Client({});
const ddbClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(ddbClient);

const BUCKET_NAME = process.env.BUCKET_NAME;
const CDN_BUCKET_NAME = process.env.CDN_BUCKET_NAME;
const FILES_TABLE = process.env.FILES_TABLE;

export const handler = async (event) => {
  const results = [];

  for (const record of event.Records) {
    try {
      const message = JSON.parse(record.body);
      const { fileId, userId } = message;

      console.log(`Processing deletion for file: ${fileId}, user: ${userId}`);

      // Get file metadata
      const file = await docClient.send(new GetCommand({
        TableName: FILES_TABLE,
        Key: { id: fileId }
      }));

      if (!file.Item) {
        console.log(`File ${fileId} not found, skipping`);
        results.push({ fileId, status: "not_found" });
        continue;
      }

      // Verify ownership
      if (file.Item.userId !== userId) {
        console.error(`User ${userId} not authorized to delete file ${fileId}`);
        results.push({ fileId, status: "unauthorized" });
        continue;
      }

      const fileData = file.Item;
      const bucket = fileData.uploadType === "cdn" ? CDN_BUCKET_NAME : BUCKET_NAME;

      // Delete from S3
      await s3Client.send(new DeleteObjectCommand({
        Bucket: bucket,
        Key: fileData.s3Key
      }));

      // Delete from DynamoDB
      await docClient.send(new DeleteCommand({
        TableName: FILES_TABLE,
        Key: { id: fileId }
      }));

      console.log(`Successfully deleted file: ${fileId}`);
      results.push({ fileId, status: "deleted" });
    } catch (error) {
      console.error(`Error processing record:`, error);
      throw error; // Re-throw to trigger retry/DLQ
    }
  }

  return { processed: results.length, results };
};
