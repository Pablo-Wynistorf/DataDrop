const API_URL = window.API_URL || "/api";
let currentUser = null;
let currentShareFileId = null;
let currentShareFileData = null;
let currentEditFileId = null;
let currentEditFileData = null;
let pendingUploadFile = null;
let pendingUploadFiles = [];
let allFiles = [];
let currentTypeFilter = 'all';

// Toast notification system
function showToast(message, type = "info", duration = 4000) {
  const container = document.getElementById("toast-container");
  const toast = document.createElement("div");
  
  const colors = {
    success: "bg-green-500/90",
    error: "bg-red-500/90",
    info: "bg-indigo-500/90",
    warning: "bg-yellow-500/90"
  };
  
  const icons = {
    success: "✓",
    error: "✕",
    info: "ℹ",
    warning: "⚠"
  };
  
  toast.className = `toast-enter flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg text-white ${colors[type]} min-w-[280px] max-w-md backdrop-blur-sm`;
  toast.innerHTML = `
    <span class="text-lg">${icons[type]}</span>
    <span class="flex-1 text-sm">${escapeHtml(message)}</span>
    <button onclick="this.parentElement.remove()" class="text-white/80 hover:text-white">✕</button>
  `;
  
  container.appendChild(toast);
  
  if (duration > 0) {
    setTimeout(() => {
      toast.classList.remove("toast-enter");
      toast.classList.add("toast-exit");
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }
}

// Custom confirm dialog
function showConfirm(message) {
  return new Promise((resolve) => {
    const modal = document.getElementById("confirm-modal");
    const msgEl = document.getElementById("confirm-message");
    const cancelBtn = document.getElementById("confirm-cancel");
    const okBtn = document.getElementById("confirm-ok");
    
    msgEl.textContent = message;
    modal.classList.remove("hidden");
    
    const cleanup = () => {
      modal.classList.add("hidden");
      cancelBtn.onclick = null;
      okBtn.onclick = null;
    };
    
    cancelBtn.onclick = () => { cleanup(); resolve(false); };
    okBtn.onclick = () => { cleanup(); resolve(true); };
  });
}

document.addEventListener("DOMContentLoaded", () => {
  verifySession();
  setupDropZone();
});

function setupDropZone() {
  const dropZone = document.getElementById("drop-zone");
  const fileInput = document.getElementById("file-input");
  const folderInput = document.getElementById("folder-input");
  
  dropZone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropZone.classList.add("drop-zone-active");
  });

  dropZone.addEventListener("dragleave", () => {
    dropZone.classList.remove("drop-zone-active");
  });

  dropZone.addEventListener("drop", async (e) => {
    e.preventDefault();
    dropZone.classList.remove("drop-zone-active");
    
    const items = e.dataTransfer.items;
    if (items) {
      const files = await getAllFilesFromDataTransfer(items);
      if (files.length > 0) {
        selectFiles(files);
      }
    } else if (e.dataTransfer.files.length) {
      selectFiles(Array.from(e.dataTransfer.files));
    }
  });
}

async function getAllFilesFromDataTransfer(items) {
  const files = [];
  
  for (let i = 0; i < items.length; i++) {
    const item = items[i].webkitGetAsEntry();
    if (item) {
      await traverseFileTree(item, files);
    }
  }
  
  return files;
}

async function traverseFileTree(item, files, path = "") {
  if (item.isFile) {
    return new Promise((resolve) => {
      item.file((file) => {
        files.push(file);
        resolve();
      });
    });
  } else if (item.isDirectory) {
    const dirReader = item.createReader();
    return new Promise((resolve) => {
      dirReader.readEntries(async (entries) => {
        for (const entry of entries) {
          await traverseFileTree(entry, files, path + item.name + "/");
        }
        resolve();
      });
    });
  }
}

function handleFileSelect(event) {
  if (event.target.files.length) {
    selectFiles(Array.from(event.target.files));
  }
}

function selectFile(file) {
  pendingUploadFile = file;
  pendingUploadFiles = [file];
  document.getElementById("selected-filename").textContent = file.name;
  document.getElementById("selected-filesize").textContent = formatFileSize(file.size);
  document.getElementById("upload-options").classList.remove("hidden");
  selectUploadType("cdn");
}

function selectFiles(files) {
  if (files.length === 0) return;
  
  pendingUploadFiles = files;
  pendingUploadFile = files[0]; // Keep for backward compatibility
  
  const totalSize = files.reduce((sum, f) => sum + f.size, 0);
  
  if (files.length === 1) {
    document.getElementById("selected-filename").textContent = files[0].name;
    document.getElementById("selected-filesize").textContent = formatFileSize(files[0].size);
  } else {
    document.getElementById("selected-filename").textContent = `${files.length} files selected`;
    document.getElementById("selected-filesize").textContent = `Total: ${formatFileSize(totalSize)}`;
  }
  
  document.getElementById("upload-options").classList.remove("hidden");
  selectUploadType("cdn");
}

function clearSelectedFile() {
  pendingUploadFile = null;
  pendingUploadFiles = [];
  document.getElementById("upload-options").classList.add("hidden");
  document.getElementById("file-input").value = "";
  document.getElementById("folder-input").value = "";
}

// New click-to-select upload type function
function selectUploadType(type) {
  const cdnBtn = document.getElementById("type-cdn");
  const privateBtn = document.getElementById("type-private");
  const privateOptions = document.getElementById("private-options");
  const uploadTypeInput = document.getElementById("upload-type");
  
  uploadTypeInput.value = type;
  
  if (type === "cdn") {
    cdnBtn.classList.add("selected", "border-indigo-500/50", "bg-indigo-500/10");
    cdnBtn.classList.remove("border-transparent");
    privateBtn.classList.remove("selected", "border-indigo-500/50", "bg-indigo-500/10");
    privateBtn.classList.add("border-transparent");
    privateOptions.classList.add("hidden");
  } else {
    privateBtn.classList.add("selected", "border-indigo-500/50", "bg-indigo-500/10");
    privateBtn.classList.remove("border-transparent");
    cdnBtn.classList.remove("selected", "border-indigo-500/50", "bg-indigo-500/10");
    cdnBtn.classList.add("border-transparent");
    privateOptions.classList.remove("hidden");
  }
}

