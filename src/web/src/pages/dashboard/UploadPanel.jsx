import { useRef, useState } from "react";
import ExpirySelector from "../../components/ExpirySelector.jsx";
import { UploadCloud, Close } from "../../components/icons.jsx";
import { formatFileSize, formatSpeed, formatETA } from "../../lib/format.js";

async function filesFromDataTransfer(items) {
  const files = [];
  async function traverse(entry) {
    if (entry.isFile) {
      await new Promise((resolve) => entry.file((f) => (files.push(f), resolve())));
    } else if (entry.isDirectory) {
      const reader = entry.createReader();
      await new Promise((resolve) =>
        reader.readEntries(async (entries) => {
          for (const e of entries) await traverse(e);
          resolve();
        })
      );
    }
  }
  for (let i = 0; i < items.length; i++) {
    const entry = items[i].webkitGetAsEntry?.();
    if (entry) await traverse(entry);
  }
  return files;
}

export default function UploadPanel({ onStartUpload, progress }) {
  const [selected, setSelected] = useState([]);
  const [type, setType] = useState("cdn");
  const [expiry, setExpiry] = useState({ mode: "preset", preset: "86400", datetime: "" });
  const [maxDownloads, setMaxDownloads] = useState("");
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef(null);
  const folderRef = useRef(null);

  function select(files) {
    if (!files.length) return;
    setSelected(files);
    setType("cdn");
  }

  function clear() {
    setSelected([]);
    if (fileRef.current) fileRef.current.value = "";
    if (folderRef.current) folderRef.current.value = "";
  }

  function start() {
    const opts = { uploadType: type };
    if (type === "private") {
      if (expiry.mode === "preset") opts.expiresInSeconds = parseInt(expiry.preset, 10);
      else opts.expiresAt = expiry.datetime;
      if (maxDownloads) opts.maxDownloads = parseInt(maxDownloads, 10);
    }
    onStartUpload(selected, opts);
    clear();
  }

  const totalSize = selected.reduce((s, f) => s + f.size, 0);
  const busy = !!progress;

  return (
    <div className="card mb-6 p-6">
      {selected.length === 0 && !busy && (
        <div
          className={`cursor-pointer rounded-2xl border-2 border-dashed border-slate-300 p-8 text-center transition hover:border-brand-400 hover:bg-brand-50/40 ${dragging ? "drop-zone-active" : ""}`}
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={async (e) => {
            e.preventDefault();
            setDragging(false);
            if (e.dataTransfer.items) {
              const files = await filesFromDataTransfer(e.dataTransfer.items);
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
          <div className="flex justify-center gap-3">
            <button
              onClick={(e) => {
                e.stopPropagation();
                fileRef.current?.click();
              }}
              className="rounded-lg border border-brand-200 bg-brand-50 px-4 py-2 text-sm font-medium text-brand-600 transition hover:bg-brand-100"
            >
              📄 Select Files
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                folderRef.current?.click();
              }}
              className="rounded-lg border border-violet-200 bg-violet-50 px-4 py-2 text-sm font-medium text-violet-600 transition hover:bg-violet-100"
            >
              📁 Select Folder
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
            ref={folderRef}
            type="file"
            webkitdirectory=""
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
            <label className="label">Upload Type</label>
            <div className="grid grid-cols-2 gap-4">
              <TypeCard
                active={type === "cdn"}
                onClick={() => setType("cdn")}
                emoji="🌐"
                emojiBg="bg-emerald-100"
                title="CDN"
                desc="Public permanent URL via CloudFront. Anyone with the link can download."
              />
              <TypeCard
                active={type === "private"}
                onClick={() => setType("private")}
                emoji="🔒"
                emojiBg="bg-brand-100"
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

function TypeCard({ active, onClick, emoji, emojiBg, title, desc }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border-2 p-4 text-left transition ${
        active
          ? "border-brand-500 bg-brand-50 shadow-[0_8px_25px_-10px_rgba(37,99,235,0.4)]"
          : "border-slate-200 bg-white hover:border-slate-300"
      }`}
    >
      <div className="mb-2 flex items-center gap-3">
        <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${emojiBg}`}>
          <span className="text-xl">{emoji}</span>
        </div>
        <span className="font-semibold text-slate-900">{title}</span>
      </div>
      <p className="text-xs text-slate-500">{desc}</p>
    </button>
  );
}
