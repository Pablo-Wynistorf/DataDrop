const API_URL = window.API_URL || "/api";
let uploadToken = null;
let projectInfo = null;
let selectedFiles = [];
let uploadedFiles = [];

document.addEventListener("DOMContentLoaded", () => {
  const params = new URLSearchParams(window.location.search);
  uploadToken = params.get("token");

  if (!uploadToken) {
    showError("Invalid upload link");
    return;
  }

  loadProjectInfo();
  setupDropZone();
});

function setupDropZone() {
  const dropZone = document.getElementById("drop-zone");

  dropZone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropZone.classList.add("drop-zone-active");
  });

  dropZone.addEventListener("dragleave", () => {
    dropZone.classList.remove("drop-zone-active");
  });

  dropZone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropZone.classList.remove("drop-zone-active");
    if (e.dataTransfer.files.length) {
      addFiles(Array.from(e.dataTransfer.files));
    }
  });
}

async function loadProjectInfo() {
  try {
    const res = await fetch(`${API_URL}/public-upload/${uploadToken}/info`);
    const data = await res.json();

    if (!res.ok) {
      showError(data.error || "Invalid upload link");
      return;
    }

    projectInfo = data;
    document.getElementById("project-name").textContent = data.name;
    document.getElementById("project-description").textContent = data.description || "";
    document.getElementById("max-size").textContent = formatFileSize(data.maxFileSizeBytes);
    document.getElementById("expires-at").textContent = new Date(data.expiresAt).toLocaleString();
    document.getElementById("file-count").textContent = data.fileCount;

    document.getElementById("loading").classList.add("hidden");
    document.getElementById("upload-view").classList.remove("hidden");
  } catch (error) {
    console.error("Failed to load project info:", error);
    showError("Failed to load upload page");
  }
}

function handleFiles(event) {
  if (event.target.files.length) {
    addFiles(Array.from(event.target.files));
  }
}

function addFiles(files) {
  for (const file of files) {
    if (file.size > projectInfo.maxFileSizeBytes) {
      showToast(`${file.name} exceeds the ${formatFileSize(projectInfo.maxFileSizeBytes)} limit`, "error");
      continue;
    }
    // Avoid duplicates
    if (!selectedFiles.find(f => f.name === file.name && f.size === file.size)) {
      selectedFiles.push(file);
    }
  }

  renderSelectedFiles();
}

function renderSelectedFiles() {
  const container = document.getElementById("selected-files");
  const list = document.getElementById("file-list");

  if (selectedFiles.length === 0) {
    container.classList.add("hidden");
    return;
  }

  container.classList.remove("hidden");
  const totalSize = selectedFiles.reduce((sum, f) => sum + f.size, 0);
  document.getElementById("total-size").textContent = formatFileSize(totalSize);

  list.innerHTML = selectedFiles.map((file, i) => `
    <div class="flex items-center justify-between glass-light rounded-lg px-3 py-2">
      <div class="flex-1 min-w-0 mr-2">
        <p class="text-sm text-white truncate">${escapeHtml(file.name)}</p>
        <p class="text-xs text-gray-500">${formatFileSize(file.size)}</p>
      </div>
      <button onclick="removeFile(${i})" class="text-gray-500 hover:text-red-400 transition text-sm">✕</button>
    </div>
  `).join("");
}

function removeFile(index) {
  selectedFiles.splice(index, 1);
  renderSelectedFiles();
}

function clearFiles() {
  selectedFiles = [];
  document.getElementById("file-input").value = "";
  renderSelectedFiles();
}

