import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
  ScanCommand,
} from "@aws-sdk/lib-dynamodb";

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

const USERS_TABLE = process.env.USERS_TABLE;
const DEFAULT_MAX_FILE_SIZE_GB = 1;
export const DEFAULT_MAX_FILE_SIZE_BYTES = DEFAULT_MAX_FILE_SIZE_GB * 1024 * 1024 * 1024;

// Default permissions applied to any user that does not yet have an
// explicit permission record (or is missing individual fields).
export function defaultPermissions() {
  return {
    canUploadCdn: false,
    canUploadFile: false,
    maxFileSizeBytes: DEFAULT_MAX_FILE_SIZE_BYTES,
  };
}

// Resolve the effective permissions for a stored user record, filling in
// defaults for any field that has not been set by an admin.
export function getEffectivePermissions(record) {
  const defaults = defaultPermissions();
  if (!record) return defaults;
  return {
    canUploadCdn: typeof record.canUploadCdn === "boolean" ? record.canUploadCdn : defaults.canUploadCdn,
    canUploadFile: typeof record.canUploadFile === "boolean" ? record.canUploadFile : defaults.canUploadFile,
    maxFileSizeBytes:
      typeof record.maxFileSizeBytes === "number" && record.maxFileSizeBytes > 0
        ? record.maxFileSizeBytes
        : defaults.maxFileSizeBytes,
  };
}

export async function getUser(userId) {
  if (!userId) return null;
  const result = await docClient.send(
    new GetCommand({ TableName: USERS_TABLE, Key: { userId } })
  );
  return result.Item || null;
}

// Fetch a user record, creating a default one the first time we see the user.
// `profile` (name/email) is used only to seed a freshly created record so we
// never overwrite an existing profile with sparser token claims.
export async function getOrCreateUser(userId, profile = {}) {
  const existing = await getUser(userId);
  if (existing) return existing;

  const now = new Date().toISOString();
  const record = {
    userId,
    name: profile.name || profile.email || null,
    email: profile.email || null,
    ...defaultPermissions(),
    createdAt: now,
    updatedAt: now,
  };

  try {
    await docClient.send(
      new PutCommand({
        TableName: USERS_TABLE,
        Item: record,
        ConditionExpression: "attribute_not_exists(userId)",
      })
    );
    return record;
  } catch (error) {
    // Someone created it concurrently - just read the winning record.
    if (error.name === "ConditionalCheckFailedException") {
      return (await getUser(userId)) || record;
    }
    throw error;
  }
}

// Upsert the identity fields (name/email) captured at login time. This is the
// source of truth for the display name, so it survives token refreshes that no
// longer carry the `profile`/`name` claim.
export async function upsertUserProfile(userId, { name, email } = {}) {
  if (!userId) return;
  const now = new Date().toISOString();

  const sets = ["updatedAt = :now", "lastLoginAt = :now"];
  const values = { ":now": now };

  if (name) {
    sets.push("#name = :name");
    values[":name"] = name;
  }
  if (email) {
    sets.push("email = :email");
    values[":email"] = email;
  }

  await docClient.send(
    new UpdateCommand({
      TableName: USERS_TABLE,
      Key: { userId },
      UpdateExpression: `SET ${sets.join(", ")}`,
      ExpressionAttributeNames: name ? { "#name": "name" } : undefined,
      ExpressionAttributeValues: values,
    })
  );
}

// List every known user, merged with their effective permissions. Used by the
// admin UI. The users table is expected to stay small, so a scan is fine.
export async function listUsers() {
  const users = [];
  let ExclusiveStartKey;
  do {
    const result = await docClient.send(
      new ScanCommand({ TableName: USERS_TABLE, ExclusiveStartKey })
    );
    for (const item of result.Items || []) {
      users.push({
        userId: item.userId,
        name: item.name || null,
        email: item.email || null,
        createdAt: item.createdAt || null,
        lastLoginAt: item.lastLoginAt || null,
        ...getEffectivePermissions(item),
      });
    }
    ExclusiveStartKey = result.LastEvaluatedKey;
  } while (ExclusiveStartKey);

  users.sort((a, b) => (a.name || a.userId).localeCompare(b.name || b.userId));
  return users;
}

// Update the permission fields for a user. Creates the record if it does not
// exist yet (a user an admin wants to grant access to before their first login
// would not otherwise be present).
export async function updateUserPermissions(userId, { canUploadCdn, canUploadFile, maxFileSizeBytes }) {
  const now = new Date().toISOString();
  await docClient.send(
    new UpdateCommand({
      TableName: USERS_TABLE,
      Key: { userId },
      UpdateExpression:
        "SET canUploadCdn = :cdn, canUploadFile = :file, maxFileSizeBytes = :size, updatedAt = :now",
      ExpressionAttributeValues: {
        ":cdn": !!canUploadCdn,
        ":file": !!canUploadFile,
        ":size": maxFileSizeBytes,
        ":now": now,
      },
    })
  );
  return getUser(userId);
}
