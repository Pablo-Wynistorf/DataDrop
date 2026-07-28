import { useState } from "react";
import Modal from "../../components/Modal.jsx";
import ExpirySelector from "../../components/ExpirySelector.jsx";
import { Share, Globe, Lock } from "../../components/icons.jsx";
import { apiFetch, jsonBody } from "../../lib/api.js";
import { EXPIRY_PRESETS } from "../../lib/fileFilters.js";

const SHARE_PRESETS = EXPIRY_PRESETS.filter((p) => p.value !== "1209600");

export default function ShareModal({ file, onClose, toast }) {
  const isCdn = file.uploadType === "cdn";
  const [expiry, setExpiry] = useState({ mode: "preset", preset: "86400", datetime: "" });
  const [result, setResult] = useState(null);

  function copy(text, label) {
    navigator.clipboard
      .writeText(text)
      .then(() => toast(`${label} copied to clipboard!`, "success"))
      .catch(() => toast("Failed to copy", "error"));
  }

  async function generate() {
    const body = {};
    if (expiry.mode === "preset") body.expiresInSeconds = parseInt(expiry.preset, 10);
    else body.expiresAt = expiry.datetime;
    const { res, data } = await apiFetch(`/files/${file.id}/share`, { method: "POST", ...jsonBody(body) });
    if (!res.ok) {
      toast(data?.error || "Failed to generate share link", "error");
      return;
    }
    let expiryText = `Link expires: ${new Date(data.expiresAt).toLocaleString()}`;
    if (data.fileExpiresAt) expiryText += ` | File expires: ${new Date(data.fileExpiresAt).toLocaleString()}`;
    if (data.maxDownloads) expiryText += ` | Downloads: ${data.downloadsRemaining}/${data.maxDownloads}`;
    setResult({ url: data.shareUrl, expiryText });
  }

  return (
    <Modal open onClose={onClose} title="Share File" icon={<Share className="h-5 w-5 text-brand-600" />}>
      {isCdn ? (
        <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="mb-2 flex items-center gap-2 text-sm font-medium text-emerald-700">
            <Globe className="h-4 w-4" /> Public CDN Link
          </p>
          <p className="mb-3 text-xs text-emerald-600/80">This file is publicly accessible. The link never expires.</p>
          <div className="flex gap-2">
            <input readOnly value={file.cdnUrl || ""} className="field flex-1 text-sm" />
            <button
              onClick={() => copy(file.cdnUrl || "", "CDN link")}
              className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-600"
            >
              Copy
            </button>
          </div>
        </div>
      ) : (
        <div>
          <div className="mb-4 rounded-xl border border-brand-200 bg-brand-50 p-4">
            <p className="mb-2 flex items-center gap-2 text-sm font-medium text-brand-700">
              <Lock className="h-4 w-4" /> Private File
            </p>
            <p className="text-xs text-brand-600/80">Generate a time-limited share link below.</p>
          </div>
          <div className="mb-4">
            <ExpirySelector label="Link Expiry" value={expiry} onChange={setExpiry} presets={SHARE_PRESETS} />
          </div>
          <button onClick={generate} className="btn-primary mb-4 w-full">
            Generate Share Link
          </button>
          {result && (
            <div className="rounded-xl bg-slate-50 p-4">
              <p className="mb-2 text-sm text-slate-500">Share link:</p>
              <div className="flex gap-2">
                <input readOnly value={result.url} className="field flex-1 text-sm" />
                <button
                  onClick={() => copy(result.url, "Link")}
                  className="rounded-lg bg-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-300"
                >
                  Copy
                </button>
              </div>
              <p className="mt-2 text-xs text-slate-400">{result.expiryText}</p>
            </div>
          )}
        </div>
      )}
      <div className="mt-6 flex justify-end">
        <button onClick={onClose} className="px-4 py-2 text-slate-500 transition hover:text-slate-800">
          Close
        </button>
      </div>
    </Modal>
  );
}
