import { API_URL } from "./api.js";

// Tracks upload speed and ETA using a rolling average of recent samples.
export class UploadTracker {
  constructor(totalSize) {
    this.totalSize = totalSize;
    this.startTime = Date.now();
    this.lastTime = Date.now();
    this.lastLoaded = 0;
    this.speedSamples = [];
  }

  update(loaded) {
    const now = Date.now();
    const elapsed = now - this.lastTime;
    if (elapsed > 200) {
      const bytesDiff = loaded - this.lastLoaded;
      const speed = bytesDiff / (elapsed / 1000);
      this.speedSamples.push(speed);
      if (this.speedSamples.length > 10) this.speedSamples.shift();
      this.lastTime = now;
      this.lastLoaded = loaded;
    }
    return this.getStats(loaded);
  }

  getStats(loaded) {
    const avgSpeed =
      this.speedSamples.length > 0
        ? this.speedSamples.reduce((a, b) => a + b, 0) / this.speedSamples.length
        : 0;
    const remaining = this.totalSize - loaded;
    const eta = avgSpeed > 0 ? remaining / avgSpeed : 0;
    return { speed: avgSpeed, eta };
  }
}

// PUT a blob to a presigned URL, reporting progress. Resolves with the ETag
// response header (used for multipart completion).
export function putToS3(url, blob, contentType, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable && onProgress) onProgress(e.loaded, e.total);
    });
    xhr.addEventListener("load", () => {
      if (xhr.status === 200) {
        resolve(xhr.getResponseHeader("ETag"));
      } else {
        reject(new Error(`Upload failed: ${xhr.status}`));
      }
    });
    xhr.addEventListener("error", () => reject(new Error("Network error during upload")));
    xhr.open("PUT", url);
    if (contentType) xhr.setRequestHeader("Content-Type", contentType);
    xhr.send(blob);
  });
}

// readEntries only returns a batch (max ~100) per call, so keep reading until
// it reports an empty batch to capture every child of a directory.
function readAllEntries(reader) {
  return new Promise((resolve, reject) => {
    const all = [];
    const readBatch = () =>
      reader.readEntries((batch) => {
        if (!batch.length) resolve(all);
        else {
          all.push(...batch);
          readBatch();
        }
      }, reject);
    readBatch();
  });
}

// Turn a dropped DataTransferItemList into a flat list of File objects,
// recursing into any dropped folders. Files pulled out of a folder get a
// `relativePathOverride` (e.g. "photos/2024/a.jpg") so their folder structure
// can be preserved; computeFolderPath falls back to it. Dropping folders this
// way (rather than reading dataTransfer.files) avoids sending directory entries
// to S3, which browsers reject with net::ERR_ACCESS_DENIED.
export async function filesFromDataTransfer(items) {
  // webkitGetAsEntry() must be called synchronously for every item before we
  // await anything: the DataTransferItemList is emptied once the drop handler
  // yields, so grabbing the entries first is what makes multi-item drops work.
  const rootEntries = [];
  for (let i = 0; i < items.length; i++) {
    const entry = items[i].webkitGetAsEntry?.();
    if (entry) rootEntries.push(entry);
  }

  const files = [];
  // `dir` is the folder path relative to the drop root (empty at the top level).
  async function traverse(entry, dir) {
    if (entry.isFile) {
      const f = await new Promise((resolve, reject) => entry.file(resolve, reject));
      if (dir) f.relativePathOverride = `${dir}/${entry.name}`;
      files.push(f);
    } else if (entry.isDirectory) {
      const reader = entry.createReader();
      const childDir = dir ? `${dir}/${entry.name}` : entry.name;
      const entries = await readAllEntries(reader);
      for (const e of entries) await traverse(e, childDir);
    }
  }

  for (const entry of rootEntries) await traverse(entry, "");
  return files;
}

// The path of a file relative to the drop/selection root, including subfolders
// (e.g. "photos/2024/a.jpg"). Empty when the file has no folder context.
export function relativePathOf(file) {
  return file.webkitRelativePath || file.relativePathOverride || "";
}

