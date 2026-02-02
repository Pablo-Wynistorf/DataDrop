import { S3Client, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { CloudFrontClient, CreateInvalidationCommand } from "@aws-sdk/client-cloudfront";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";

const s3Client = new S3Client({});
const cfClient = new CloudFrontClient({});
const ddbClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(ddbClient);

const BUCKET_NAME = process.env.BUCKET_NAME;
const CDN_BUCKET_NAME = process.env.CDN_BUCKET_NAME;
const FILES_TABLE = process.env.FILES_TABLE;
const CLOUDFRONT_DISTRIBUTION_ID = process.env.CLOUDFRONT_DISTRIBUTION_ID;

export const handler = async (event) => {
  console.log("Received event:", JSON.stringify(event, null, 2));
  
  const results = [];

  for (const record of event.Records) {
    try {
      console.log("Processing record:", JSON.stringify(record, null, 2));
      
      // Check if this is a DynamoDB Stream event (TTL expiration)
      if (record.eventSource === "aws:dynamodb") {
        await handleDynamoDBStreamRecord(record, results);
      } else {
        // SQS message (manual deletion or download limit reached)
        await handleSQSRecord(record, results);
      }
    } catch (error) {
      console.error(`Error processing record:`, error);
      throw error;
    }
  }

  return { processed: results.length, results };
};

async function handleDynamoDBStreamRecord(record, results) {
  // Only process REMOVE events (TTL deletions)
  if (record.eventName !== "REMOVE") {
    return;
  }

  const oldImage = record.dynamodb.OldImage;
  if (!oldImage) {
    console.log("No old image in stream record, skipping");
    return;
  }

  // Parse DynamoDB format to regular object
  const fileData = unmarshallDynamoDBImage(oldImage);
  const fileId = fileData.id;

  console.log(`Processing TTL deletion for file: ${fileId}`);

  const bucket = fileData.uploadType === "cdn" ? CDN_BUCKET_NAME : BUCKET_NAME;

  // Delete from S3 (DynamoDB item already deleted by TTL)
  await s3Client.send(new DeleteObjectCommand({
    Bucket: bucket,
    Key: fileData.s3Key
  }));

  // Create CloudFront invalidation for CDN files
  if (fileData.uploadType === "cdn") {
    await invalidateCdnFile(fileData.s3Key);
  }

  console.log(`Successfully deleted S3 object for TTL-expired file: ${fileId}`);
  results.push({ fileId, status: "deleted_ttl" });
}

async function handleSQSRecord(record, results) {
  const message = JSON.parse(record.body);
  const { fileId, userId } = message;

  console.log(`Processing manual deletion for file: ${fileId}, user: ${userId}`);

  const file = await docClient.send(new GetCommand({
    TableName: FILES_TABLE,
    Key: { id: fileId }
  }));

  if (!file.Item) {
    console.log(`File ${fileId} not found, skipping`);
    results.push({ fileId, status: "not_found" });
    return;
  }

  if (file.Item.userId !== userId) {
    console.error(`User ${userId} not authorized to delete file ${fileId}`);
    results.push({ fileId, status: "unauthorized" });
    return;
  }

  const fileData = file.Item;
  const bucket = fileData.uploadType === "cdn" ? CDN_BUCKET_NAME : BUCKET_NAME;

  // Delete from S3
  await s3Client.send(new DeleteObjectCommand({
    Bucket: bucket,
    Key: fileData.s3Key
  }));

  // Create CloudFront invalidation for CDN files
  if (fileData.uploadType === "cdn") {
    await invalidateCdnFile(fileData.s3Key);
  }

  // Delete from DynamoDB
  await docClient.send(new DeleteCommand({
    TableName: FILES_TABLE,
    Key: { id: fileId }
  }));

  console.log(`Successfully deleted file: ${fileId}`);
  results.push({ fileId, status: "deleted" });
}

async function invalidateCdnFile(s3Key) {
  // CDN files are served at /cdn/{s3Key}
  // CloudFront caches based on the URL-encoded path
  const invalidationPath = `/cdn/${s3Key}`;
  
  console.log(`Creating CloudFront invalidation for: ${invalidationPath}`);
  console.log(`S3 Key: ${s3Key}`);

  try {
    // Create invalidation with wildcard to ensure all variations are cleared
    // This handles cases where the filename might be URL-encoded differently
    const pathParts = s3Key.split('/');
    const fileId = pathParts[0];
    const wildcardPath = `/cdn/${fileId}/*`;
    
    const paths = [
      invalidationPath,  // Exact path
      wildcardPath       // Wildcard for the entire file ID directory
    ];
    
    await cfClient.send(new CreateInvalidationCommand({
      DistributionId: CLOUDFRONT_DISTRIBUTION_ID,
      InvalidationBatch: {
        CallerReference: `${Date.now()}-${s3Key}`,
        Paths: {
          Quantity: paths.length,
          Items: paths
        }
      }
    }));
    console.log(`CloudFront invalidation created for paths:`, paths);
  } catch (error) {
    console.error(`Failed to create CloudFront invalidation:`, error);
    console.error(`Error details:`, JSON.stringify(error, null, 2));
    // Don't throw - file is already deleted, invalidation failure shouldn't block
  }
}

// Helper to convert DynamoDB stream format to regular object
function unmarshallDynamoDBImage(image) {
  const result = {};
  for (const [key, value] of Object.entries(image)) {
    if (value.S !== undefined) result[key] = value.S;
    else if (value.N !== undefined) result[key] = Number(value.N);
    else if (value.BOOL !== undefined) result[key] = value.BOOL;
    else if (value.NULL !== undefined) result[key] = null;
    else if (value.L !== undefined) result[key] = value.L.map(v => unmarshallDynamoDBImage({ v }).v);
    else if (value.M !== undefined) result[key] = unmarshallDynamoDBImage(value.M);
  }
  return result;
}