function handleExpiryTypeChange() {
  const expiryType = document.getElementById("expiry-type").value;
  const presetSection = document.getElementById("expiry-preset-section");
  const customSection = document.getElementById("expiry-custom-section");
  
  if (expiryType === "preset") {
    presetSection.classList.remove("hidden");
    customSection.classList.add("hidden");
  } else {
    presetSection.classList.add("hidden");
    customSection.classList.remove("hidden");
  }
}

function startUpload() {
  if (!pendingUploadFiles || pendingUploadFiles.length === 0) return;
  
  const uploadType = document.getElementById("upload-type").value;
  
  let expiresInSeconds = null;
  let expiresAt = null;
  let maxDownloads = null;
  
  if (uploadType === "private") {
    const expiryType = document.getElementById("expiry-type").value;
    
    if (expiryType === "preset") {
      expiresInSeconds = parseInt(document.getElementById("expiry-preset").value);
    } else {
      expiresAt = document.getElementById("expiry-datetime").value;
    }
    
    const maxDownloadsInput = document.getElementById("max-downloads").value;
    if (maxDownloadsInput) {
      maxDownloads = parseInt(maxDownloadsInput);
    }
  }
  
  document.getElementById("upload-options").classList.add("hidden");
  
  if (pendingUploadFiles.length === 1) {
    uploadFile(pendingUploadFiles[0], uploadType, expiresInSeconds, expiresAt, maxDownloads);
  } else {
    uploadMultipleFiles(pendingUploadFiles, uploadType, expiresInSeconds, expiresAt, maxDownloads);
  }
  
  pendingUploadFile = null;
  pendingUploadFiles = [];
}

async function verifySession() {
  try {
    const res = await fetch(`${API_URL}/auth/verify`, {
      credentials: "include"
    });

    if (res.ok) {
      currentUser = await res.json();
      showMainView();
      loadFiles();
    } else {
      showLoginView();
    }
  } catch (error) {
    console.error("Session verification failed:", error);
    showLoginView();
  }
}

function showLoginView() {
  document.getElementById("login-view").classList.remove("hidden");
  document.getElementById("main-view").classList.add("hidden");
}

function showMainView() {
  document.getElementById("login-view").classList.add("hidden");
  document.getElementById("main-view").classList.remove("hidden");
  document.getElementById("user-name").textContent = currentUser.name || currentUser.email;
}

function login() {
  window.location.href = `${API_URL}/auth/login`;
}

async function logout() {
  try {
    await fetch(`${API_URL}/auth/logout`, {
      method: "POST",
      credentials: "include"
    });
  } catch (error) {
    console.error("Logout error:", error);
  }
  currentUser = null;
  showLoginView();
}

async function loadFiles() {
  try {
    const res = await fetch(`${API_URL}/files`, {
      credentials: "include"
    });

    if (res.ok) {
      const data = await res.json();
      allFiles = data.files;
      applyFilters();
    }
  } catch (error) {
    console.error("Failed to load files:", error);
  }
}

function renderFiles(files) {
  const list = document.getElementById("files-list");
  const noFiles = document.getElementById("no-files");
  const noResults = document.getElementById("no-results");

  if (!allFiles.length) {
    list.innerHTML = "";
    noFiles.classList.remove("hidden");
    noResults.classList.add("hidden");
    return;
  }

  if (!files.length) {
    list.innerHTML = "";
    return;
  }

  noFiles.classList.add("hidden");
  noResults.classList.add("hidden");
  list.innerHTML = files.map(file => {
    const expiryInfo = getExpiryDisplay(file);
    const downloadInfo = getDownloadLimitDisplay(file);
    const editButton = file.uploadType === "private" ? `
      <button onclick='openEditModal(${JSON.stringify(file).replace(/'/g, "&#39;")})' class="text-gray-400 hover:text-indigo-400 p-2 transition" title="Edit">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
        </svg>
      </button>
    ` : '';
    
    const openButton = file.uploadType === "cdn" && file.cdnUrl ? `
      <button onclick='window.open("${file.cdnUrl}", "_blank")' class="text-gray-400 hover:text-green-400 p-2 transition" title="Open in New Tab">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/>
        </svg>
      </button>
    ` : '';
    
    return `
    <div class="file-row p-4 flex items-center justify-between transition-opacity" data-file-id="${file.id}">
      <div class="flex-1 min-w-0 flex items-center gap-3">
        <div class="w-10 h-10 rounded-lg ${file.uploadType === 'cdn' ? 'bg-green-500/20' : 'bg-blue-500/20'} flex items-center justify-center flex-shrink-0">
          <span class="text-lg">${file.uploadType === 'cdn' ? '🌐' : '🔒'}</span>
        </div>
        <div class="min-w-0">
          <p class="font-medium text-white truncate">${escapeHtml(file.fileName)}</p>
          <p class="text-sm text-gray-500">${formatFileSize(file.fileSize)} • ${formatDate(file.createdAt)}</p>
          <div class="flex flex-wrap gap-2 mt-1 text-xs">
            ${expiryInfo}
            ${downloadInfo}
          </div>
        </div>
      </div>
      <div class="flex items-center gap-1 ml-4">
        <span class="px-2.5 py-1 text-xs rounded-lg font-medium ${file.uploadType === 'cdn' ? 'bg-green-500/20 text-green-400' : 'bg-blue-500/20 text-blue-400'}">
          ${file.uploadType === 'cdn' ? 'CDN' : 'Private'}
        </span>
        <span class="px-2.5 py-1 text-xs rounded-lg font-medium ${file.status === 'uploaded' ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'}">
          ${file.status}
        </span>
        ${openButton}
        ${editButton}
        <button onclick='openShareModal(${JSON.stringify(file).replace(/'/g, "&#39;")})' class="text-gray-400 hover:text-indigo-400 p-2 transition" title="Share">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"/>
          </svg>
        </button>
        <button onclick="deleteFile('${file.id}')" class="text-gray-400 hover:text-red-400 p-2 transition" title="Delete">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
          </svg>
        </button>
      </div>
    </div>
  `}).join("");
}

