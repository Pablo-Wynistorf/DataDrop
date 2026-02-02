const API_URL = window.API_URL || "/api";
let fileToken = null;

document.addEventListener("DOMContentLoaded", () => {
  // URL format: /file?token=xxx
  const params = new URLSearchParams(window.location.search);
  fileToken = params.get("token");

  if (!fileToken) {
    showError("Invalid download link");
    return;
  }

  loadFileInfo();
});

async function loadFileInfo() {
  try {
    const res = await fetch(`${API_URL}/file/${fileToken}/info`);
    const data = await res.json();

    if (!res.ok) {
      showError(data.error || "File not found");
      return;
    }

    document.getElementById("file-name").textContent = data.fileName;
    document.getElementById("file-size").textContent = formatFileSize(data.fileSize);

    // Private files don't use password protection - they use JWT expiration
    document.getElementById("password-section").classList.add("hidden");

    // Show link expiry
    if (data.expiresAt) {
      const expiresEl = document.getElementById("expires-info");
      expiresEl.textContent = `Link expires: ${new Date(data.expiresAt).toLocaleString()}`;
      expiresEl.classList.remove("hidden");
    }

    // Show file expiry (when the file itself will be deleted)
    if (data.fileExpiresAt) {
      const fileExpiresEl = document.getElementById("file-expires-info");
      fileExpiresEl.textContent = `File expires: ${new Date(data.fileExpiresAt).toLocaleString()}`;
      fileExpiresEl.classList.remove("hidden");
    }

    // Show download limit info
    if (data.maxDownloads) {
      const downloadsEl = document.getElementById("downloads-info");
      downloadsEl.textContent = `Downloads remaining: ${data.downloadsRemaining} of ${data.maxDownloads}`;
      downloadsEl.classList.remove("hidden");
      
      if (data.downloadsRemaining <= 1) {
        downloadsEl.classList.add("text-orange-600");
      }
    }

    document.getElementById("loading").classList.add("hidden");
    document.getElementById("download-form").classList.remove("hidden");
  } catch (error) {
    console.error("Failed to load file info:", error);
    showError("Failed to load file information");
  }
}

async function downloadFile() {
  try {
    const res = await fetch(`${API_URL}/file/${fileToken}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({})
    });

    const data = await res.json();

    if (!res.ok) {
      showError(data.error || "Download failed");
      return;
    }

    window.location.href = data.downloadUrl;
    
    document.getElementById("download-form").classList.add("hidden");
    
    // Show success with remaining downloads info
    const successEl = document.getElementById("success");
    successEl.classList.remove("hidden");
    
    if (data.downloadsRemaining !== null && data.downloadsRemaining !== undefined) {
      const remainingEl = document.getElementById("downloads-remaining");
      if (data.downloadsRemaining === 0) {
        remainingEl.textContent = "This was the last download. The file has been deleted.";
        remainingEl.classList.add("text-orange-600");
      } else {
        remainingEl.textContent = `${data.downloadsRemaining} download(s) remaining.`;
      }
      remainingEl.classList.remove("hidden");
    }
  } catch (error) {
    console.error("Download failed:", error);
    showError("Download failed");
  }
}

function showError(message) {
  document.getElementById("loading").classList.add("hidden");
  document.getElementById("download-form").classList.add("hidden");
  document.getElementById("error-message").textContent = message;
  document.getElementById("error").classList.remove("hidden");
}

function formatFileSize(bytes) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}
