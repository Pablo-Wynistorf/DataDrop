import { useState } from "react";
import Modal from "../../components/Modal.jsx";
import ExpirySelector from "../../components/ExpirySelector.jsx";
import { Swap, Globe, Lock } from "../../components/icons.jsx";
import { apiFetch, jsonBody } from "../../lib/api.js";
import { EXPIRY_PRESETS } from "../../lib/fileFilters.js";

const CONVERT_PRESETS = EXPIRY_PRESETS.filter((p) => p.value !== "1800" && p.value !== "1209600");

// Converts a file between "private" and "cdn". The target is the opposite of
// the file's current type.
export default function ConvertModal({ file, onClose, onConverted, toast }) {
  const toCdn = file.uploadType !== "cdn";
  const [expiry, setExpiry] = useState({ mode: "preset", preset: "604800", datetime: "" });
  const [maxDownloads, setMaxDownloads] = useState("");
  const [busy, setBusy] = useState(false);

  async function convert() {
    const body = { uploadType: toCdn ? "cdn" : "private" };
    if (!toCdn) {
      if (expiry.mode === "preset") body.expiresInSeconds = parseInt(expiry.preset, 10);
      else if (expiry.datetime) body.expiresAt = new Date(expiry.datetime).toISOString();
      if (maxDownloads) body.maxDownloads = parseInt(maxDownloads, 10);
    }
    setBusy(true);
    const { res, data } = await apiFetch(`/files/${file.id}/convert`, { method: "POST", ...jsonBody(body) });
    setBusy(false);
    if (!res.ok) {
      toast(data?.error || "Failed to convert file", "error");
      return;
    }
    toast(`Converted to ${toCdn ? "CDN" : "private"}`, "success");
    onConverted();
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Convert File"
      icon={<Swap className="h-5 w-5 text-brand-600" />}
    >
      <div className="mb-4 flex items-center gap-3 rounded-xl bg-slate-50 p-4 text-sm">
        <span className="inline-flex items-center gap-1.5 font-medium text-slate-600">
          {file.uploadType === "cdn" ? <Globe className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
          {file.uploadType === "cdn" ? "CDN" : "Private"}
        </span>
        <Swap className="h-4 w-4 rotate-90 text-slate-400" />
        <span className="inline-flex items-center gap-1.5 font-semibold text-slate-900">
          {toCdn ? <Globe className="h-4 w-4 text-emerald-600" /> : <Lock className="h-4 w-4 text-brand-600" />}
          {toCdn ? "CDN" : "Private"}
        </span>
      </div>

      <p className="mb-4 truncate text-sm text-slate-500">{file.fileName}</p>

      {toCdn ? (
        <div className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
          This file becomes publicly accessible through a permanent CDN link. Any expiry date and download limit
          will be removed.
        </div>
      ) : (
        <div className="mb-6 space-y-4">
          <div className="rounded-xl border border-brand-200 bg-brand-50 p-4 text-sm text-brand-700">
            The public CDN link stops working. Access is controlled through time-limited share links instead.
          </div>
          <ExpirySelector label="File Expiry" value={expiry} onChange={setExpiry} presets={CONVERT_PRESETS} />
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
          </div>
        </div>
      )}

      <div className="flex justify-end gap-3">
        <button onClick={onClose} className="px-4 py-2 text-slate-500 transition-colors hover:text-slate-800">
          Cancel
        </button>
        <button onClick={convert} disabled={busy} className="btn-primary px-4 py-2">
          {busy ? "Converting..." : toCdn ? "Convert to CDN" : "Convert to Private"}
        </button>
      </div>
    </Modal>
  );
}
