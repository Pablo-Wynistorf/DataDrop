import { useEffect, useState } from "react";
import Background from "../components/Background.jsx";
import { Doc, Download, Warning, Check } from "../components/icons.jsx";
import { API_URL } from "../lib/api.js";
import { formatFileSize } from "../lib/format.js";

export default function FileDownload() {
  const [status, setStatus] = useState("loading"); // loading | error | ready | success
  const [error, setError] = useState("");
  const [info, setInfo] = useState(null);
  const [remaining, setRemaining] = useState(null);
  const token = new URLSearchParams(window.location.search).get("token");

  useEffect(() => {
    if (!token) {
      setError("Invalid download link");
      setStatus("error");
      return;
    }
    (async () => {
      try {
        const res = await fetch(`${API_URL}/file/${token}/info`);
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "File not found");
          setStatus("error");
          return;
        }
        setInfo(data);
        setStatus("ready");
      } catch {
        setError("Failed to load file information");
        setStatus("error");
      }
    })();
  }, [token]);

  async function download() {
    try {
      const res = await fetch(`${API_URL}/file/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Download failed");
        setStatus("error");
        return;
      }
      window.location.href = data.downloadUrl;
      setRemaining(data.downloadsRemaining);
      setStatus("success");
    } catch {
      setError("Download failed");
      setStatus("error");
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <Background />
      <div className="card w-full max-w-md p-8">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-soft">
            <Doc className="h-6 w-6" />
          </div>
          <p className="text-sm font-medium text-slate-400">DataDrop</p>
        </div>

        {status === "loading" && (
          <div className="py-8 text-center">
            <div className="spinner mx-auto h-12 w-12" />
            <p className="mt-4 text-slate-500">Loading file info...</p>
          </div>
        )}

        {status === "error" && (
          <div className="py-8 text-center">
            <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-2xl bg-rose-100 text-rose-500">
              <Warning className="h-10 w-10" />
            </div>
            <h2 className="mb-2 text-xl font-semibold text-slate-900">Error</h2>
            <p className="text-slate-500">{error}</p>
          </div>
        )}

        {status === "ready" && info && (
          <div>
            <div className="mb-6 text-center">
              <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
                <Doc className="h-10 w-10" />
              </div>
              <h2 className="break-all text-xl font-semibold text-slate-900">{info.fileName}</h2>
              <p className="mt-1 text-slate-500">{formatFileSize(info.fileSize)}</p>
            </div>

            <div className="mb-6 space-y-1.5 rounded-xl bg-slate-50 p-4 text-sm text-slate-500">
              {info.expiresAt && <p>Link expires: {new Date(info.expiresAt).toLocaleString()}</p>}
              {info.fileExpiresAt && (
                <p>File expires: {new Date(info.fileExpiresAt).toLocaleString()}</p>
              )}
              {info.maxDownloads && (
                <p className={info.downloadsRemaining <= 1 ? "text-amber-600" : ""}>
                  Downloads remaining: {info.downloadsRemaining} of {info.maxDownloads}
                </p>
              )}
            </div>

            <button onClick={download} className="btn-primary w-full py-4 text-lg">
              <Download className="h-5 w-5" />
              Download
            </button>
          </div>
        )}

        {status === "success" && (
          <div className="py-8 text-center">
            <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-500">
              <Check className="h-10 w-10" />
            </div>
            <h2 className="mb-2 text-xl font-semibold text-slate-900">Download Started</h2>
            <p className="text-slate-500">Your file is being downloaded.</p>
            {remaining !== null && remaining !== undefined && (
              <p className={`mt-3 text-sm ${remaining === 0 ? "text-amber-600" : "text-slate-400"}`}>
                {remaining === 0
                  ? "This was the last download. The file has been deleted."
                  : `${remaining} download(s) remaining.`}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