function getExpiryDisplay(file) {
  if (file.uploadType === "cdn") {
    return '<span class="text-green-400">♾️ Never expires</span>';
  }
  
  if (file.isExpired) {
    return '<span class="text-red-400">⏰ Expired</span>';
  }
  
  if (file.expiresAt) {
    const expiryDate = new Date(file.expiresAt);
    const now = new Date();
    const diffMs = expiryDate - now;
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);
    
    let timeLeft;
    if (diffDays > 0) {
      timeLeft = `${diffDays}d ${diffHours % 24}h`;
    } else if (diffHours > 0) {
      timeLeft = `${diffHours}h`;
    } else {
      const diffMins = Math.floor(diffMs / (1000 * 60));
      timeLeft = `${diffMins}m`;
    }
    
    const urgencyClass = diffHours < 24 ? "text-orange-400" : "text-gray-400";
    return `<span class="${urgencyClass}">⏰ Expires in ${timeLeft}</span>`;
  }
  
  return '';
}

function getDownloadLimitDisplay(file) {
  if (file.uploadType === "cdn" || !file.maxDownloads) {
    return '';
  }
  
  const remaining = file.downloadsRemaining ?? (file.maxDownloads - (file.downloadCount || 0));
  const urgencyClass = remaining <= 1 ? "text-orange-400" : "text-gray-400";
  return `<span class="${urgencyClass}">📥 ${remaining}/${file.maxDownloads} downloads left</span>`;
}

// Upload progress tracker for speed and ETA calculation
class UploadTracker {
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
    
    if (elapsed > 200) { // Update every 200ms
      const bytesDiff = loaded - this.lastLoaded;
      const speed = bytesDiff / (elapsed / 1000);
      
      this.speedSamples.push(speed);
      if (this.speedSamples.length > 10) {
        this.speedSamples.shift();
      }
      
      this.lastTime = now;
      this.lastLoaded = loaded;
    }
    
    return this.getStats(loaded);
  }

  getStats(loaded) {
    const avgSpeed = this.speedSamples.length > 0 
      ? this.speedSamples.reduce((a, b) => a + b, 0) / this.speedSamples.length 
      : 0;
    
    const remaining = this.totalSize - loaded;
    const eta = avgSpeed > 0 ? remaining / avgSpeed : 0;
    
    return { speed: avgSpeed, eta };
  }
}

function formatSpeed(bytesPerSec) {
  if (bytesPerSec < 1024) return `${Math.round(bytesPerSec)} B/s`;
  if (bytesPerSec < 1024 * 1024) return `${(bytesPerSec / 1024).toFixed(1)} KB/s`;
  if (bytesPerSec < 1024 * 1024 * 1024) return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`;
  return `${(bytesPerSec / (1024 * 1024 * 1024)).toFixed(1)} GB/s`;
}

function formatETA(seconds) {
  if (seconds <= 0 || !isFinite(seconds)) return '--:--';
  
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}:${s.toString().padStart(2, '0')}`;
  return `0:${s.toString().padStart(2, '0')}`;
}

async function uploadFile(file, uploadType, expiresInSeconds, expiresAt, maxDownloads) {
  const progress = document.getElementById("upload-progress");
  const filename = document.getElementById("upload-filename");
  const percent = document.getElementById("upload-percent");
  const speedEl = document.getElementById("upload-speed");
  const etaEl = document.getElementById("upload-eta");
  const bar = document.getElementById("upload-bar");

  progress.classList.remove("hidden");
  filename.textContent = file.name;
  percent.textContent = "0%";
  speedEl.textContent = "";
  etaEl.textContent = "";
  bar.style.width = "0%";

  const tracker = new UploadTracker(file.size);

  try {
    const body = {
      fileName: file.name,
      fileType: file.type || "application/octet-stream",
      fileSize: file.size,
      uploadType
    };
    
    if (uploadType === "private") {
      if (expiresAt) {
        body.expiresAt = expiresAt;
      } else if (expiresInSeconds) {
        body.expiresInSeconds = expiresInSeconds;
      }
      if (maxDownloads) {
        body.maxDownloads = maxDownloads;
      }
    }
    
    const res = await fetch(`${API_URL}/upload`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      let errorMsg = "Failed to get upload URL";
      try {
        const errorData = await res.json();
        errorMsg = errorData.error || errorMsg;
      } catch (e) {}
      throw new Error(errorMsg);
    }

    const uploadData = await res.json();
    const { uploadUrl, fileId, cdnUrl, multipart } = uploadData;

    if (multipart) {
      // Multipart upload for large files (>5GB)
      await doMultipartUpload(file, fileId, multipart, percent, bar, speedEl, etaEl, tracker);
    } else {
      // Single PUT upload for smaller files
      await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.upload.addEventListener("progress", (e) => {
          if (e.lengthComputable) {
            const pct = Math.round((e.loaded / e.total) * 100);
            percent.textContent = `${pct}%`;
            bar.style.width = `${pct}%`;
            
            const { speed, eta } = tracker.update(e.loaded);
            speedEl.textContent = formatSpeed(speed);
            etaEl.textContent = `ETA ${formatETA(eta)}`;
          }
        });
        xhr.addEventListener("load", () => {
          if (xhr.status === 200) {
            resolve();
          } else {
            console.error("S3 upload failed:", xhr.status, xhr.responseText);
            reject(new Error(`Upload failed: ${xhr.status}`));
          }
        });
        xhr.addEventListener("error", (e) => {
          console.error("XHR error:", e);
          reject(new Error("Network error during upload"));
        });
        xhr.open("PUT", uploadUrl);
        xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
        xhr.send(file);
      });

      await fetch(`${API_URL}/files/${fileId}/confirm`, {
        method: "POST",
        credentials: "include"
      });
    }

    progress.classList.add("hidden");
    document.getElementById("file-input").value = "";
    document.getElementById("folder-input").value = "";
    loadFiles();

    if (uploadType === "cdn" && cdnUrl) {
      showToast("File uploaded successfully!", "success");
      setTimeout(() => {
        loadFiles().then(() => {
          const file = { id: fileId, uploadType: "cdn", cdnUrl };
          openShareModal(file);
        });
      }, 500);
    } else {
      showToast("File uploaded successfully!", "success");
    }
  } catch (error) {
    console.error("Upload failed:", error);
    showToast(error.message, "error", 8000);
    progress.classList.add("hidden");
  }
}

