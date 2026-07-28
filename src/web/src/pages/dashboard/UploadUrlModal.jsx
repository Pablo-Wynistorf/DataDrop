import { useState } from "react";
import Modal from "../../components/Modal.jsx";
import { Link } from "../../components/icons.jsx";
import { apiFetch, jsonBody } from "../../lib/api.js";

export default function UploadUrlModal({ onClose, toast }) {
  const [form, setForm] = useState({ name: "", maxSize: 100, expiry: "604800", description: "" });
  const [result, setResult] = useState(null);
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

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
      max: `Max file size: ${data.maxFileSizeMB} MB | Folder: /${data.name}`,
    });
    toast("Upload URL created!", "success");
  }

  function copy() {
    navigator.clipboard.writeText(result.url).then(() => toast("Upload URL copied to clipboard!", "success"));
  }

  return (
    <Modal open onClose={onClose} title="Create Upload URL" icon={<Link className="h-5 w-5 text-brand-600" />}>
      <p className="mb-4 text-sm text-slate-500">
        Create a link that allows anyone to upload files to your account. Files are stored in a folder named after
        the project.
      </p>
      {!result ? (
        <div className="space-y-4">
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
      ) : (
        <div>
          <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
            <p className="mb-2 text-sm font-medium text-emerald-700">Upload URL created!</p>
            <div className="flex gap-2">
              <input readOnly value={result.url} className="field flex-1 text-sm" />
              <button
                onClick={copy}
                className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-600"
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
              set({ name: "", maxSize: 100, expiry: "604800", description: "" });
            }}
            className="w-full py-2 text-sm text-brand-600 transition hover:text-brand-700"
          >
            Create another
          </button>
        </div>
      )}
      <div className="mt-4 flex justify-end">
        <button onClick={onClose} className="px-4 py-2 text-slate-500 transition hover:text-slate-800">
          Close
        </button>
      </div>
    </Modal>
  );
}
