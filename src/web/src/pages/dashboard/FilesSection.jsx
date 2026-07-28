import { useState } from "react";
import {
  Folder,
  FolderPlus,
  Filter,
  Search,
  Pencil,
  Trash,
  Share,
  External,
} from "../../components/icons.jsx";
import { formatFileSize, formatDate } from "../../lib/format.js";
import {
  filterFiles,
  countActiveFilters,
  makeEmptyFilters,
  expiryBadge,
  downloadBadge,
} from "../../lib/fileFilters.js";
import { getSubfolders, folderFileCount } from "../../lib/folders.js";

function Breadcrumb({ currentFolder, onNavigate }) {
  if (currentFolder === "/") {
    return (
      <div className="mb-3 flex flex-wrap items-center gap-0 text-sm">
        <span className="flex items-center gap-1 text-slate-500">
          <Folder className="h-4 w-4" /> All Files
        </span>
      </div>
    );
  }
  const segments = currentFolder.split("/").filter(Boolean);
  let path = "";
  return (
    <div className="mb-3 flex flex-wrap items-center gap-0 text-sm">
      <button onClick={() => onNavigate("/")} className="flex items-center gap-1 text-brand-600 transition hover:text-brand-700">
        <Folder className="h-4 w-4" /> All Files
      </button>
      {segments.map((seg, i) => {
        path += "/" + seg;
        const isLast = i === segments.length - 1;
        const p = path;
        return (
          <span key={p} className="flex items-center">
            <span className="mx-1 text-slate-300">/</span>
            {isLast ? (
              <span className="text-slate-700">{seg}</span>
            ) : (
              <button onClick={() => onNavigate(p)} className="text-brand-600 transition hover:text-brand-700">
                {seg}
              </button>
            )}
          </span>
        );
      })}
    </div>
  );
}

function IconBtn({ onClick, title, hover, children }) {
  return (
    <button onClick={onClick} title={title} className={`p-2 text-slate-400 transition ${hover}`}>
      {children}
    </button>
  );
}

