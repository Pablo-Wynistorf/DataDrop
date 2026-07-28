import { useState } from "react";
import Modal from "../../components/Modal.jsx";
import ExpirySelector from "../../components/ExpirySelector.jsx";
import { Pencil } from "../../components/icons.jsx";
import { apiFetch, jsonBody } from "../../lib/api.js";
import { EXPIRY_PRESETS } from "../../lib/fileFilters.js";

const EDIT_PRESETS = EXPIRY_PRESETS.filter((p) => p.value !== "1800");

export default function EditModal({ file, onClose, onSaved, toast }) {
  const [expiry, setExpiry] = useState({ mode: "preset", preset: "604800", datetime: "" });
  const [maxDownloads, setMaxDownloads] = useState(file.maxDownloads || "");

  let info = "";
  if (file.expiresAt) info += `Current expiry: ${new Date(file.expiresAt).toLocaleString()}`;
  if (file.maxDownloads) {
    const remaining = file.downloadsRemaining ?? file.maxDownloads - (file.downloadCount || 0);
    info += `${info ? " | " : ""}Downloads: ${remaining}/${file.maxDownloads} remaining`;
  }

  async function save() {
    const body = {};
    if (expiry.mode === "preset") {
      body.expiresInSeconds = parseInt(expiry.preset, 10);
    } else if (expiry.datetime) {
      body.expiresAt = new Date(expiry.datetime).toISOString();
    } else {
      body.expiresInSeconds = 604800;
    }
    const trimmed = String(maxDownloads).trim();
    if (trimmed) {
      const parsed = parseInt(trimmed, 10);
      if (!isNaN(parsed) && parsed > 0) body.maxDownloads = parsed;
    } else {
      body.maxDownloads = null;
    }

    const { res, data } = await apiFetch(`/files/${file.id}`, { method: "PATCH", ...jsonBody(body) });
    if (!res.ok) {
      toast(data?.error || `Failed to update file (${res.status})`, "error");
      return;
    }
    toast("File settings updated", "success");
    onSaved();
  }

  return (
    <Modal open onClose={onClose} title="Edit File Settings" icon={<Pencil className="h-5 w-5 text-brand-600" />}>
      <p className="mb-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-500">{info || "No limits set"}</p>
      <div className="mb-6 space-y-4">
        <ExpirySelector label="New Expiry (resets TTL)" value={expiry} onChange={setExpiry} presets={EDIT_PRESETS} />
        <div>
          <label className="label">Max Downloads</label>
          <input
            type="number"
            min="1"
            placeholder="Unlimited"
            className="field"
            value={maxDownloads}
            onChange={(e) => setMaxDownloads(e.target.value)}
          />
          <p className="mt-1 text-xs text-slate-400">
            Leave empty for unlimited. File auto-deletes when limit reached.
          </p>
        </div>
      </div>
      <div className="flex justify-end gap-3">
        <button onClick={onClose} className="px-4 py-2 text-slate-500 transition hover:text-slate-800">
          Cancel
        </button>
        <button onClick={save} className="btn-primary px-4 py-2">
          Save
        </button>
      </div>
    </Modal>
  );
}
