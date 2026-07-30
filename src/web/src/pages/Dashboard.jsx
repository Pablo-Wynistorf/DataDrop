import { useCallback, useEffect, useState } from "react";
import Background from "../components/Background.jsx";
import Logo from "../components/Logo.jsx";
import { useToast } from "../components/Toast.jsx";
import { ConfirmDialog } from "../components/Modal.jsx";
import { Terminal, Link, LogOut, Cog } from "../components/icons.jsx";
import { API_URL, apiFetch, jsonBody } from "../lib/api.js";
import { UploadTracker, putToS3, uploadAuthedFile, computeFolderPath } from "../lib/upload.js";
import { makeEmptyFilters } from "../lib/fileFilters.js";
import { buildFolderTree } from "../lib/folders.js";

import UploadPanel from "./dashboard/UploadPanel.jsx";
import FilesSection from "./dashboard/FilesSection.jsx";
import EditModal from "./dashboard/EditModal.jsx";
import ShareModal from "./dashboard/ShareModal.jsx";
import UploadUrlModal from "./dashboard/UploadUrlModal.jsx";
import { CliModal, CliAuthModal } from "./dashboard/CliModals.jsx";
import { MoveFileModal, BatchMoveModal, CreateFolderModal, RenameFolderModal } from "./dashboard/FolderModals.jsx";
import ConvertModal from "./dashboard/ConvertModal.jsx";

// Marks that we already sent the visitor to the identity provider in this tab.
const LOGIN_ATTEMPT_KEY = "dd_login_redirect";
// A CLI auth code arrives as "/app?cli_auth=...". The OIDC round trip drops the
// query string, so stash it for the return leg.
const CLI_AUTH_KEY = "dd_cli_auth";

function takeCliAuthCode() {
  const fromUrl = new URLSearchParams(window.location.search).get("cli_auth");
  if (fromUrl) {
    sessionStorage.setItem(CLI_AUTH_KEY, fromUrl);
    return fromUrl;
  }
  return sessionStorage.getItem(CLI_AUTH_KEY);
}