export default function FilesSection({
  allFiles,
  folders,
  currentFolder,
  filters,
  setFilters,
  onNavigate,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  onMoveFile,
  onEdit,
  onShare,
  onDelete,
}) {
  const [showFilters, setShowFilters] = useState(false);
  const set = (patch) => setFilters({ ...filters, ...patch });
  const activeCount = countActiveFilters(filters);
  const subfolders = getSubfolders(folders, currentFolder);
  const visible = filterFiles(allFiles, currentFolder, filters);

  const typeBtn = (key, label) =>
    `rounded-lg border px-3 py-1.5 text-sm transition ${
      filters.type === key
        ? "border-brand-200 bg-brand-100 text-brand-700"
        : "border-transparent bg-slate-100 text-slate-500 hover:bg-slate-200"
    }`;

  return (
    <div className="card overflow-hidden">
      <div className="border-b border-slate-100 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-semibold text-slate-900">
            <Folder className="h-5 w-5 text-brand-600" />
            Uploaded Files
          </h2>
          <div className="flex items-center gap-2">
            <button
              onClick={onCreateFolder}
              className="flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-sm text-amber-600 transition hover:bg-amber-100"
            >
              <FolderPlus className="h-4 w-4" /> New Folder
            </button>
            <button
              onClick={() => setShowFilters((s) => !s)}
              className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
            >
              <Filter className="h-4 w-4" />
              Filters
              {activeCount > 0 && (
                <span className="rounded-full bg-brand-600 px-1.5 py-0.5 text-xs text-white">{activeCount}</span>
              )}
            </button>
          </div>
        </div>

        <Breadcrumb currentFolder={currentFolder} onNavigate={onNavigate} />

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
          <input
            className="field pl-10"
            placeholder="Search files..."
            value={filters.search}
            onChange={(e) => set({ search: e.target.value })}
          />
        </div>

        {showFilters && (
          <div className="mt-4 space-y-4 rounded-xl bg-slate-50 p-4">
            <div>
              <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-slate-400">Upload Type</label>
              <div className="flex gap-2">
                <button onClick={() => set({ type: "all" })} className={typeBtn("all", "All")}>All</button>
                <button onClick={() => set({ type: "cdn" })} className={typeBtn("cdn")}>🌐 CDN</button>
                <button onClick={() => set({ type: "private" })} className={typeBtn("private")}>🔒 Private</button>
              </div>
            </div>
            <FilterSelect label="File Type" value={filters.fileType} onChange={(v) => set({ fileType: v })} options={[
              ["", "All types"], ["image", "🖼️ Images"], ["video", "🎬 Videos"], ["audio", "🎵 Audio"],
              ["document", "📄 Documents"], ["archive", "📦 Archives"], ["code", "💻 Code"], ["other", "📎 Other"],
            ]} />
            <FilterSelect label="File Size" value={filters.fileSize} onChange={(v) => set({ fileSize: v })} options={[
              ["", "Any size"], ["small", "Small (< 1 MB)"], ["medium", "Medium (1 - 100 MB)"],
              ["large", "Large (100 MB - 1 GB)"], ["huge", "Huge (> 1 GB)"],
            ]} />
            <FilterSelect label="Expiry Status" value={filters.expiry} onChange={(v) => set({ expiry: v })} options={[
              ["", "Any"], ["never", "Never expires (CDN)"], ["expiring-soon", "Expiring soon (< 24h)"],
              ["expiring-week", "Expiring this week"], ["expired", "Expired"],
            ]} />
            <FilterSelect label="Download Limit" value={filters.downloads} onChange={(v) => set({ downloads: v })} options={[
              ["", "Any"], ["unlimited", "Unlimited"], ["limited", "Has limit"], ["low", "Low remaining (< 3)"],
            ]} />
            <button onClick={() => setFilters(makeEmptyFilters())} className="w-full py-2 text-sm text-slate-500 transition hover:text-slate-800">
              Clear all filters
            </button>
          </div>
        )}
      </div>

      {activeCount > 0 && (
        <div className="border-b border-slate-100 bg-slate-50/60 px-4 py-2 text-sm text-slate-500">
          Showing {visible.length} of {allFiles.length} files
        </div>
      )}

      <div className="divide-y divide-slate-100">
        {subfolders.map((folder) => {
          const name = folder.split("/").filter(Boolean).pop();
          const count = folderFileCount(allFiles, folder);
          return (
            <div
              key={folder}
              className="flex cursor-pointer items-center justify-between p-4 transition hover:bg-brand-50/50"
              onClick={() => onNavigate(folder)}
            >
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-500">
                  <Folder className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="truncate font-medium text-slate-900">{name}</p>
                  <p className="text-sm text-slate-400">{count} file{count !== 1 ? "s" : ""}</p>
                </div>
              </div>
              <div className="ml-4 flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                <IconBtn onClick={() => onRenameFolder(folder)} title="Rename" hover="hover:text-brand-600">
                  <Pencil className="h-5 w-5" />
                </IconBtn>
                <IconBtn onClick={() => onDeleteFolder(folder)} title="Delete folder" hover="hover:text-rose-500">
                  <Trash className="h-5 w-5" />
                </IconBtn>
              </div>
            </div>
          );
        })}

        {visible.map((file) => {
          const expiry = expiryBadge(file);
          const dl = downloadBadge(file);
          return (
            <div key={file.id} className="flex items-center justify-between p-4 transition hover:bg-brand-50/50">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg ${file.uploadType === "cdn" ? "bg-emerald-100" : "bg-brand-100"}`}>
                  <span className="text-lg">{file.uploadType === "cdn" ? "🌐" : "🔒"}</span>
                </div>
                <div className="min-w-0">
                  <p className="truncate font-medium text-slate-900">{file.fileName}</p>
                  <p className="text-sm text-slate-400">
                    {formatFileSize(file.fileSize)} • {formatDate(file.createdAt)}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-2 text-xs">
                    {expiry && <span className={expiry.tone}>{expiry.text}</span>}
                    {dl && <span className={dl.tone}>{dl.text}</span>}
                  </div>
                </div>
              </div>
              <div className="ml-4 flex items-center gap-1">
                <span className={`rounded-lg px-2.5 py-1 text-xs font-medium ${file.uploadType === "cdn" ? "bg-emerald-100 text-emerald-600" : "bg-brand-100 text-brand-600"}`}>
                  {file.uploadType === "cdn" ? "CDN" : "Private"}
                </span>
                <span className={`hidden rounded-lg px-2.5 py-1 text-xs font-medium sm:inline ${file.status === "uploaded" ? "bg-emerald-100 text-emerald-600" : "bg-amber-100 text-amber-600"}`}>
                  {file.status}
                </span>
                <IconBtn onClick={() => onMoveFile(file)} title="Move to folder" hover="hover:text-amber-500">
                  <Folder className="h-5 w-5" />
                </IconBtn>
                {file.uploadType === "cdn" && file.cdnUrl && (
                  <IconBtn onClick={() => window.open(file.cdnUrl, "_blank")} title="Open in New Tab" hover="hover:text-emerald-500">
                    <External className="h-5 w-5" />
                  </IconBtn>
                )}
                {file.uploadType === "private" && (
                  <IconBtn onClick={() => onEdit(file)} title="Edit" hover="hover:text-brand-600">
                    <Pencil className="h-5 w-5" />
                  </IconBtn>
                )}
                <IconBtn onClick={() => onShare(file)} title="Share" hover="hover:text-brand-600">
                  <Share className="h-5 w-5" />
                </IconBtn>
                <IconBtn onClick={() => onDelete(file)} title="Delete" hover="hover:text-rose-500">
                  <Trash className="h-5 w-5" />
                </IconBtn>
              </div>
            </div>
          );
        })}
      </div>

      {allFiles.length === 0 && (
        <EmptyState icon={<Folder className="h-8 w-8 text-slate-300" />} text="No files uploaded yet" />
      )}
      {allFiles.length > 0 && visible.length === 0 && subfolders.length === 0 && (
        <EmptyState icon={<Search className="h-8 w-8 text-slate-300" />} text="No files match your filters">
          <button onClick={() => setFilters(makeEmptyFilters())} className="mt-2 text-sm text-brand-600 hover:text-brand-700">
            Clear filters
          </button>
        </EmptyState>
      )}
    </div>
  );
}

function FilterSelect({ label, value, onChange, options }) {
  return (
    <div>
      <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-slate-400">{label}</label>
      <select className="field" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </div>
  );
}

function EmptyState({ icon, text, children }) {
  return (
    <div className="p-12 text-center text-slate-400">
      <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100">{icon}</div>
      <p>{text}</p>
      {children}
    </div>
  );
}
