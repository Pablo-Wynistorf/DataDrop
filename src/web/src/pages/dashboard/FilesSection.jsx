import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Folder,
  FolderPlus,
  Filter,
  Search,
  Pencil,
  Trash,
  Share,
  External,
  Globe,
  Lock,
  Swap,
  More,
  ChevronDown,
  ChevronUp,
  Clock,
  Download,
  Refresh,
} from "../../components/icons.jsx";
import FileIcon from "../../components/FileIcon.jsx";
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
      <div className="flex flex-wrap items-center gap-0 text-sm">
        <span className="flex items-center gap-1.5 font-medium text-slate-700">
          <Folder className="h-4 w-4 text-brand-500" /> My files
        </span>
      </div>
    );
  }
  const segments = currentFolder.split("/").filter(Boolean);
  let path = "";
  return (
    <div className="flex flex-wrap items-center gap-0 text-sm">
      <button onClick={() => onNavigate("/")} className="flex items-center gap-1.5 text-brand-600 transition hover:text-brand-700">
        <Folder className="h-4 w-4" /> My files
      </button>
      {segments.map((seg, i) => {
        path += "/" + seg;
        const isLast = i === segments.length - 1;
        const p = path;
        return (
          <span key={p} className="flex items-center">
            <span className="mx-1.5 text-slate-300">/</span>
            {isLast ? (
              <span className="font-medium text-slate-700">{seg}</span>
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

// An overflow menu of row actions. The dropdown is rendered in a portal with
// fixed positioning so it is never clipped by the card's overflow-hidden, and
// it flips upward when there isn't room below.
const MENU_WIDTH = 192; // w-48
const MENU_ITEM_HEIGHT = 40;

function RowMenu({ items }) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const btnRef = useRef(null);
  const menuRef = useRef(null);

  const position = () => {
    if (!btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    const estHeight = items.length * MENU_ITEM_HEIGHT + 8;
    const spaceBelow = window.innerHeight - r.bottom;
    const top = spaceBelow < estHeight + 8 ? Math.max(8, r.top - 4 - estHeight) : r.bottom + 4;
    const left = Math.min(Math.max(8, r.right - MENU_WIDTH), window.innerWidth - MENU_WIDTH - 8);
    setCoords({ top, left });
  };

  useLayoutEffect(() => {
    if (open) position();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (
        btnRef.current && !btnRef.current.contains(e.target) &&
        menuRef.current && !menuRef.current.contains(e.target)
      ) {
        setOpen(false);
      }
    };
    const close = () => setOpen(false);
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  return (
    <>
      <button
        ref={btnRef}
        onClick={() => setOpen((o) => !o)}
        title="More actions"
        className={`rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 ${open ? "bg-slate-100 text-slate-700" : ""}`}
      >
        <More className="h-5 w-5" />
      </button>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            style={{ position: "fixed", top: coords.top, left: coords.left, width: MENU_WIDTH }}
            className="z-50 overflow-hidden rounded-xl border border-slate-100 bg-white py-1 shadow-lg ring-1 ring-slate-900/5"
          >
            {items.map((it) => (
              <button
                key={it.label}
                onClick={() => {
                  setOpen(false);
                  it.onClick();
                }}
                className={`flex w-full items-center gap-3 px-4 py-2 text-left text-sm transition-colors hover:bg-slate-50 ${
                  it.danger ? "text-rose-600 hover:bg-rose-50" : "text-slate-700"
                }`}
              >
                <span className={it.danger ? "text-rose-500" : "text-slate-400"}>{it.icon}</span>
                {it.label}
              </button>
            ))}
          </div>,
          document.body
        )}
    </>
  );
}

// The filter panel rendered as a floating popover. It is anchored to the
// Filter button and rendered in a portal with fixed positioning so it overlays
// the content instead of pushing it down, and is never clipped by the card's
// overflow-hidden. It flips/pins to stay within the viewport.
const FILTER_WIDTH = 320;

function FilterPopover({ anchorRef, onClose, children }) {
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const panelRef = useRef(null);

  useLayoutEffect(() => {
    if (!anchorRef.current) return;
    const r = anchorRef.current.getBoundingClientRect();
    const left = Math.min(
      Math.max(8, r.right - FILTER_WIDTH),
      window.innerWidth - FILTER_WIDTH - 8
    );
    setCoords({ top: r.bottom + 8, left });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onDoc = (e) => {
      if (
        anchorRef.current && !anchorRef.current.contains(e.target) &&
        panelRef.current && !panelRef.current.contains(e.target)
      ) {
        onClose();
      }
    };
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onClose);
    window.addEventListener("scroll", onClose, true);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onClose);
      window.removeEventListener("scroll", onClose, true);
    };
  }, [anchorRef, onClose]);

  return createPortal(
    <div
      ref={panelRef}
      style={{ position: "fixed", top: coords.top, left: coords.left, width: FILTER_WIDTH }}
      className="z-50 max-h-[80vh] space-y-4 overflow-y-auto rounded-2xl border border-slate-100 bg-white p-4 shadow-xl ring-1 ring-slate-900/5"
    >
      {children}
    </div>,
    document.body
  );
}

function SortHeader({ label, active, dir, onClick, className = "" }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1 text-left transition hover:text-slate-700 ${active ? "text-slate-700" : "text-slate-400"} ${className}`}
    >
      {label}
      {active && (dir === "asc" ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />)}
    </button>
  );
}

function sortFiles(files, sortBy, dir) {
  const mul = dir === "asc" ? 1 : -1;
  return [...files].sort((a, b) => {
    let cmp = 0;
    if (sortBy === "size") cmp = (a.fileSize || 0) - (b.fileSize || 0);
    else if (sortBy === "modified") cmp = new Date(a.createdAt) - new Date(b.createdAt);
    else cmp = a.fileName.localeCompare(b.fileName, undefined, { sensitivity: "base" });
    if (cmp === 0) cmp = a.fileName.localeCompare(b.fileName, undefined, { sensitivity: "base" });
    return cmp * mul;
  });
}

export default function FilesSection({
  allFiles,
  folders,
  currentFolder,
  filters,
  setFilters,
  onNavigate,
  onRefresh,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  onMoveFile,
  onEdit,
  onOpen,
  onDownload,
  onShare,
  onConvert,
  onDelete,
}) {
  const [showFilters, setShowFilters] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const filterBtnRef = useRef(null);
  const [sort, setSort] = useState({ by: "name", dir: "asc" });
  const set = (patch) => setFilters({ ...filters, ...patch });
  const activeCount = countActiveFilters(filters);
  const subfolders = getSubfolders(folders, currentFolder);
  const visible = sortFiles(filterFiles(allFiles, currentFolder, filters), sort.by, sort.dir);
  const sortedFolders = [...subfolders].sort((a, b) =>
    (sort.by === "name" && sort.dir === "desc" ? -1 : 1) * a.localeCompare(b)
  );

  const toggleSort = (by) =>
    setSort((s) => (s.by === by ? { by, dir: s.dir === "asc" ? "desc" : "asc" } : { by, dir: "asc" }));

  const handleRefresh = async () => {
    if (refreshing || !onRefresh) return;
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  };

  const typeBtn = (key) =>
    `rounded-lg border px-3 py-1.5 text-sm transition ${
      filters.type === key
        ? "border-brand-200 bg-brand-100 text-brand-700"
        : "border-transparent bg-slate-100 text-slate-500 hover:bg-slate-200"
    }`;

  const hasRows = sortedFolders.length > 0 || visible.length > 0;

  return (
    <div className="card overflow-hidden">
      {/* Toolbar */}
      <div className="border-b border-slate-100 p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            <Breadcrumb currentFolder={currentFolder} onNavigate={onNavigate} />
          </div>
          <div className="flex flex-shrink-0 items-center gap-1">
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 disabled:opacity-60"
              title="Refresh"
            >
              <Refresh className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
              <span className="hidden sm:inline">Refresh</span>
            </button>
            <button
              onClick={onCreateFolder}
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
              title="New folder"
            >
              <FolderPlus className="h-4 w-4" />
              <span className="hidden sm:inline">New folder</span>
            </button>
            <button
              ref={filterBtnRef}
              onClick={() => setShowFilters((s) => !s)}
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium transition hover:bg-slate-100 ${
                showFilters || activeCount > 0 ? "text-brand-600" : "text-slate-600 hover:text-slate-900"
              } ${showFilters ? "bg-brand-50" : ""}`}
              title="Filter"
            >
              <Filter className="h-4 w-4" />
              <span className="hidden sm:inline">Filter</span>
              {activeCount > 0 && (
                <span className="rounded-full bg-brand-600 px-1.5 py-0.5 text-xs text-white">{activeCount}</span>
              )}
            </button>
          </div>
        </div>

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
          <FilterPopover anchorRef={filterBtnRef} onClose={() => setShowFilters(false)}>
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-slate-700">Filters</span>
              {activeCount > 0 && (
                <span className="rounded-full bg-brand-100 px-2 py-0.5 text-xs font-medium text-brand-700">
                  {activeCount} active
                </span>
              )}
            </div>
            <div>
              <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-slate-400">Upload Type</label>
              <div className="flex gap-2">
                <button onClick={() => set({ type: "all" })} className={typeBtn("all")}>All</button>
                <button onClick={() => set({ type: "cdn" })} className={typeBtn("cdn")}>CDN</button>
                <button onClick={() => set({ type: "private" })} className={typeBtn("private")}>Private</button>
              </div>
            </div>
            <FilterSelect label="File Type" value={filters.fileType} onChange={(v) => set({ fileType: v })} options={[
              ["", "All types"], ["image", "Images"], ["video", "Videos"], ["audio", "Audio"],
              ["document", "Documents"], ["archive", "Archives"], ["code", "Code"], ["other", "Other"],
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
          </FilterPopover>
        )}
      </div>

      {activeCount > 0 && (
        <div className="border-b border-slate-100 bg-slate-50/60 px-4 py-2 text-sm text-slate-500">
          Showing {visible.length} of {allFiles.length} files
        </div>
      )}

      {/* Column header */}
      {hasRows && (
        <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-2 text-xs font-medium uppercase tracking-wide">
          <div className="w-10 flex-shrink-0" />
          <SortHeader
            label="Name"
            active={sort.by === "name"}
            dir={sort.dir}
            onClick={() => toggleSort("name")}
            className="min-w-0 flex-1"
          />
          <div className="hidden w-36 flex-shrink-0 text-slate-400 md:block">Sharing</div>
          <SortHeader
            label="Modified"
            active={sort.by === "modified"}
            dir={sort.dir}
            onClick={() => toggleSort("modified")}
            className="hidden w-28 flex-shrink-0 md:flex"
          />
          <SortHeader
            label="Size"
            active={sort.by === "size"}
            dir={sort.dir}
            onClick={() => toggleSort("size")}
            className="hidden w-20 flex-shrink-0 justify-end text-right sm:flex"
          />
          <div className="w-9 flex-shrink-0" />
        </div>
      )}

      <div className="divide-y divide-slate-100">
        {sortedFolders.map((folder) => {
          const name = folder.split("/").filter(Boolean).pop();
          const count = folderFileCount(allFiles, folder);
          return (
            <div
              key={folder}
              className="group flex cursor-pointer items-center gap-3 px-4 py-2.5 transition hover:bg-brand-50/50"
              onClick={() => onNavigate(folder)}
            >
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-500">
                <Folder className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-slate-900">{name}</p>
                <p className="text-xs text-slate-400 md:hidden">{count} file{count !== 1 ? "s" : ""}</p>
              </div>
              <div className="hidden w-36 flex-shrink-0 text-sm text-slate-400 md:block">
                {count} item{count !== 1 ? "s" : ""}
              </div>
              <div className="hidden w-28 flex-shrink-0 text-sm text-slate-400 md:block">—</div>
              <div className="hidden w-20 flex-shrink-0 text-right text-sm text-slate-400 sm:block">—</div>
              <div className="w-9 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                <RowMenu
                  items={[
                    { label: "Rename", icon: <Pencil className="h-4 w-4" />, onClick: () => onRenameFolder(folder) },
                    { label: "Delete", icon: <Trash className="h-4 w-4" />, onClick: () => onDeleteFolder(folder), danger: true },
                  ]}
                />
              </div>
            </div>
          );
        })}

        {visible.map((file) => {
          const expiry = expiryBadge(file);
          const dl = downloadBadge(file);
          const isCdn = file.uploadType === "cdn";
          const menuItems = [];
          if (isCdn && file.cdnUrl)
            menuItems.push({ label: "Open in new tab", icon: <External className="h-4 w-4" />, onClick: () => window.open(file.cdnUrl, "_blank") });
          if (!isCdn)
            menuItems.push({ label: "Edit settings", icon: <Pencil className="h-4 w-4" />, onClick: () => onEdit(file) });
          if (file.status === "uploaded" || file.status === "ready")
            menuItems.push({ label: "Download", icon: <Download className="h-4 w-4" />, onClick: () => onDownload(file) });
          menuItems.push({ label: "Share", icon: <Share className="h-4 w-4" />, onClick: () => onShare(file) });
          menuItems.push({ label: "Move to folder", icon: <Folder className="h-4 w-4" />, onClick: () => onMoveFile(file) });
          menuItems.push({
            label: isCdn ? "Convert to private" : "Convert to CDN",
            icon: <Swap className="h-4 w-4" />,
            onClick: () => onConvert(file),
          });
          menuItems.push({ label: "Delete", icon: <Trash className="h-4 w-4" />, onClick: () => onDelete(file), danger: true });

          return (
            <div key={file.id} className="group flex items-center gap-3 px-4 py-2.5 transition hover:bg-brand-50/50">
              <FileIcon file={file} className="h-10 w-10" />

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onOpen(file)}
                    title="Open in new tab"
                    className="truncate text-left font-medium text-slate-900 transition hover:text-brand-600 hover:underline"
                  >
                    {file.fileName}
                  </button>
                  {file.status !== "uploaded" && (
                    <span className="flex-shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-600">
                      {file.status}
                    </span>
                  )}
                </div>
                {/* Compact meta shown on small screens where columns are hidden */}
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-400 sm:hidden">
                  <span>{formatFileSize(file.fileSize)}</span>
                  <span>•</span>
                  <span>{formatDate(file.createdAt)}</span>
                </div>
                {(expiry || dl) && (
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
                    {expiry && (
                      <span className={`flex items-center gap-1 ${expiry.tone}`}>
                        <Clock className="h-3 w-3" /> {stripEmoji(expiry.text)}
                      </span>
                    )}
                    {dl && (
                      <span className={`flex items-center gap-1 ${dl.tone}`}>
                        <Download className="h-3 w-3" /> {stripEmoji(dl.text)}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Sharing column */}
              <div className="hidden w-36 flex-shrink-0 md:block">
                {isCdn ? (
                  <span className="inline-flex items-center gap-1.5 text-sm text-emerald-600">
                    <Globe className="h-4 w-4" /> Public link
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-sm text-slate-500">
                    <Lock className="h-4 w-4" /> Private
                  </span>
                )}
              </div>

              {/* Modified column */}
              <div className="hidden w-28 flex-shrink-0 text-sm text-slate-500 md:block">
                {formatDate(file.createdAt)}
              </div>

              {/* Size column */}
              <div className="hidden w-20 flex-shrink-0 text-right text-sm text-slate-500 sm:block">
                {formatFileSize(file.fileSize)}
              </div>

              <div className="w-9 flex-shrink-0">
                <RowMenu items={menuItems} />
              </div>
            </div>
          );
        })}
      </div>

      {allFiles.length === 0 && (
        <EmptyState icon={<Folder className="h-8 w-8 text-slate-300" />} text="No files uploaded yet" />
      )}
      {allFiles.length > 0 && visible.length === 0 && sortedFolders.length === 0 && (
        <EmptyState icon={<Search className="h-8 w-8 text-slate-300" />} text="No files match your filters">
          <button onClick={() => setFilters(makeEmptyFilters())} className="mt-2 text-sm text-brand-600 hover:text-brand-700">
            Clear filters
          </button>
        </EmptyState>
      )}
    </div>
  );
}

// The shared badge helpers prefix an emoji; the table uses real icons instead.
function stripEmoji(text) {
  return text.replace(/^[^\w]+/, "").trim();
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
