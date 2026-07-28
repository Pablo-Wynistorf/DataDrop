import { useEffect, useRef, useState } from "react";
import Background from "../components/Background.jsx";
import Logo from "../components/Logo.jsx";
import { useToast } from "../components/Toast.jsx";
import { UploadCloud, Warning, Check, Close, Doc, Folder } from "../components/icons.jsx";
import { API_URL } from "../lib/api.js";
import { UploadTracker, putToS3, filesFromDataTransfer, relativePathOf } from "../lib/upload.js";
import { formatFileSize, formatSpeed, formatETA } from "../lib/format.js";

export default function PublicUpload() {
  const toast = useToast();
  const [status, setStatus] = useState("loading"); // loading | error | ready
  const [error, setError] = useState("");
  const [project, setProject] = useState(null);
  const [fileCount, setFileCount] = useState(0);
  const [selected, setSelected] = useState([]);
  const [uploaded, setUploaded] = useState([]);
  const [progress, setProgress] = useState(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef(null);
  const folderRef = useRef(null);
  const token = new URLSearchParams(window.location.search).get("token");

  useEffect(() => {
    if (!token) {
      setError("Invalid upload link");
      setStatus("error");
      return;
    }
    (async () => {
      try {
        const res = await fetch(`${API_URL}/public-upload/${token}/info`);
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "Invalid upload link");
          setStatus("error");
          return;
        }
        setProject(data);
        setFileCount(data.fileCount || 0);
        setStatus("ready");
      } catch {
        setError("Failed to load upload page");
        setStatus("error");
      }
    })();
  }, [token]);

  function addFiles(files) {
    setSelected((prev) => {
      const next = [...prev];
      for (const file of files) {
        if (file.size > project.maxFileSizeBytes) {
          toast(`${file.name} exceeds the ${formatFileSize(project.maxFileSizeBytes)} limit`, "error");
          continue;
        }
        // Dedupe by relative path so identically named files in different
        // subfolders are both kept when a folder is uploaded.
        const key = relativePathOf(file) || file.name;
        if (!next.find((f) => (relativePathOf(f) || f.name) === key && f.size === file.size)) next.push(file);
      }
      return next;
    });
  }

  // Pull real files out of a drop, descending into any dropped folders.
  async function addDropped(dataTransfer) {
    const items = dataTransfer.items;
    const supportsEntries = items && items.length && typeof items[0].webkitGetAsEntry === "function";
    if (supportsEntries) {
      const files = await filesFromDataTransfer(items);
      if (files.length) addFiles(files);
    } else if (dataTransfer.files.length) {
      addFiles(Array.from(dataTransfer.files));
    }
  }

  async function uploadAll() {
    if (selected.length === 0) return;
    const filesToUpload = [...selected];
    setSelected([]);
    let successCount = 0;

    for (let i = 0; i < filesToUpload.length; i++) {
      const file = filesToUpload[i];
      const label = relativePathOf(file) || file.name;
      setProgress({ name: `${i + 1}/${filesToUpload.length}: ${label}`, pct: 0, speed: 0, eta: 0 });
      try {
        const res = await fetch(`${API_URL}/public-upload/${token}/upload`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileName: file.name,
            fileType: file.type || "application/octet-stream",
            fileSize: file.size,
            relativePath: relativePathOf(file) || undefined,
          }),
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Failed to get upload URL");
        }
        const { uploadUrl, fileId } = await res.json();
        const tracker = new UploadTracker(file.size);
        await putToS3(uploadUrl, file, file.type || "application/octet-stream", (loaded, total) => {
          const { speed, eta } = tracker.update(loaded);
          setProgress({
            name: `${i + 1}/${filesToUpload.length}: ${label}`,
            pct: Math.round((loaded / total) * 100),
            speed,
            eta,
          });
        });
        await fetch(`${API_URL}/public-upload/${token}/confirm/${fileId}`, { method: "POST" });
        successCount++;
        setUploaded((u) => [...u, { name: label, size: file.size }]);
      } catch (err) {
        toast(`Failed: ${label} - ${err.message}`, "error", 6000);
      }
    }

    setProgress(null);
    if (successCount > 0) {
      toast(`${successCount} file(s) uploaded successfully`, "success");
      setFileCount((c) => c + successCount);
    }
  }

  const totalSize = selected.reduce((s, f) => s + f.size, 0);

  return (
    <div className="min-h-screen px-4 py-10">
      <Background />
      <div className="mx-auto max-w-lg">
        {status === "loading" && (
          <div className="card p-8 text-center">
            <div className="spinner mx-auto h-12 w-12" />
            <p className="mt-4 text-slate-500">Loading upload page...</p>
          </div>
        )}

        {status === "error" && (
          <div className="card p-8 text-center">
            <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-2xl bg-rose-100 text-rose-500">
              <Warning className="h-10 w-10" />
            </div>
            <h2 className="mb-2 text-xl font-semibold text-slate-900">Error</h2>
            <p className="text-slate-500">{error}</p>
          </div>
        )}

        {status === "ready" && project && (
          <div className="card p-8">
            <div className="mb-6 text-center">
              <div className="mb-3 flex justify-center">
                <Logo size="lg" withText={false} />
              </div>
              <p className="text-sm text-slate-400">DataDrop</p>
              <h1 className="mt-2 text-2xl font-extrabold text-slate-900">{project.name}</h1>
              {project.description && <p className="mt-1 text-sm text-slate-500">{project.description}</p>}
            </div>

            <div className="mb-6 space-y-1 rounded-xl bg-slate-50 p-4 text-sm text-slate-500">
              <p>
                Max file size: <span className="font-medium text-slate-800">{formatFileSize(project.maxFileSizeBytes)}</span>
              </p>
              <p>
                Link expires: <span className="font-medium text-slate-800">{new Date(project.expiresAt).toLocaleString()}</span>
              </p>
              <p>
                Files uploaded: <span className="font-medium text-slate-800">{fileCount}</span>
              </p>
            </div>

            <div
              className={`mb-4 cursor-pointer rounded-2xl border-2 border-dashed border-slate-300 p-8 text-center transition hover:border-brand-400 ${dragging ? "drop-zone-active" : ""}`}
              onClick={() => inputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={async (e) => {
                e.preventDefault();
                setDragging(false);
                await addDropped(e.dataTransfer);
              }}
            >
              <UploadCloud className="mx-auto mb-3 h-10 w-10 text-brand-500" />
              <p className="text-slate-600">Drop files or folders here</p>
              <p className="mt-1 text-sm text-slate-400">Subfolders within a dropped folder are preserved</p>
              <div className="mt-4 flex flex-wrap justify-center gap-3">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    inputRef.current?.click();
                  }}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
                >
                  <Doc className="h-4 w-4" /> Select Files
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    folderRef.current?.click();
                  }}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
                >
                  <Folder className="h-4 w-4" /> Select Folder
                </button>
              </div>
              <input
                ref={inputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => e.target.files.length && addFiles(Array.from(e.target.files))}
              />
              <input
                ref={(el) => {
                  folderRef.current = el;
                  // Set the directory attributes imperatively so the folder
                  // picker works reliably across browsers.
                  if (el) {
                    el.setAttribute("webkitdirectory", "");
                    el.setAttribute("directory", "");
                    el.setAttribute("mozdirectory", "");
                  }
                }}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => e.target.files.length && addFiles(Array.from(e.target.files))}
              />
            </div>

            {selected.length > 0 && (
              <div className="mb-4">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm text-slate-500">Selected files:</p>
                  <button onClick={() => setSelected([])} className="text-xs text-slate-400 hover:text-slate-600">
                    Clear
                  </button>
                </div>
                <div className="max-h-48 space-y-2 overflow-y-auto">
                  {selected.map((file, i) => (
                    <div key={i} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                      <div className="min-w-0 flex-1 pr-2">
                        <p className="truncate text-sm text-slate-800">{relativePathOf(file) || file.name}</p>
                        <p className="text-xs text-slate-400">{formatFileSize(file.size)}</p>
                      </div>
                      <button
                        onClick={() => setSelected((s) => s.filter((_, idx) => idx !== i))}
                        className="text-slate-400 transition hover:text-rose-500"
                      >
                        <Close className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <p className="text-sm text-slate-500">
                    Total: <span className="text-slate-800">{formatFileSize(totalSize)}</span>
                  </p>
                  <button onClick={uploadAll} className="btn-primary py-2.5">
                    <UploadCloud className="h-4 w-4" />
                    Upload
                  </button>
                </div>
              </div>
            )}

            {progress && (
              <div className="rounded-xl bg-slate-50 p-4">
                <div className="mb-2 flex items-center justify-between">
                  <p className="mr-2 flex-1 truncate text-sm text-slate-700">{progress.name}</p>
                  <p className="text-sm font-medium text-brand-600">{progress.pct}%</p>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
                  <div
                    className="h-2 rounded-full bg-gradient-to-r from-brand-500 to-brand-600 transition-all"
                    style={{ width: `${progress.pct}%` }}
                  />
                </div>
                <div className="mt-1 flex justify-between text-xs text-slate-400">
                  <span>{progress.speed ? formatSpeed(progress.speed) : ""}</span>
                  <span>{progress.eta ? `ETA ${formatETA(progress.eta)}` : ""}</span>
                </div>
              </div>
            )}

            {uploaded.length > 0 && (
              <div className="mt-6">
                <h3 className="mb-2 text-sm font-medium text-slate-500">Uploaded files</h3>
                <div className="space-y-2">
                  {uploaded.map((f, i) => (
                    <div key={i} className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2">
                      <Check className="h-4 w-4 text-emerald-500" />
                      <span className="flex-1 truncate text-sm text-slate-800">{f.name}</span>
                      <span className="text-xs text-slate-400">{formatFileSize(f.size)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
