// File categorisation + filtering helpers shared by the dashboard.

export function getFileCategory(fileName, fileType) {
  const ext = fileName.split(".").pop().toLowerCase();
  const imageExts = ["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp", "ico", "tiff"];
  const videoExts = ["mp4", "webm", "avi", "mov", "mkv", "flv", "wmv", "m4v"];
  const audioExts = ["mp3", "wav", "ogg", "flac", "aac", "m4a", "wma"];
  const docExts = ["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "rtf", "odt", "ods", "odp"];
  const archiveExts = ["zip", "rar", "7z", "tar", "gz", "bz2", "xz"];
  const codeExts = ["js", "ts", "jsx", "tsx", "py", "java", "c", "cpp", "h", "cs", "go", "rs", "rb", "php", "html", "css", "scss", "json", "xml", "yaml", "yml", "md", "sql", "sh", "bash"];

  if (imageExts.includes(ext) || fileType?.startsWith("image/")) return "image";
  if (videoExts.includes(ext) || fileType?.startsWith("video/")) return "video";
  if (audioExts.includes(ext) || fileType?.startsWith("audio/")) return "audio";
  if (docExts.includes(ext) || fileType?.includes("document") || fileType?.includes("pdf")) return "document";
  if (archiveExts.includes(ext) || fileType?.includes("zip") || fileType?.includes("compressed")) return "archive";
  if (codeExts.includes(ext) || fileType?.includes("javascript") || fileType?.includes("json")) return "code";
  return "other";
}

export function getFileSizeCategory(bytes) {
  const MB = 1024 * 1024;
  const GB = 1024 * MB;
  if (bytes < MB) return "small";
  if (bytes < 100 * MB) return "medium";
  if (bytes < GB) return "large";
  return "huge";
}

export function getExpiryCategory(file) {
  if (file.uploadType === "cdn") return "never";
  if (file.isExpired) return "expired";
  if (!file.expiresAt) return "never";
  const diffHours = (new Date(file.expiresAt) - new Date()) / (1000 * 60 * 60);
  if (diffHours < 0) return "expired";
  if (diffHours < 24) return "expiring-soon";
  if (diffHours < 24 * 7) return "expiring-week";
  return "active";
}

export function getDownloadCategory(file) {
  if (file.uploadType === "cdn" || !file.maxDownloads) return "unlimited";
  const remaining = file.downloadsRemaining ?? file.maxDownloads - (file.downloadCount || 0);
  return remaining < 3 ? "low" : "limited";
}

const emptyFilters = {
  search: "",
  type: "all",
  fileType: "",
  fileSize: "",
  expiry: "",
  downloads: "",
};

export function makeEmptyFilters() {
  return { ...emptyFilters };
}

export function countActiveFilters(f) {
  let n = 0;
  if (f.search) n++;
  if (f.type !== "all") n++;
  if (f.fileType) n++;
  if (f.fileSize) n++;
  if (f.expiry) n++;
  if (f.downloads) n++;
  return n;
}

export function filterFiles(allFiles, currentFolder, f) {
  return allFiles.filter((file) => {
    if ((file.folderPath || "/") !== currentFolder) return false;
    if (f.search && !file.fileName.toLowerCase().includes(f.search.toLowerCase())) return false;
    if (f.type !== "all" && file.uploadType !== f.type) return false;
    if (f.fileType && getFileCategory(file.fileName, file.fileType) !== f.fileType) return false;
    if (f.fileSize && getFileSizeCategory(file.fileSize) !== f.fileSize) return false;
    if (f.expiry) {
      const cat = getExpiryCategory(file);
      if (f.expiry === "never" && cat !== "never") return false;
      if (f.expiry === "expiring-soon" && cat !== "expiring-soon") return false;
      if (f.expiry === "expiring-week" && !["expiring-soon", "expiring-week"].includes(cat)) return false;
      if (f.expiry === "expired" && cat !== "expired") return false;
    }
    if (f.downloads) {
      const cat = getDownloadCategory(file);
      if (f.downloads === "unlimited" && cat !== "unlimited") return false;
      if (f.downloads === "limited" && cat === "unlimited") return false;
      if (f.downloads === "low" && cat !== "low") return false;
    }
    return true;
  });
}

// Expiry / download badge text + tone for a file row.
export function expiryBadge(file) {
  if (file.uploadType === "cdn") return { text: "♾️ Never expires", tone: "text-emerald-600" };
  if (file.isExpired) return { text: "⏰ Expired", tone: "text-rose-600" };
  if (file.expiresAt) {
    const diffMs = new Date(file.expiresAt) - new Date();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);
    let left;
    if (diffDays > 0) left = `${diffDays}d ${diffHours % 24}h`;
    else if (diffHours > 0) left = `${diffHours}h`;
    else left = `${Math.floor(diffMs / (1000 * 60))}m`;
    return { text: `⏰ Expires in ${left}`, tone: diffHours < 24 ? "text-amber-600" : "text-slate-400" };
  }
  return null;
}

export function downloadBadge(file) {
  if (file.uploadType === "cdn" || !file.maxDownloads) return null;
  const remaining = file.downloadsRemaining ?? file.maxDownloads - (file.downloadCount || 0);
  return {
    text: `📥 ${remaining}/${file.maxDownloads} downloads left`,
    tone: remaining <= 1 ? "text-amber-600" : "text-slate-400",
  };
}

export const EXPIRY_PRESETS = [
  { value: "300", label: "5 minutes" },
  { value: "900", label: "15 minutes" },
  { value: "1800", label: "30 minutes" },
  { value: "3600", label: "1 hour" },
  { value: "21600", label: "6 hours" },
  { value: "86400", label: "1 day" },
  { value: "604800", label: "1 week" },
  { value: "1209600", label: "2 weeks" },
  { value: "2592000", label: "30 days" },
];