async function doMultipartUpload(file, fileId, multipart, percentEl, barEl, speedEl, etaEl, tracker) {
  const { partCount, partSize } = multipart;
  const parts = [];
  let totalUploaded = 0;

  for (let partNum = 1; partNum <= partCount; partNum++) {
    const start = (partNum - 1) * partSize;
    const end = Math.min(start + partSize, file.size);
    const partBlob = file.slice(start, end);
    const currentPartSize = end - start;

    // Get presigned URL for this part
    const partRes = await fetch(`${API_URL}/upload/${fileId}/part`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ partNumber: partNum })
    });

    if (!partRes.ok) {
      throw new Error(`Failed to get URL for part ${partNum}`);
    }

    const { uploadUrl } = await partRes.json();

    // Upload the part with progress tracking
    const etag = await new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.upload.addEventListener("progress", (e) => {
        if (e.lengthComputable) {
          const partProgress = totalUploaded + e.loaded;
          const pct = Math.round((partProgress / file.size) * 100);
          percentEl.textContent = `${pct}%`;
          barEl.style.width = `${pct}%`;
          
          const { speed, eta } = tracker.update(partProgress);
          speedEl.textContent = formatSpeed(speed);
          etaEl.textContent = `ETA ${formatETA(eta)} (part ${partNum}/${partCount})`;
        }
      });
      xhr.addEventListener("load", () => {
        if (xhr.status === 200) {
          const etag = xhr.getResponseHeader("ETag");
          resolve(etag);
        } else {
          reject(new Error(`Part ${partNum} upload failed: ${xhr.status}`));
        }
      });
      xhr.addEventListener("error", () => {
        reject(new Error(`Network error uploading part ${partNum}`));
      });
      xhr.open("PUT", uploadUrl);
      xhr.send(partBlob);
    });

    totalUploaded += currentPartSize;
    parts.push({ partNumber: partNum, etag });
  }

  // Complete the multipart upload
  percentEl.textContent = "Completing...";
  const completeRes = await fetch(`${API_URL}/upload/${fileId}/complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ parts })
  });

  if (!completeRes.ok) {
    throw new Error("Failed to complete multipart upload");
  }
}

async function uploadMultipleFiles(files, uploadType, expiresInSeconds, expiresAt, maxDownloads) {
  const progress = document.getElementById("upload-progress");
  const filename = document.getElementById("upload-filename");
  const percent = document.getElementById("upload-percent");
  const speedEl = document.getElementById("upload-speed");
  const etaEl = document.getElementById("upload-eta");
  const bar = document.getElementById("upload-bar");

  progress.classList.remove("hidden");
  
  const totalSize = files.reduce((sum, f) => sum + f.size, 0);
  const tracker = new UploadTracker(totalSize);
  
  let uploadedSize = 0;
  let successCount = 0;
  let failedFiles = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    filename.textContent = `${i + 1}/${files.length}: ${file.name}`;
    
    try {
      const body = {
        fileName: file.name,
        fileType: file.type || "application/octet-stream",
        fileSize: file.size,
        uploadType
      };
      
      if (uploadType === "private") {
        if (expiresAt) {
          body.expiresAt = expiresAt;
        } else if (expiresInSeconds) {
          body.expiresInSeconds = expiresInSeconds;
        }
        if (maxDownloads) {
          body.maxDownloads = maxDownloads;
        }
      }
      
      const res = await fetch(`${API_URL}/upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body)
      });

      if (!res.ok) {
        let errorMsg = "Failed to get upload URL";
        try {
          const errorData = await res.json();
          errorMsg = errorData.error || errorMsg;
        } catch (e) {}
        throw new Error(errorMsg);
      }

      const uploadData = await res.json();
      const { uploadUrl, fileId, multipart } = uploadData;

      if (multipart) {
        // Multipart upload for large files
        await doMultipartUploadInBatch(file, fileId, multipart, i, files.length, uploadedSize, totalSize, percent, bar, speedEl, etaEl, tracker);
      } else {
        // Single PUT upload
        await new Promise((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.upload.addEventListener("progress", (e) => {
            if (e.lengthComputable) {
              const currentProgress = uploadedSize + e.loaded;
              const pct = Math.round((currentProgress / totalSize) * 100);
              percent.textContent = `${pct}%`;
              bar.style.width = `${pct}%`;
              
              const { speed, eta } = tracker.update(currentProgress);
              speedEl.textContent = formatSpeed(speed);
              etaEl.textContent = `ETA ${formatETA(eta)}`;
            }
          });
          xhr.addEventListener("load", () => {
            if (xhr.status === 200) {
              resolve();
            } else {
              reject(new Error(`Upload failed: ${xhr.status}`));
            }
          });
          xhr.addEventListener("error", () => {
            reject(new Error("Network error during upload"));
          });
          xhr.open("PUT", uploadUrl);
          xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
          xhr.send(file);
        });

        await fetch(`${API_URL}/files/${fileId}/confirm`, {
          method: "POST",
          credentials: "include"
        });
      }
      
      uploadedSize += file.size;
      successCount++;
      
    } catch (error) {
      console.error(`Upload failed for ${file.name}:`, error);
      failedFiles.push({ name: file.name, error: error.message });
      uploadedSize += file.size; // Still count it for progress
    }
  }

  progress.classList.add("hidden");
  document.getElementById("file-input").value = "";
  document.getElementById("folder-input").value = "";
  loadFiles();

  if (failedFiles.length === 0) {
    showToast(`All ${successCount} files uploaded successfully!`, "success");
  } else if (successCount > 0) {
    showToast(`${successCount} files uploaded, ${failedFiles.length} failed`, "warning", 6000);
  } else {
    showToast(`All uploads failed`, "error", 6000);
  }
}

