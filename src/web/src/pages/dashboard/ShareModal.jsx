import { useState } from "react";
import Modal from "../../components/Modal.jsx";
import ExpirySelector from "../../components/ExpirySelector.jsx";
import { Share, Globe, Lock, Check, Copy, Refresh, Clock, Download } from "../../components/icons.jsx";
import { apiFetch, jsonBody } from "../../lib/api.js";
import { EXPIRY_PRESETS } from "../../lib/fileFilters.js";

const SHARE_PRESETS = EXPIRY_PRESETS.filter((p) => p.value !== "1209600");

export default function ShareModal({ file, onClose, toast }) {
  const isCdn = file.uploadType === "cdn";
  const [expiry, setExpiry] = useState({ mode: "preset", preset: "86400", datetime: "" });
  const [result, setResult] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [justCopied, setJustCopied] = useState(false);

  function copy(text, { silent = false } = {}) {
    return navigator.clipboard
      .writeText(text)
      .then(() => {
        setJustCopied(true);
        setTimeout(() => setJustCopied(false), 2000);
        if (!silent) toast("Link copied to clipboard!", "success");
        return true;
      })
      .catch(() => {
        toast("Failed to copy", "error");
        return false;
      });
  }

  async function generate() {
    setGenerating(true);
    const body = {};
    if (expiry.mode === "preset") body.expiresInSeconds = parseInt(expiry.preset, 10);
    else body.expiresAt = expiry.datetime;
    const { res, data } = await apiFetch(`/files/${file.id}/share`, { method: "POST", ...jsonBody(body) });
    setGenerating(false);
    if (!res.ok) {
      toast(data?.error || "Failed to generate share link", "error");
      return;
    }
    setResult({
      url: data.shareUrl,
      linkExpiresAt: data.expiresAt,
      fileExpiresAt: data.fileExpiresAt,
      maxDownloads: data.maxDownloads,
      downloadsRemaining: data.downloadsRemaining,
    });
    // Auto-copy so the user can paste immediately.
    const ok = await copy(data.shareUrl, { silent: true });
    toast(ok ? "Share link generated and copied to clipboard!" : "Share link generated", "success");
  }

  function newLink() {
    setResult(null);
    setJustCopied(false);
  }

  // ---- CDN (public) files: link never expires, no generation needed. ----
  if (isCdn) {
    return (
      <Modal open onClose={onClose} title="Share File" icon={<Share className="h-5 w-5 text-brand-600" />}>
        <div className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50/60 p-5">
          <div className="mb-4 flex items-center gap-2 text-emerald-700">
            <Globe className="h-4 w-4 shrink-0" />
            <span className="text-sm font-semibold">Public CDN Link</span>
          </div>
          <p className="mb-4 text-xs leading-relaxed text-emerald-700/70">
            This file is publicly accessible. The link never expires.
          </p>
          <div className="flex items-center gap-2">
            <input
              readOnly
              value={file.cdnUrl || ""}
              className="min-w-0 flex-1 truncate rounded-lg border border-emerald-200 bg-white px-3 py-2 font-mono text-sm text-slate-600 focus:outline-none"
            />
            <button
              onClick={() => copy(file.cdnUrl || "")}
              className="shrink-0 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-600"
            >
              Copy
            </button>
          </div>
        </div>
        <div className="flex justify-end">
          <button onClick={onClose} className="px-4 py-2 text-slate-500 transition hover:text-slate-800">
            Close
          </button>
        </div>
      </Modal>
    );
  }

  // ---- Private files: show the generated link, or the generation form. ----
  return (
    <Modal open onClose={onClose} title="Share File" icon={<Share className="h-5 w-5 text-brand-600" />}>
      {result ? (
        <div className="animate-share-reveal">
          {/* Success banner */}
          <div className="mb-5 flex flex-col items-center text-center">
            <div className="animate-check-pop mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 shadow-[0_10px_30px_-8px_rgba(16,185,129,0.6)]">
              <Check className="h-7 w-7 text-white" />
            </div>
            <h4 className="text-base font-semibold text-slate-900">Your share link is ready</h4>
            <p className="mt-1 flex items-center gap-1.5 text-sm font-medium text-emerald-600">
              <Copy className="h-3.5 w-3.5" /> Copied to your clipboard
            </p>
          </div>

          {/* Link box */}
          <div className="mb-4 rounded-2xl border border-slate-200 bg-slate-50/80 p-2.5">
            <div className="flex items-center gap-2">
              <input
                readOnly
                value={result.url}
                onFocus={(e) => e.target.select()}
                className="min-w-0 flex-1 truncate bg-transparent px-2 font-mono text-sm text-slate-700 focus:outline-none"
              />
              <button
                onClick={() => copy(result.url)}
                className={`flex shrink-0 items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-medium text-white transition ${
                  justCopied ? "bg-emerald-500" : "bg-brand-600 hover:bg-brand-700"
                }`}
              >
                {justCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {justCopied ? "Copied" : "Copy"}
              </button>
            </div>
          </div>

          {/* Expiry meta */}
          <div className="mb-6 space-y-1.5 rounded-xl bg-slate-50 px-4 py-3 text-xs text-slate-500">
            <p className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 shrink-0 text-slate-400" />
              Link expires {new Date(result.linkExpiresAt).toLocaleString()}
            </p>
            {result.fileExpiresAt && (
              <p className="flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                File expires {new Date(result.fileExpiresAt).toLocaleString()}
              </p>
            )}
            {result.maxDownloads && (
              <p className="flex items-center gap-1.5">
                <Download className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                {result.downloadsRemaining}/{result.maxDownloads} downloads remaining
              </p>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between gap-3">
            <button onClick={newLink} className="btn-ghost">
              <Refresh className="h-4 w-4" /> New link
            </button>
            <button
              onClick={async () => {
                await copy(result.url, { silent: true });
                onClose();
              }}
              className="btn-primary"
            >
              <Copy className="h-4 w-4" /> Copy &amp; Close
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
          <button onClick={generate} disabled={generating} className="btn-primary w-full">
            {generating ? "Generating…" : "Generate Share Link"}
          </button>
          <div className="mt-6 flex justify-end">
            <button onClick={onClose} className="px-4 py-2 text-slate-500 transition hover:text-slate-800">
              Close
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