async function uploadAll() {
  if (selectedFiles.length === 0) return;

  const filesToUpload = [...selectedFiles];
  selectedFiles = [];
  renderSelectedFiles();

  const progress = document.getElementById("upload-progress");
  const filenameEl = document.getElementById("progress-filename");
  const percentEl = document.getElementById("progress-percent");
  const barEl = document.getElementById("progress-bar");
  const speedEl = document.getElementById("progress-speed");
  const etaEl = document.getElementById("progress-eta");

  progress.classList.remove("hidden");

  let successCount = 0;

  for (let i = 0; i < filesToUpload.length; i++) {
    const file = filesToUpload[i];
    filenameEl.textContent = `${i + 1}/${filesToUpload.length}: ${file.name}`;
    percentEl.textContent = "0%";
    barEl.style.width = "0%";
    speedEl.textContent = "";
    etaEl.textContent = "";

    try {
      // Get presigned URL
      const res = await fetch(`${API_URL}/public-upload/${uploadToken}/upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: file.name,
          fileType: file.type || "application/octet-stream",
          fileSize: file.size
        })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to get upload URL");
      }

      const { uploadUrl, fileId } = await res.json();

      // Upload to S3
      const tracker = new SpeedTracker(file.size);
      await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.upload.addEventListener("progress", (e) => {
          if (e.lengthComputable) {
            const pct = Math.round((e.loaded / e.total) * 100);
            percentEl.textContent = `${pct}%`;
            barEl.style.width = `${pct}%`;
            const stats = tracker.update(e.loaded);
            speedEl.textContent = formatSpeed(stats.speed);
            etaEl.textContent = `ETA ${formatETA(stats.eta)}`;
          }
        });
        xhr.addEventListener("load", () => xhr.status === 200 ? resolve() : reject(new Error(`Upload failed: ${xhr.status}`)));
        xhr.addEventListener("error", () => reject(new Error("Network error")));
        xhr.open("PUT", uploadUrl);
        xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
        xhr.send(file);
      });

      // Confirm
      await fetch(`${API_URL}/public-upload/${uploadToken}/confirm/${fileId}`, { method: "POST" });

      successCount++;
      addUploadedFile(file.name, file.size);
    } catch (error) {
      console.error(`Upload failed for ${file.name}:`, error);
      showToast(`Failed: ${file.name} - ${error.message}`, "error", 6000);
    }
  }

  progress.classList.add("hidden");

  if (successCount > 0) {
    showToast(`${successCount} file(s) uploaded successfully`, "success");
    // Update file count
    const countEl = document.getElementById("file-count");
    countEl.textContent = parseInt(countEl.textContent || "0") + successCount;
  }
}

function addUploadedFile(name, size) {
  uploadedFiles.push({ name, size });
  const section = document.getElementById("uploaded-section");
  const list = document.getElementById("uploaded-list");
  section.classList.remove("hidden");

  const div = document.createElement("div");
  div.className = "flex items-center gap-2 glass-light rounded-lg px-3 py-2";
  div.innerHTML = `
    <span class="text-green-400">✓</span>
    <span class="text-sm text-white truncate flex-1">${escapeHtml(name)}</span>
    <span class="text-xs text-gray-500">${formatFileSize(size)}</span>
  `;
  list.appendChild(div);
}

// Speed tracking
class SpeedTracker {
  constructor(totalSize) {
    this.totalSize = totalSize;
    this.lastTime = Date.now();
    this.lastLoaded = 0;
    this.samples = [];
  }
  update(loaded) {
    const now = Date.now();
    const elapsed = now - this.lastTime;
    if (elapsed > 200) {
      const speed = (loaded - this.lastLoaded) / (elapsed / 1000);
      this.samples.push(speed);
      if (this.samples.length > 10) this.samples.shift();
      this.lastTime = now;
      this.lastLoaded = loaded;
    }
    const avg = this.samples.length > 0 ? this.samples.reduce((a, b) => a + b, 0) / this.samples.length : 0;
    const remaining = this.totalSize - loaded;
    return { speed: avg, eta: avg > 0 ? remaining / avg : 0 };
  }
}

// Utilities
function showError(message) {
  document.getElementById("loading").classList.add("hidden");
  document.getElementById("upload-view").classList.add("hidden");
  document.getElementById("error-message").textContent = message;
  document.getElementById("error-view").classList.remove("hidden");
}

function showToast(message, type = "info", duration = 4000) {
  const container = document.getElementById("toast-container");
  const toast = document.createElement("div");
  const colors = { success: "bg-green-500/90", error: "bg-red-500/90", info: "bg-indigo-500/90" };
  const icons = { success: "✓", error: "✕", info: "ℹ" };
  toast.className = `toast-enter flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg text-white ${colors[type]} min-w-[280px] max-w-md backdrop-blur-sm`;
  toast.innerHTML = `<span class="text-lg">${icons[type]}</span><span class="flex-1 text-sm">${escapeHtml(message)}</span><button onclick="this.parentElement.remove()" class="text-white/80 hover:text-white">✕</button>`;
  container.appendChild(toast);
  if (duration > 0) {
    setTimeout(() => { toast.classList.add("toast-exit"); setTimeout(() => toast.remove(), 300); }, duration);
  }
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function formatFileSize(bytes) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

function formatSpeed(bps) {
  if (bps < 1024) return `${Math.round(bps)} B/s`;
  if (bps < 1024 * 1024) return `${(bps / 1024).toFixed(1)} KB/s`;
  return `${(bps / (1024 * 1024)).toFixed(1)} MB/s`;
}

function formatETA(seconds) {
  if (seconds <= 0 || !isFinite(seconds)) return "--:--";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return m > 0 ? `${m}:${s.toString().padStart(2, "0")}` : `0:${s.toString().padStart(2, "0")}`;
}