async function doMultipartUploadInBatch(file, fileId, multipart, fileIndex, totalFiles, uploadedSoFar, totalSize, percentEl, barEl, speedEl, etaEl, tracker) {
  const { partCount, partSize } = multipart;
  const parts = [];
  let fileUploaded = 0;

  for (let partNum = 1; partNum <= partCount; partNum++) {
    const start = (partNum - 1) * partSize;
    const end = Math.min(start + partSize, file.size);
    const partBlob = file.slice(start, end);
    const currentPartSize = end - start;

    const partRes = await fetch(`${API_URL}/upload/${fileId}/part`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ partNumber: partNum })
    });

    if (!partRes.ok) {
      throw new Error(`Failed to get URL for part ${partNum}`);
    }

    const { uploadUrl } = await partRes.json();

    const etag = await new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.upload.addEventListener("progress", (e) => {
        if (e.lengthComputable) {
          const currentProgress = uploadedSoFar + fileUploaded + e.loaded;
          const pct = Math.round((currentProgress / totalSize) * 100);
          percentEl.textContent = `${pct}%`;
          barEl.style.width = `${pct}%`;
          
          const { speed, eta } = tracker.update(currentProgress);
          speedEl.textContent = formatSpeed(speed);
          etaEl.textContent = `ETA ${formatETA(eta)} (file ${fileIndex + 1}/${totalFiles}, part ${partNum}/${partCount})`;
        }
      });
      xhr.addEventListener("load", () => {
        if (xhr.status === 200) {
          resolve(xhr.getResponseHeader("ETag"));
        } else {
          reject(new Error(`Part ${partNum} upload failed: ${xhr.status}`));
        }
      });
      xhr.addEventListener("error", () => {
        reject(new Error(`Network error uploading part ${partNum}`));
      });
      xhr.open("PUT", uploadUrl);
      xhr.send(partBlob);
    });

    fileUploaded += currentPartSize;
    parts.push({ partNumber: partNum, etag });
  }

  percentEl.textContent = "Completing...";
  const completeRes = await fetch(`${API_URL}/upload/${fileId}/complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ parts })
  });

  if (!completeRes.ok) {
    throw new Error("Failed to complete multipart upload");
  }
}

async function deleteFile(fileId) {
  const confirmed = await showConfirm("Are you sure you want to delete this file?");
  if (!confirmed) return;

  const fileElement = document.querySelector(`[data-file-id="${fileId}"]`);
  if (fileElement) {
    fileElement.style.opacity = "0.5";
    fileElement.style.pointerEvents = "none";
  }
  
  showToast("Deleting file...", "info", 2000);

  try {
    const res = await fetch(`${API_URL}/files/${fileId}`, {
      method: "DELETE",
      credentials: "include"
    });

    if (res.ok) {
      if (fileElement) fileElement.remove();
      
      const list = document.getElementById("files-list");
      if (!list.children.length) {
        document.getElementById("no-files").classList.remove("hidden");
      }
      
      showToast("File deleted", "success");
    } else {
      if (fileElement) {
        fileElement.style.opacity = "1";
        fileElement.style.pointerEvents = "auto";
      }
      showToast("Failed to delete file", "error");
    }
  } catch (error) {
    console.error("Delete failed:", error);
    if (fileElement) {
      fileElement.style.opacity = "1";
      fileElement.style.pointerEvents = "auto";
    }
    showToast("Failed to delete file", "error");
  }
}

// Edit Modal
function openEditModal(file) {
  currentEditFileId = file.id;
  currentEditFileData = file;
  
  document.getElementById("edit-expiry-type").value = "preset";
  document.getElementById("edit-expiry-preset").value = "604800";
  handleEditExpiryTypeChange();
  
  document.getElementById("edit-max-downloads").value = file.maxDownloads || "";
  
  const currentInfo = document.getElementById("edit-current-info");
  let infoText = "";
  if (file.expiresAt) {
    infoText += `Current expiry: ${new Date(file.expiresAt).toLocaleString()}`;
  }
  if (file.maxDownloads) {
    const remaining = file.downloadsRemaining ?? (file.maxDownloads - (file.downloadCount || 0));
    infoText += `${infoText ? " | " : ""}Downloads: ${remaining}/${file.maxDownloads} remaining`;
  }
  currentInfo.textContent = infoText || "No limits set";
  
  document.getElementById("edit-modal").classList.remove("hidden");
}

function closeEditModal() {
  document.getElementById("edit-modal").classList.add("hidden");
  currentEditFileId = null;
  currentEditFileData = null;
}

function handleEditExpiryTypeChange() {
  const expiryType = document.getElementById("edit-expiry-type").value;
  const presetSection = document.getElementById("edit-expiry-preset-section");
  const customSection = document.getElementById("edit-expiry-custom-section");
  
  if (expiryType === "preset") {
    presetSection.classList.remove("hidden");
    customSection.classList.add("hidden");
  } else {
    presetSection.classList.add("hidden");
    customSection.classList.remove("hidden");
  }
}

async function saveFileEdit() {
  if (!currentEditFileId) {
    showToast("No file selected", "error");
    return;
  }

  const expiryType = document.getElementById("edit-expiry-type").value;
  const maxDownloadsInput = document.getElementById("edit-max-downloads").value.trim();
  
  const body = {};
  
  // Handle expiry - always send one of these
  if (expiryType === "preset") {
    const presetValue = document.getElementById("edit-expiry-preset").value;
    body.expiresInSeconds = parseInt(presetValue, 10);
  } else {
    const datetime = document.getElementById("edit-expiry-datetime").value;
    if (datetime) {
      // Convert to ISO string format
      body.expiresAt = new Date(datetime).toISOString();
    } else {
      // Default to 1 week if no custom date selected
      body.expiresInSeconds = 604800;
    }
  }
  
  // Handle max downloads - send as number or null for unlimited
  if (maxDownloadsInput && maxDownloadsInput !== "") {
    const parsed = parseInt(maxDownloadsInput, 10);
    if (!isNaN(parsed) && parsed > 0) {
      body.maxDownloads = parsed;
    }
  } else {
    // Empty input means unlimited - send null to remove the limit
    body.maxDownloads = null;
  }
  
  console.log("Sending update:", body);
  
  try {
    const res = await fetch(`${API_URL}/files/${currentEditFileId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body)
    });

    let data;
    try {
      data = await res.json();
    } catch (e) {
      data = {};
    }

    if (!res.ok) {
      console.error("Update failed:", res.status, data);
      showToast(data.error || `Failed to update file (${res.status})`, "error");
      return;
    }

    showToast("File settings updated", "success");
    closeEditModal();
    loadFiles();
  } catch (error) {
    console.error("Edit failed:", error);
    showToast("Network error - failed to update file", "error");
  }
}

