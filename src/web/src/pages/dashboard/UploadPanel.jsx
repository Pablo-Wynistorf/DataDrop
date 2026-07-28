import { useRef, useState } from "react";
import ExpirySelector from "../../components/ExpirySelector.jsx";
import { UploadCloud, Close, Doc, Folder, Globe, Lock } from "../../components/icons.jsx";
import { formatFileSize, formatSpeed, formatETA } from "../../lib/format.js";

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

async function filesFromDataTransfer(items) {
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
      // The drop API doesn't set webkitRelativePath, so record the path
      // ourselves; computeFolderPath falls back to this.
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

// Combine a base folder with an optional new subfolder/path the user typed.
function resolveDestFolder(base, newFolder) {
  const nf = (newFolder || "").trim();
  if (!nf) return base || "/";
  const segments = nf.replace(/\\/g, "/").split("/").filter(Boolean);
  if (!segments.length) return base || "/";
  // A leading slash means an absolute path from root; otherwise append to base.
  if (nf.startsWith("/") || !base || base === "/") return "/" + segments.join("/");
  return base + "/" + segments.join("/");
}

function folderLabel(f) {
  return f === "/" ? "Home (/)" : f;
}

export default function UploadPanel({ onStartUpload, progress, folders = ["/"], currentFolder = "/" }) {
  const [selected, setSelected] = useState([]);
  const [type, setType] = useState("cdn");
  const [expiry, setExpiry] = useState({ mode: "preset", preset: "86400", datetime: "" });
  const [maxDownloads, setMaxDownloads] = useState("");
  const [destFolder, setDestFolder] = useState(currentFolder);
  const [newFolder, setNewFolder] = useState("");
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef(null);
  const folderRef = useRef(null);

  function select(files) {
    if (!files.length) return;
    setSelected(files);
    setType("cdn");
    // Default the destination to the folder the user is currently viewing.
    setDestFolder(currentFolder);
    setNewFolder("");
  }

  function clear() {
    setSelected([]);
    setNewFolder("");
    if (fileRef.current) fileRef.current.value = "";
    if (folderRef.current) folderRef.current.value = "";
  }

  function start() {
    const opts = { uploadType: type, destFolder: resolveDestFolder(destFolder, newFolder) };
    if (type === "private") {
      if (expiry.mode === "preset") opts.expiresInSeconds = parseInt(expiry.preset, 10);
      else opts.expiresAt = expiry.datetime;
      if (maxDownloads) opts.maxDownloads = parseInt(maxDownloads, 10);
    }
    onStartUpload(selected, opts);
    clear();
  }

  // Ensure the currently selected destination is always an option.
  const folderOptions = folders.includes(destFolder) ? folders : [...folders, destFolder].sort();

  const totalSize = selected.reduce((s, f) => s + f.size, 0);
  const busy = !!progress;

  return (
    <div className="card mb-6 p-6">
      {selected.length === 0 && !busy && (
        <div
          className={`cursor-pointer rounded-2xl border-2 border-dashed border-slate-300 p-8 text-center transition-colors hover:border-brand-400 ${dragging ? "drop-zone-active" : ""}`}
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={async (e) => {
            e.preventDefault();
            setDragging(false);
            // Prefer the items API (supports folders); fall back to plain files.
            const items = e.dataTransfer.items;
            const supportsEntries =
              items && items.length && typeof items[0].webkitGetAsEntry === "function";
            if (supportsEntries) {
              const files = await filesFromDataTransfer(items);
              if (files.length) select(files);
            } else if (e.dataTransfer.files.length) {
              select(Array.from(e.dataTransfer.files));
            }
          }}
        >
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-50 text-brand-500">
            <UploadCloud className="h-8 w-8" />
          </div>
          <p className="mb-3 text-slate-500">Drag &amp; drop files or folders here</p>
          <div className="flex flex-wrap justify-center gap-3">
            <button
              onClick={(e) => {
                e.stopPropagation();
                fileRef.current?.click();
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
            ref={fileRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => select(Array.from(e.target.files))}
          />
          <input
            ref={(el) => {
              folderRef.current = el;
              // Set the directory attributes imperatively so the folder picker
              // works reliably across browsers (React doesn't type these props).
              if (el) {
                el.setAttribute("webkitdirectory", "");
                el.setAttribute("directory", "");
                el.setAttribute("mozdirectory", "");
              }
            }}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => select(Array.from(e.target.files))}
          />
        </div>
      )}

      {selected.length > 0 && !busy && (
        <div>
          <div className="mb-4 flex items-center justify-between rounded-xl bg-slate-50 p-4">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-brand-100 text-brand-600">
                <UploadCloud className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="truncate font-medium text-slate-900">
                  {selected.length === 1 ? selected[0].name : `${selected.length} files selected`}
                </p>
                <p className="text-sm text-slate-400">
                  {selected.length === 1 ? formatFileSize(selected[0].size) : `Total: ${formatFileSize(totalSize)}`}
                </p>
              </div>
            </div>
            <button onClick={clear} className="p-2 text-slate-400 transition hover:text-slate-700">
              <Close className="h-5 w-5" />
            </button>
          </div>

          <div className="mb-4">
            <label className="label">Destination Folder</label>
            <div className="flex items-center gap-2">
              <Folder className="h-4 w-4 flex-shrink-0 text-slate-400" />
              <select
                className="field"
                value={destFolder}
                onChange={(e) => setDestFolder(e.target.value)}
              >
                {folderOptions.map((f) => (
                  <option key={f} value={f}>
                    {folderLabel(f)}
                  </option>
                ))}
              </select>
            </div>
            <input
              type="text"
              placeholder="Or type a new folder (e.g. reports/q1)"
              className="field mt-2"
              value={newFolder}
              onChange={(e) => setNewFolder(e.target.value)}
            />
            <p className="mt-1 text-xs text-slate-400">
              Files upload to{" "}
              <span className="font-medium text-slate-500">{folderLabel(resolveDestFolder(destFolder, newFolder))}</span>
              {selected.some((f) => f.webkitRelativePath || f.relativePathOverride)
                ? " (subfolders within the selection are preserved)"
                : ""}
            </p>
          </div>

          <div className="mb-4">
            <label className="label">Upload Type</label>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
              <TypeCard
                active={type === "cdn"}
                onClick={() => setType("cdn")}
                icon={<Globe className="h-5 w-5 text-emerald-600" />}
                iconBg="bg-emerald-100"
                title="CDN"
                desc="Public permanent URL via CloudFront. Anyone with the link can download."
              />
              <TypeCard
                active={type === "private"}
                onClick={() => setType("private")}
                icon={<Lock className="h-5 w-5 text-brand-600" />}
                iconBg="bg-brand-100"
                title="Private"
                desc="Time-limited share links. Control access and expiration."
              />
            </div>
          </div>

          {type === "private" && (
            <div className="mb-4 space-y-4 rounded-xl bg-slate-50 p-4">
              <ExpirySelector label="File Expiry" value={expiry} onChange={setExpiry} />
              <div>
                <label className="label">Max Downloads (optional)</label>
                <input
                  type="number"
                  min="1"
                  placeholder="Unlimited"
                  className="field"
                  value={maxDownloads}
                  onChange={(e) => setMaxDownloads(e.target.value)}
                />
                <p className="mt-1 text-xs text-slate-400">File auto-deletes after this many downloads</p>
              </div>
            </div>
          )}

          <button onClick={start} className="btn-primary w-full py-3">
            Upload {selected.length > 1 ? `${selected.length} Files` : "File"}
          </button>
        </div>
      )}

      {busy && (
        <div>
          <div className="mb-2 flex flex-col justify-between gap-1 text-sm text-slate-500 sm:flex-row">
            <span className="truncate">{progress.name}</span>
            <div className="flex gap-3 text-xs sm:text-sm">
              {progress.speed ? <span className="text-brand-600">{formatSpeed(progress.speed)}</span> : null}
              {progress.detail ? <span className="text-slate-400">{progress.detail}</span> : null}
              {progress.eta ? <span className="text-slate-400">ETA {formatETA(progress.eta)}</span> : null}
              <span>{progress.pct}%</span>
            </div>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-2 rounded-full bg-gradient-to-r from-brand-500 to-brand-600 transition-all"
              style={{ width: `${progress.pct}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function TypeCard({ active, onClick, icon, iconBg, title, desc }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border-2 p-4 text-left transition-colors ${
        active ? "border-brand-500 bg-brand-50" : "border-slate-200 bg-white hover:border-slate-300"
      }`}
    >
      <div className="mb-2 flex items-center gap-3">
        <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${iconBg}`}>{icon}</div>
        <span className="font-semibold text-slate-900">{title}</span>
      </div>
      <p className="text-xs text-slate-500">{desc}</p>
    </button>
  );
}