// Derive the destination folder for a file. When a folder is picked, the
// browser sets file.webkitRelativePath (e.g. "photos/2024/a.jpg"); its
// directory part is appended to the current base folder so the structure is
// preserved on the server.
export function computeFolderPath(baseFolder, file) {
  const base = baseFolder && baseFolder !== "/" ? baseFolder : "";
  // webkitRelativePath is set by the folder picker; relativePathOverride is set
  // by our drag-and-drop traversal. Both look like "folder/sub/file.ext".
  const rel = file.webkitRelativePath || file.relativePathOverride || "";
  let sub = "";
  if (rel.includes("/")) sub = rel.slice(0, rel.lastIndexOf("/"));
  const combined = base + (sub ? "/" + sub : "");
  return combined === "" ? "/" : combined;
}

// Upload a single authenticated file, handling both single-PUT and multipart.
// onProgress receives { pct, speed, eta, detail } while uploading.
export async function uploadAuthedFile(file, opts, onProgress) {
  const { uploadType, expiresInSeconds, expiresAt, maxDownloads } = opts;
  const folderPath = computeFolderPath(opts.baseFolder, file);

  const body = {
    fileName: file.name,
    fileType: file.type || "application/octet-stream",
    fileSize: file.size,
    uploadType,
  };
  if (folderPath && folderPath !== "/") body.folderPath = folderPath;
  if (uploadType === "private") {
    if (expiresAt) body.expiresAt = expiresAt;
    else if (expiresInSeconds) body.expiresInSeconds = expiresInSeconds;
    if (maxDownloads) body.maxDownloads = maxDownloads;
  }

  const res = await fetch(`${API_URL}/upload`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let msg = "Failed to get upload URL";
    try {
      const err = await res.json();
      msg = err.error || msg;
    } catch {}
    throw new Error(msg);
  }

  const { uploadUrl, fileId, multipart } = await res.json();
  const tracker = new UploadTracker(file.size);

  if (multipart) {
    await doMultipartUpload(file, fileId, multipart, tracker, onProgress);
  } else {
    await putToS3(uploadUrl, file, file.type || "application/octet-stream", (loaded, total) => {
      const pct = Math.round((loaded / total) * 100);
      const { speed, eta } = tracker.update(loaded);
      onProgress?.({ pct, speed, eta });
    });
    await fetch(`${API_URL}/files/${fileId}/confirm`, {
      method: "POST",
      credentials: "include",
    });
  }
}

async function doMultipartUpload(file, fileId, multipart, tracker, onProgress) {
  const { partCount, partSize } = multipart;
  const parts = [];
  let totalUploaded = 0;

  for (let partNum = 1; partNum <= partCount; partNum++) {
    const start = (partNum - 1) * partSize;
    const end = Math.min(start + partSize, file.size);
    const partBlob = file.slice(start, end);
    const currentPartSize = end - start;

    const partRes = await fetch(`${API_URL}/upload/${fileId}/part`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ partNumber: partNum }),
    });
    if (!partRes.ok) throw new Error(`Failed to get URL for part ${partNum}`);
    const { uploadUrl } = await partRes.json();

    const etag = await putToS3(uploadUrl, partBlob, null, (loaded) => {
      const progress = totalUploaded + loaded;
      const pct = Math.round((progress / file.size) * 100);
      const { speed, eta } = tracker.update(progress);
      onProgress?.({ pct, speed, eta, detail: `part ${partNum}/${partCount}` });
    });

    totalUploaded += currentPartSize;
    parts.push({ partNumber: partNum, etag });
  }

  onProgress?.({ pct: 100, speed: 0, eta: 0, detail: "Completing..." });
  const completeRes = await fetch(`${API_URL}/upload/${fileId}/complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ parts }),
  });
  if (!completeRes.ok) throw new Error("Failed to complete multipart upload");
}