// Share Modal
function openShareModal(file) {
  currentShareFileId = file.id;
  currentShareFileData = file;
  
  const cdnView = document.getElementById("share-cdn-view");
  const privateView = document.getElementById("share-private-view");
  const linkResult = document.getElementById("share-link-result");
  
  cdnView.classList.add("hidden");
  privateView.classList.add("hidden");
  linkResult.classList.add("hidden");
  
  if (file.uploadType === "cdn") {
    cdnView.classList.remove("hidden");
    document.getElementById("share-cdn-url").value = file.cdnUrl || "";
  } else {
    privateView.classList.remove("hidden");
    document.getElementById("share-expiry-type").value = "preset";
    document.getElementById("share-expiry-preset").value = "86400";
    handleShareExpiryTypeChange();
    
    const fileInfo = document.getElementById("share-file-info");
    let infoHtml = "";
    if (file.expiresAt) {
      infoHtml += `<p>File expires: ${new Date(file.expiresAt).toLocaleString()}</p>`;
    }
    if (file.maxDownloads) {
      const remaining = file.downloadsRemaining ?? (file.maxDownloads - (file.downloadCount || 0));
      infoHtml += `<p>Downloads remaining: ${remaining} of ${file.maxDownloads}</p>`;
    }
    fileInfo.innerHTML = infoHtml;
    fileInfo.classList.toggle("hidden", !infoHtml);
  }
  
  document.getElementById("share-modal").classList.remove("hidden");
}

function handleShareExpiryTypeChange() {
  const expiryType = document.getElementById("share-expiry-type").value;
  const presetSection = document.getElementById("share-expiry-preset-section");
  const customSection = document.getElementById("share-expiry-custom-section");
  
  if (expiryType === "preset") {
    presetSection.classList.remove("hidden");
    customSection.classList.add("hidden");
  } else {
    presetSection.classList.add("hidden");
    customSection.classList.remove("hidden");
  }
}

function closeShareModal() {
  document.getElementById("share-modal").classList.add("hidden");
  currentShareFileId = null;
  currentShareFileData = null;
}

async function generateShareLink() {
  const expiryType = document.getElementById("share-expiry-type").value;
  
  let body = {};
  
  if (expiryType === "preset") {
    body.expiresInSeconds = parseInt(document.getElementById("share-expiry-preset").value);
  } else {
    body.expiresAt = document.getElementById("share-expiry-datetime").value;
  }
  
  try {
    const res = await fetch(`${API_URL}/files/${currentShareFileId}/share`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const data = await res.json();
      showToast(data.error || "Failed to generate share link", "error");
      return;
    }

    const data = await res.json();
    
    document.getElementById("share-url").value = data.shareUrl;
    
    let expiryText = `Link expires: ${new Date(data.expiresAt).toLocaleString()}`;
    if (data.fileExpiresAt) {
      expiryText += ` | File expires: ${new Date(data.fileExpiresAt).toLocaleString()}`;
    }
    if (data.maxDownloads) {
      expiryText += ` | Downloads: ${data.downloadsRemaining}/${data.maxDownloads}`;
    }
    document.getElementById("share-expires-at").textContent = expiryText;
    document.getElementById("share-link-result").classList.remove("hidden");
  } catch (error) {
    console.error("Generate share link failed:", error);
    showToast("Failed to generate share link", "error");
  }
}

