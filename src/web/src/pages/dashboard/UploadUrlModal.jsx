import { useCallback, useEffect, useState } from "react";
import Modal, { ConfirmDialog } from "../../components/Modal.jsx";
import { Link, Copy, Trash } from "../../components/icons.jsx";
import { apiFetch, jsonBody } from "../../lib/api.js";
import { formatFileSize } from "../../lib/format.js";

const EMPTY_FORM = { name: "", maxSize: 100, expiry: "604800", description: "" };

export default function UploadUrlModal({ onClose, toast }) {
  const [tab, setTab] = useState("active"); // active | create
  const [projects, setProjects] = useState(null); // null = loading
  const [form, setForm] = useState(EMPTY_FORM);
  const [result, setResult] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const load = useCallback(async () => {
    const { res, data } = await apiFetch("/upload-urls");
    setProjects(res.ok && data ? data.projects || [] : []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function uploadLink(p) {
    return `${window.location.origin}/upload?token=${p.token}`;
  }

  function copy(text, label) {
    navigator.clipboard
      .writeText(text)
      .then(() => toast(`${label} copied to clipboard!`, "success"))
      .catch(() => toast("Failed to copy", "error"));
  }

  async function create() {
    if (!form.name.trim()) {
      toast("Project name is required", "error");
      return;
    }
    const { res, data } = await apiFetch("/upload-urls", {
      method: "POST",
      ...jsonBody({
        name: form.name.trim(),
        maxFileSizeMB: parseInt(form.maxSize) || 100,
        expiresInSeconds: parseInt(form.expiry) || 604800,
        description: form.description.trim(),
      }),
    });
    if (!res.ok) {
      toast(data?.error || "Failed to create upload URL", "error");
      return;
    }
    setResult({
      url: data.uploadUrl,
      expires: `Expires: ${new Date(data.expiresAt).toLocaleString()}`,
      max: `Max file size: ${data.maxFileSizeMB} MB - Folder: /${data.name}`,
    });
    toast("Upload URL created", "success");
    load();
  }

  async function confirmDelete() {
    const p = pendingDelete;
    setPendingDelete(null);
    const { res, data } = await apiFetch(`/upload-urls/${p.id}`, { method: "DELETE" });
    if (res.ok) {
      toast("Upload URL cancelled", "success");
      setProjects((list) => (list || []).filter((x) => x.id !== p.id));
    } else {
      toast(data?.error || "Failed to cancel upload URL", "error");
    }
  }

  const tabBtn = (key, label) =>
    `flex-1 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
      tab === key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
    }`;

  return (
    <Modal open onClose={onClose} title="Upload URLs" icon={<Link className="h-5 w-5 text-brand-600" />}>
      <div className="mb-4 flex gap-1 rounded-xl bg-slate-100 p-1">
        <button
          className={tabBtn("active")}
          onClick={() => {
            setTab("active");
            setResult(null);
          }}
        >
          Active links
        </button>
        <button className={tabBtn("create")} onClick={() => setTab("create")}>
          Create new
        </button>
      </div>

      {tab === "active" && (
        <div>
          {projects === null && (
            <div className="py-10 text-center">
              <div className="spinner mx-auto h-8 w-8" />
            </div>
          )}
          {projects && projects.length === 0 && (
            <p className="py-10 text-center text-sm text-slate-400">No active upload URLs.</p>
          )}
          {projects && projects.length > 0 && (
            <div className="space-y-3">
              {projects.map((p) => (
                <div key={p.id} className="rounded-xl border border-slate-200 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="truncate font-medium text-slate-900">{p.name}</p>
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                            p.isExpired ? "bg-rose-100 text-rose-600" : "bg-emerald-100 text-emerald-600"
                          }`}
                        >
                          {p.isExpired ? "expired" : "active"}
                        </span>
                      </div>
                      {p.description && <p className="mt-0.5 truncate text-xs text-slate-400">{p.description}</p>}
                      <p className="mt-1 text-xs text-slate-400">
                        {p.fileCount} file{p.fileCount !== 1 ? "s" : ""} - {formatFileSize(p.totalSize || 0)} - max{" "}
                        {formatFileSize(p.maxFileSizeBytes)}
                      </p>
                      <p className="text-xs text-slate-400">Expires: {new Date(p.expiresAt).toLocaleString()}</p>
                    </div>
                    <div className="flex flex-shrink-0 items-center gap-1">
                      <button
                        onClick={() => copy(uploadLink(p), "Upload link")}
                        title="Copy link"
                        className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                      >
                        <Copy className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => setPendingDelete(p)}
                        title="Cancel link"
                        className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600"
                      >
                        <Trash className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "create" && !result && (
        <div className="space-y-4">
          <p className="text-sm text-slate-500">
            Create a link that lets anyone upload files to your account. Files are stored in a folder named after the
            project.
          </p>
          <div>
            <label className="label">Project Name</label>
            <input
              className="field"
              placeholder="e.g. client-photos"
              value={form.name}
              onChange={(e) => set({ name: e.target.value })}
            />
            <p className="mt-1 text-xs text-slate-400">Used as the folder name for uploaded files</p>
          </div>
          <div>
            <label className="label">Max File Size (MB)</label>
            <input
              type="number"
              min="1"
              className="field"
              value={form.maxSize}
              onChange={(e) => set({ maxSize: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Link Expiry</label>
            <select className="field" value={form.expiry} onChange={(e) => set({ expiry: e.target.value })}>
              <option value="3600">1 hour</option>
              <option value="86400">1 day</option>
              <option value="604800">1 week</option>
              <option value="2592000">30 days</option>
            </select>
          </div>
          <div>
            <label className="label">Description (optional)</label>
            <input
              className="field"
              placeholder="Instructions for uploaders"
              value={form.description}
              onChange={(e) => set({ description: e.target.value })}
            />
          </div>
          <button onClick={create} className="btn-primary w-full">
            Create Upload URL
          </button>
        </div>
      )}

      {tab === "create" && result && (
        <div>
          <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
            <p className="mb-2 text-sm font-medium text-emerald-700">Upload URL created</p>
            <div className="flex gap-2">
              <input readOnly value={result.url} className="field flex-1 text-sm" />
              <button
                onClick={() => copy(result.url, "Upload URL")}
                className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-600"
              >
                Copy
              </button>
            </div>
            <p className="mt-2 text-xs text-slate-400">{result.expires}</p>
            <p className="text-xs text-slate-400">{result.max}</p>
          </div>
          <button
            onClick={() => {
              setResult(null);
              setForm(EMPTY_FORM);
            }}
            className="w-full py-2 text-sm text-brand-600 transition-colors hover:text-brand-700"
          >
            Create another
          </button>
        </div>
      )}

      <div className="mt-4 flex justify-end">
        <button onClick={onClose} className="px-4 py-2 text-slate-500 transition-colors hover:text-slate-800">
          Close
        </button>
      </div>

      <ConfirmDialog
        open={!!pendingDelete}
        message={`Cancel upload URL "${pendingDelete?.name}"? The link stops working immediately. Files already uploaded are kept.`}
        confirmLabel="Cancel link"
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </Modal>
  );
}