export default function Dashboard() {
  const toast = useToast();
  const [view, setView] = useState("loading"); // loading | login | main
  const [user, setUser] = useState(null);
  const [files, setFiles] = useState([]);
  const [localFolders, setLocalFolders] = useState([]);
  const [currentFolder, setCurrentFolder] = useState("/");
  const [filters, setFilters] = useState(makeEmptyFilters());
  const [progress, setProgress] = useState(null);

  // Modal state
  const [editFile, setEditFile] = useState(null);
  const [shareFile, setShareFile] = useState(null);
  const [convertFile, setConvertFile] = useState(null);
  const [moveFile, setMoveFile] = useState(null);
  const [batchMoveIds, setBatchMoveIds] = useState(null);
  const [renameTarget, setRenameTarget] = useState(null);
  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const [showCli, setShowCli] = useState(false);
  const [showUploadUrl, setShowUploadUrl] = useState(false);
  const [cliAuthCode, setCliAuthCode] = useState(null);
  const [confirm, setConfirm] = useState(null); // { message, onConfirm }

  const folders = buildFolderTree(files, localFolders);

  const loadFiles = useCallback(async () => {
    const { res, data } = await apiFetch("/files");
    if (res.ok && data) setFiles(data.files);
  }, []);

  const verifySession = useCallback(async () => {
    try {
      let res = await fetch(`${API_URL}/auth/verify`, { credentials: "include" });
      if (res.status === 401) {
        const refresh = await fetch(`${API_URL}/auth/refresh`, { method: "POST", credentials: "include" });
        if (refresh.ok) res = await fetch(`${API_URL}/auth/verify`, { credentials: "include" });
      }
      if (res.ok) {
        sessionStorage.removeItem(LOGIN_ATTEMPT_KEY);
        setUser(await res.json());
        setView("main");
        loadFiles();
      } else {
        // No valid session: bounce straight to the identity provider once. The
        // flag prevents an endless /app -> IdP -> /app loop when the callback
        // does not produce a usable session (e.g. cookies blocked).
        if (!sessionStorage.getItem(LOGIN_ATTEMPT_KEY)) {
          sessionStorage.setItem(LOGIN_ATTEMPT_KEY, "1");
          window.location.replace(`${API_URL}/auth/login`);
          return;
        }
        setView("login");
      }
    } catch {
      setView("login");
    }
  }, [loadFiles]);

  useEffect(() => {
    verifySession();
  }, [verifySession]);

  // Check for CLI auth request once logged in.
  useEffect(() => {
    if (view !== "main") return;
    const code = takeCliAuthCode();
    if (!code) return;
    (async () => {
      try {
        const res = await fetch(`${API_URL}/auth/cli/login/${code}`);
        const data = await res.json();
        if (res.ok && data.status === "pending") setCliAuthCode(code);
        else {
          sessionStorage.removeItem(CLI_AUTH_KEY);
          toast("Invalid or expired CLI auth code", "error");
        }
      } catch {
        sessionStorage.removeItem(CLI_AUTH_KEY);
        toast("Failed to verify CLI auth code", "error");
      }
    })();
  }, [view, toast]);

  function clearCliAuthParam() {
    const url = new URL(window.location);
    url.searchParams.delete("cli_auth");
    window.history.replaceState({}, "", url);
    sessionStorage.removeItem(CLI_AUTH_KEY);
    setCliAuthCode(null);
  }

  async function authorizeCli() {
    const { res, data } = await apiFetch("/auth/cli/authorize", { method: "POST", ...jsonBody({ code: cliAuthCode }) });
    if (res.ok) {
      toast("CLI authorized successfully!", "success");
      clearCliAuthParam();
    } else {
      toast(data?.error || "Failed to authorize CLI", "error");
    }
  }

  async function logout() {
    try {
      await fetch(`${API_URL}/auth/logout`, { method: "POST", credentials: "include" });
    } catch {}
    // Back to the static landing page, which needs no session to render.
    sessionStorage.removeItem(LOGIN_ATTEMPT_KEY);
    window.location.href = "/";
  }

  async function runUploads(selectedFiles, opts) {
    // The panel resolves an explicit destination; fall back to the current folder.
    const uploadOpts = { ...opts, baseFolder: opts.destFolder || currentFolder };
    const totalSize = selectedFiles.reduce((s, f) => s + f.size, 0);

    if (selectedFiles.length === 1) {
      const file = selectedFiles[0];
      setProgress({ name: file.name, pct: 0 });
      try {
        await uploadAuthedFile(file, uploadOpts, (p) => setProgress({ name: file.name, ...p }));
        toast("File uploaded successfully!", "success");
      } catch (err) {
        toast(err.message, "error", 8000);
      }
      setProgress(null);
      loadFiles();
      return;
    }

    // Multiple files: aggregate progress across all files.
    const tracker = new UploadTracker(totalSize);
    let uploadedSize = 0;
    let success = 0;
    const failed = [];

    for (let i = 0; i < selectedFiles.length; i++) {
      const file = selectedFiles[i];
      const label = `${i + 1}/${selectedFiles.length}: ${file.name}`;
      setProgress({ name: label, pct: Math.round((uploadedSize / totalSize) * 100) });
      try {
        await uploadOneAggregated(file, uploadOpts, uploadedSize, totalSize, tracker, (p) =>
          setProgress({ name: label, ...p })
        );
        success++;
      } catch (err) {
        failed.push(file.name);
      }
      uploadedSize += file.size;
    }

    setProgress(null);
    loadFiles();
    if (failed.length === 0) toast(`All ${success} files uploaded successfully!`, "success");
    else if (success > 0) toast(`${success} files uploaded, ${failed.length} failed`, "warning", 6000);
    else toast("All uploads failed", "error", 6000);
  }

  async function openFile(file) {
    if (file.uploadType === "cdn") {
      if (file.cdnUrl) window.open(file.cdnUrl, "_blank", "noopener,noreferrer");
      return;
    }
    // Private files need a short-lived signed link (valid ~5 minutes). Open a
    // blank tab synchronously first so the popup blocker doesn't reject it
    // after the async request resolves. Note: we can't pass "noopener" here or
    // window.open returns null and we lose the handle needed to navigate the
    // tab once the signed URL arrives — instead we sever opener access below.
    const tab = window.open("about:blank", "_blank");
    if (tab) tab.opener = null;
    const { res, data } = await apiFetch(`/files/${file.id}/view`);
    if (res.ok && data?.viewUrl) {
      if (tab) tab.location = data.viewUrl;
      else window.open(data.viewUrl, "_blank", "noopener,noreferrer");
    } else {
      if (tab) tab.close();
      toast(data?.error || "Failed to open file", "error");
    }
  }

  async function downloadFile(file) {
    const { res, data } = await apiFetch(`/files/${file.id}/download`);
    if (!res.ok || !data?.downloadUrl) {
      toast(data?.error || "Failed to download file", "error");
      return;
    }
    // The presigned URL carries a content-disposition of attachment, so a
    // simple anchor click triggers a direct download without a popup.
    const a = document.createElement("a");
    a.href = data.downloadUrl;
    a.download = data.fileName || file.fileName || "";
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function deleteFile(file) {
    setConfirm({
      message: "Are you sure you want to delete this file?",
      onConfirm: async () => {
        setConfirm(null);
        toast("Deleting file...", "info", 2000);
        const { res } = await apiFetch(`/files/${file.id}`, { method: "DELETE" });
        if (res.ok) {
          setFiles((f) => f.filter((x) => x.id !== file.id));
          toast("File deleted", "success");
        } else {
          toast("Failed to delete file", "error");
        }
      },
    });
  }

  function deleteFolder(folderPath) {
    setConfirm({
      message: `Delete folder "${folderPath}"? All files inside it will be permanently deleted. This cannot be undone.`,
      onConfirm: async () => {
        setConfirm(null);
        toast("Deleting folder...", "info", 2000);
        const { res, data } = await apiFetch("/folders/delete", { method: "POST", ...jsonBody({ folderPath }) });
        if (res.ok) {
          if (currentFolder === folderPath || currentFolder.startsWith(folderPath + "/")) {
            const segs = folderPath.split("/").filter(Boolean);
            segs.pop();
            setCurrentFolder(segs.length ? "/" + segs.join("/") : "/");
          }
          setLocalFolders((lf) => lf.filter((p) => p !== folderPath));
          // Optimistically drop the deleted files from the list; deletion is
          // processed asynchronously so a reload may still show them briefly.
          setFiles((f) =>
            f.filter((x) => {
              const fp = x.folderPath || "/";
              return fp !== folderPath && !fp.startsWith(folderPath + "/");
            })
          );
          toast("Folder deleted", "success");
        } else {
          toast(data?.error || "Failed to delete folder", "error");
        }
      },
    });
  }

  function deleteFiles(fileIds) {
    if (!fileIds || fileIds.length === 0) return;
    const n = fileIds.length;
    setConfirm({
      message: `Delete ${n} file${n !== 1 ? "s" : ""}? This cannot be undone.`,
      onConfirm: async () => {
        setConfirm(null);
        toast(`Deleting ${n} file${n !== 1 ? "s" : ""}...`, "info", 2000);
        const { res, data } = await apiFetch("/files/batch-delete", { method: "POST", ...jsonBody({ fileIds }) });
        if (res.ok) {
          const ids = new Set(fileIds);
          setFiles((f) => f.filter((x) => !ids.has(x.id)));
          toast(`${n} file${n !== 1 ? "s" : ""} deleted`, "success");
        } else {
          toast(data?.error || "Failed to delete files", "error");
        }
      },
    });
  }

  function createFolder(name) {
    const newPath = currentFolder === "/" ? "/" + name : currentFolder + "/" + name;
    setLocalFolders((lf) => (lf.includes(newPath) ? lf : [...lf, newPath]));
    setShowCreateFolder(false);
    toast(`Folder "${name}" created`, "success");
  }

  function afterFolderRename(oldPath, newPath) {
    if (currentFolder === oldPath || currentFolder.startsWith(oldPath + "/")) {
      setCurrentFolder(newPath + currentFolder.slice(oldPath.length));
    }
    setRenameTarget(null);
    loadFiles();
  }

  if (view === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Background />
        <div className="spinner h-12 w-12" />
      </div>
    );
  }

  if (view === "login") return <SignInPrompt />;

  return (
    <div className="relative min-h-screen">
      <Background />
      <div className="container relative z-10 mx-auto max-w-4xl px-4 py-8">
        {/* Header */}
        <header className="mb-8 flex items-center justify-between gap-3">
          <Logo />
          <div className="flex items-center gap-1 sm:gap-2">
            {user && (
              <div className="hidden items-center gap-2 pr-1 sm:flex">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-700">
                  {(user.name || user.email || "?").charAt(0).toUpperCase()}
                </div>
                <span className="max-w-[140px] truncate text-sm font-medium text-slate-600">
                  {user.name || user.email}
                </span>
              </div>
            )}
            <span className="mx-1 hidden h-6 w-px bg-slate-200 sm:block" />
            {user?.isAdmin && (
              <a href="/admin" className="header-action" title="Admin settings">
                <Cog className="h-4 w-4" />
                <span className="hidden sm:inline">Admin</span>
              </a>
            )}
            <button onClick={() => setShowCli(true)} className="header-action" title="Download CLI">
              <Terminal className="h-4 w-4" />
              <span className="hidden sm:inline">CLI</span>
            </button>
            <button onClick={() => setShowUploadUrl(true)} className="header-action" title="Create Upload URL">
              <Link className="h-4 w-4" />
              <span className="hidden sm:inline">Upload URL</span>
            </button>
            <button
              onClick={logout}
              className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-medium text-rose-500 transition-colors hover:bg-rose-50 hover:text-rose-600"
              title="Logout"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </header>

        <UploadPanel
          onStartUpload={runUploads}
          progress={progress}
          folders={folders}
          currentFolder={currentFolder}
        />

        <FilesSection
          allFiles={files}
          folders={folders}
          currentFolder={currentFolder}
          filters={filters}
          setFilters={setFilters}
          onNavigate={setCurrentFolder}
          onRefresh={loadFiles}
          onCreateFolder={() => setShowCreateFolder(true)}
          onRenameFolder={setRenameTarget}
          onDeleteFolder={deleteFolder}
          onMoveFile={setMoveFile}
          onEdit={setEditFile}
          onOpen={openFile}
          onDownload={downloadFile}
          onShare={setShareFile}
          onConvert={setConvertFile}
          onDelete={deleteFile}
          onBatchDelete={deleteFiles}
          onBatchMove={setBatchMoveIds}
        />
      </div>

      {editFile && (
        <EditModal
          file={editFile}
          toast={toast}
          onClose={() => setEditFile(null)}
          onSaved={() => {
            setEditFile(null);
            loadFiles();
          }}
        />
      )}
      {shareFile && <ShareModal file={shareFile} toast={toast} onClose={() => setShareFile(null)} />}
      {convertFile && (
        <ConvertModal
          file={convertFile}
          toast={toast}
          onClose={() => setConvertFile(null)}
          onConverted={() => {
            setConvertFile(null);
            loadFiles();
          }}
        />
      )}
      {moveFile && (
        <MoveFileModal
          file={moveFile}
          folders={folders}
          toast={toast}
          onClose={() => setMoveFile(null)}
          onMoved={() => {
            setMoveFile(null);
            loadFiles();
          }}
        />
      )}
      {batchMoveIds && (
        <BatchMoveModal
          fileIds={batchMoveIds}
          folders={folders}
          toast={toast}
          onClose={() => setBatchMoveIds(null)}
          onMoved={() => {
            setBatchMoveIds(null);
            loadFiles();
          }}
        />
      )}
      {showCreateFolder && (
        <CreateFolderModal currentFolder={currentFolder} onClose={() => setShowCreateFolder(false)} onCreate={createFolder} />
      )}
      {renameTarget && (
        <RenameFolderModal folderPath={renameTarget} toast={toast} onClose={() => setRenameTarget(null)} onRenamed={afterFolderRename} />
      )}
      {showUploadUrl && <UploadUrlModal toast={toast} onClose={() => setShowUploadUrl(false)} />}
      {showCli && <CliModal toast={toast} onClose={() => setShowCli(false)} />}
      {cliAuthCode && <CliAuthModal code={cliAuthCode} onAuthorize={authorizeCli} onClose={clearCliAuthParam} />}
      <ConfirmDialog
        open={!!confirm}
        message={confirm?.message}
        onConfirm={confirm?.onConfirm}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}

// Upload one file as part of a multi-file batch, reporting aggregate progress.
async function uploadOneAggregated(file, opts, uploadedSoFar, totalSize, tracker, onProgress) {
  const body = {
    fileName: file.name,
    fileType: file.type || "application/octet-stream",
    fileSize: file.size,
    uploadType: opts.uploadType,
  };
  const folderPath = computeFolderPath(opts.baseFolder, file);
  if (folderPath && folderPath !== "/") body.folderPath = folderPath;
  if (opts.uploadType === "private") {
    if (opts.expiresAt) body.expiresAt = opts.expiresAt;
    else if (opts.expiresInSeconds) body.expiresInSeconds = opts.expiresInSeconds;
    if (opts.maxDownloads) body.maxDownloads = opts.maxDownloads;
  }

  const res = await fetch(`${API_URL}/upload`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error("Failed to get upload URL");
  const { uploadUrl, fileId, multipart } = await res.json();

  if (multipart) {
    const { partCount, partSize } = multipart;
    const parts = [];
    let fileUploaded = 0;
    for (let partNum = 1; partNum <= partCount; partNum++) {
      const start = (partNum - 1) * partSize;
      const end = Math.min(start + partSize, file.size);
      const partRes = await fetch(`${API_URL}/upload/${fileId}/part`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ partNumber: partNum }),
      });
      if (!partRes.ok) throw new Error(`Failed to get URL for part ${partNum}`);
      const { uploadUrl: partUrl } = await partRes.json();
      const etag = await putToS3(partUrl, file.slice(start, end), null, (loaded) => {
        const progress = uploadedSoFar + fileUploaded + loaded;
        const { speed, eta } = tracker.update(progress);
        onProgress({ pct: Math.round((progress / totalSize) * 100), speed, eta, detail: `part ${partNum}/${partCount}` });
      });
      fileUploaded += end - start;
      parts.push({ partNumber: partNum, etag });
    }
    const complete = await fetch(`${API_URL}/upload/${fileId}/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ parts }),
    });
    if (!complete.ok) throw new Error("Failed to complete multipart upload");
  } else {
    await putToS3(uploadUrl, file, file.type || "application/octet-stream", (loaded) => {
      const progress = uploadedSoFar + loaded;
      const { speed, eta } = tracker.update(progress);
      onProgress({ pct: Math.round((progress / totalSize) * 100), speed, eta });
    });
    await fetch(`${API_URL}/files/${fileId}/confirm`, { method: "POST", credentials: "include" });
  }
}

// Fallback for /app without a usable session. The marketing/login page lives at
// "/" as static HTML, so this stays deliberately small: it only shows up when
// the automatic sign-in redirect already ran and still came back unauthorized.
function SignInPrompt() {
  return (
    <div className="relative flex min-h-screen items-center justify-center p-4">
      <Background />
      <div className="card relative z-10 w-full max-w-md p-8 text-center">
        <div className="mb-6 flex justify-center">
          <Logo />
        </div>
        <h1 className="mb-2 text-xl font-semibold text-slate-900">Sign in required</h1>
        <p className="mb-6 text-slate-600">Your session has expired or could not be established.</p>
        <a href={`${API_URL}/auth/login`} className="btn-primary w-full">
          Sign in
        </a>
        <a href="/" className="btn-ghost mt-3 w-full">
          Back to home
        </a>
      </div>
    </div>
  );
}