function copyShareUrl() {
  const input = document.getElementById("share-url");
  navigator.clipboard.writeText(input.value).then(() => {
    showToast("Link copied to clipboard!", "success");
  }).catch(() => {
    input.select();
    document.execCommand("copy");
    showToast("Link copied!", "success");
  });
}

function copyCdnUrl() {
  const input = document.getElementById("share-cdn-url");
  navigator.clipboard.writeText(input.value).then(() => {
    showToast("CDN link copied to clipboard!", "success");
  }).catch(() => {
    input.select();
    document.execCommand("copy");
    showToast("CDN link copied!", "success");
  });
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

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString();
}

// ============ FILTERING FUNCTIONS ============

function toggleFilters() {
  const panel = document.getElementById("filters-panel");
  panel.classList.toggle("hidden");
}

function toggleTypeFilter(type) {
  currentTypeFilter = type;
  
  // Update button styles
  document.querySelectorAll('#filter-type-all, #filter-type-cdn, #filter-type-private').forEach(btn => {
    btn.classList.remove('bg-indigo-500/20', 'text-indigo-400', 'border-indigo-500/30');
    btn.classList.add('bg-gray-700/50', 'text-gray-400', 'border-transparent');
  });
  
  const activeBtn = document.getElementById(`filter-type-${type}`);
  activeBtn.classList.remove('bg-gray-700/50', 'text-gray-400', 'border-transparent');
  activeBtn.classList.add('bg-indigo-500/20', 'text-indigo-400', 'border-indigo-500/30');
  
  applyFilters();
}

function getFileCategory(fileName, fileType) {
  const ext = fileName.split('.').pop().toLowerCase();
  
  const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico', 'tiff'];
  const videoExts = ['mp4', 'webm', 'avi', 'mov', 'mkv', 'flv', 'wmv', 'm4v'];
  const audioExts = ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a', 'wma'];
  const docExts = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'rtf', 'odt', 'ods', 'odp'];
  const archiveExts = ['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz'];
  const codeExts = ['js', 'ts', 'jsx', 'tsx', 'py', 'java', 'c', 'cpp', 'h', 'cs', 'go', 'rs', 'rb', 'php', 'html', 'css', 'scss', 'json', 'xml', 'yaml', 'yml', 'md', 'sql', 'sh', 'bash'];
  
  if (imageExts.includes(ext) || fileType?.startsWith('image/')) return 'image';
  if (videoExts.includes(ext) || fileType?.startsWith('video/')) return 'video';
  if (audioExts.includes(ext) || fileType?.startsWith('audio/')) return 'audio';
  if (docExts.includes(ext) || fileType?.includes('document') || fileType?.includes('pdf')) return 'document';
  if (archiveExts.includes(ext) || fileType?.includes('zip') || fileType?.includes('compressed')) return 'archive';
  if (codeExts.includes(ext) || fileType?.includes('javascript') || fileType?.includes('json')) return 'code';
  
  return 'other';
}

function getFileSizeCategory(bytes) {
  const MB = 1024 * 1024;
  const GB = 1024 * MB;
  
  if (bytes < MB) return 'small';
  if (bytes < 100 * MB) return 'medium';
  if (bytes < GB) return 'large';
  return 'huge';
}

function getExpiryCategory(file) {
  if (file.uploadType === 'cdn') return 'never';
  if (file.isExpired) return 'expired';
  if (!file.expiresAt) return 'never';
  
  const expiryDate = new Date(file.expiresAt);
  const now = new Date();
  const diffMs = expiryDate - now;
  const diffHours = diffMs / (1000 * 60 * 60);
  
  if (diffHours < 0) return 'expired';
  if (diffHours < 24) return 'expiring-soon';
  if (diffHours < 24 * 7) return 'expiring-week';
  
  return 'active';
}

function getDownloadCategory(file) {
  if (file.uploadType === 'cdn') return 'unlimited';
  if (!file.maxDownloads) return 'unlimited';
  
  const remaining = file.downloadsRemaining ?? (file.maxDownloads - (file.downloadCount || 0));
  if (remaining < 3) return 'low';
  return 'limited';
}

function applyFilters() {
  const searchQuery = document.getElementById("search-input")?.value?.toLowerCase() || '';
  const fileTypeFilter = document.getElementById("filter-filetype")?.value || '';
  const fileSizeFilter = document.getElementById("filter-filesize")?.value || '';
  const expiryFilter = document.getElementById("filter-expiry")?.value || '';
  const downloadsFilter = document.getElementById("filter-downloads")?.value || '';
  
  let filtered = allFiles.filter(file => {
    // Search filter
    if (searchQuery && !file.fileName.toLowerCase().includes(searchQuery)) {
      return false;
    }
    
    // Type filter (CDN/Private)
    if (currentTypeFilter !== 'all' && file.uploadType !== currentTypeFilter) {
      return false;
    }
    
    // File type filter
    if (fileTypeFilter) {
      const category = getFileCategory(file.fileName, file.fileType);
      if (category !== fileTypeFilter) return false;
    }
    
    // File size filter
    if (fileSizeFilter) {
      const sizeCategory = getFileSizeCategory(file.fileSize);
      if (sizeCategory !== fileSizeFilter) return false;
    }
    
    // Expiry filter
    if (expiryFilter) {
      const expiryCategory = getExpiryCategory(file);
      if (expiryFilter === 'never' && expiryCategory !== 'never') return false;
      if (expiryFilter === 'expiring-soon' && expiryCategory !== 'expiring-soon') return false;
      if (expiryFilter === 'expiring-week' && !['expiring-soon', 'expiring-week'].includes(expiryCategory)) return false;
      if (expiryFilter === 'expired' && expiryCategory !== 'expired') return false;
    }
    
    // Downloads filter
    if (downloadsFilter) {
      const downloadCategory = getDownloadCategory(file);
      if (downloadsFilter === 'unlimited' && downloadCategory !== 'unlimited') return false;
      if (downloadsFilter === 'limited' && downloadCategory === 'unlimited') return false;
      if (downloadsFilter === 'low' && downloadCategory !== 'low') return false;
    }
    
    return true;
  });
  
  renderFiles(filtered);
  updateFilterUI(filtered.length);
}

function updateFilterUI(resultCount) {
  const resultsInfo = document.getElementById("results-info");
  const resultsCount = document.getElementById("results-count");
  const noFiles = document.getElementById("no-files");
  const noResults = document.getElementById("no-results");
  const activeFilterCount = document.getElementById("active-filter-count");
  
  // Count active filters
  let activeCount = 0;
  if (document.getElementById("search-input")?.value) activeCount++;
  if (currentTypeFilter !== 'all') activeCount++;
  if (document.getElementById("filter-filetype")?.value) activeCount++;
  if (document.getElementById("filter-filesize")?.value) activeCount++;
  if (document.getElementById("filter-expiry")?.value) activeCount++;
  if (document.getElementById("filter-downloads")?.value) activeCount++;
  
  // Update filter count badge
  if (activeCount > 0) {
    activeFilterCount.textContent = activeCount;
    activeFilterCount.classList.remove("hidden");
  } else {
    activeFilterCount.classList.add("hidden");
  }
  
  // Show results info when filters are active
  if (activeCount > 0) {
    resultsInfo.classList.remove("hidden");
    resultsCount.textContent = `Showing ${resultCount} of ${allFiles.length} files`;
  } else {
    resultsInfo.classList.add("hidden");
  }
  
  // Handle empty states
  if (allFiles.length === 0) {
    noFiles.classList.remove("hidden");
    noResults.classList.add("hidden");
  } else if (resultCount === 0 && activeCount > 0) {
    noFiles.classList.add("hidden");
    noResults.classList.remove("hidden");
  } else {
    noFiles.classList.add("hidden");
    noResults.classList.add("hidden");
  }
}

function clearAllFilters() {
  document.getElementById("search-input").value = '';
  document.getElementById("filter-filetype").value = '';
  document.getElementById("filter-filesize").value = '';
  document.getElementById("filter-expiry").value = '';
  document.getElementById("filter-downloads").value = '';
  
  currentTypeFilter = 'all';
  toggleTypeFilter('all');
  
  applyFilters();
}


// ============ CLI AUTHENTICATION ============

let pendingCLICode = null;

function checkCLIAuthParam() {
  const params = new URLSearchParams(window.location.search);
  const cliAuth = params.get("cli_auth");
  
  if (cliAuth && currentUser) {
    pendingCLICode = cliAuth;
    // Fetch the display code
    fetchCLIDisplayCode(cliAuth);
  }
}

async function fetchCLIDisplayCode(code) {
  try {
    const res = await fetch(`${API_URL}/auth/cli/login/${code}`);
    const data = await res.json();
    
    if (res.ok && data.status === "pending") {
      // Show the modal with display code
      // We need to get the display code from the initial request
      // For now, show first 8 chars of the code
      document.getElementById("cli-display-code").textContent = code.substring(0, 8).toUpperCase();
      document.getElementById("cli-auth-modal").classList.remove("hidden");
    } else {
      showToast("Invalid or expired CLI auth code", "error");
      clearCLIAuthParam();
    }
  } catch (error) {
    console.error("Failed to fetch CLI auth info:", error);
    showToast("Failed to verify CLI auth code", "error");
    clearCLIAuthParam();
  }
}

function clearCLIAuthParam() {
  const url = new URL(window.location);
  url.searchParams.delete("cli_auth");
  window.history.replaceState({}, "", url);
  pendingCLICode = null;
}

function closeCLIAuthModal() {
  document.getElementById("cli-auth-modal").classList.add("hidden");
  clearCLIAuthParam();
}

async function authorizeCLI() {
  if (!pendingCLICode) {
    showToast("No pending CLI authorization", "error");
    return;
  }

  try {
    const res = await fetch(`${API_URL}/auth/cli/authorize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ code: pendingCLICode })
    });

    const data = await res.json();

    if (res.ok) {
      showToast("CLI authorized successfully!", "success");
      closeCLIAuthModal();
    } else {
      showToast(data.error || "Failed to authorize CLI", "error");
    }
  } catch (error) {
    console.error("CLI authorization failed:", error);
    showToast("Failed to authorize CLI", "error");
  }
}

// Check for CLI auth param after login
const originalShowMainView = showMainView;
showMainView = function() {
  originalShowMainView();
  checkCLIAuthParam();
};


// ============ CLI DOWNLOAD MODAL ============

function openCLIModal() {
  const modal = document.getElementById("cli-modal");
  
  // Set install command using current domain
  const installCmd = `curl -fsSL ${window.location.origin}/install.sh | bash`;
  document.getElementById("cli-install-cmd").textContent = installCmd;
  
  // Set API URL for quick start
  document.getElementById("cli-api-url").textContent = window.location.origin;
  
  modal.classList.remove("hidden");
}

function closeCLIModal() {
  document.getElementById("cli-modal").classList.add("hidden");
}

function copyInstallCmd() {
  const cmd = document.getElementById("cli-install-cmd").textContent;
  navigator.clipboard.writeText(cmd).then(() => {
    showToast("Install command copied!", "success");
  }).catch(() => {
    showToast("Failed to copy", "error");
  });
}
