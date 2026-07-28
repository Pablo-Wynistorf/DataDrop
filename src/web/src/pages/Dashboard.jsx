import { useCallback, useEffect, useState } from "react";
import Background from "../components/Background.jsx";
import Logo from "../components/Logo.jsx";
import { useToast } from "../components/Toast.jsx";
import { ConfirmDialog } from "../components/Modal.jsx";
import { Terminal, Link } from "../components/icons.jsx";
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
import { MoveFileModal, CreateFolderModal, RenameFolderModal } from "./dashboard/FolderModals.jsx";
import ConvertModal from "./dashboard/ConvertModal.jsx";

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
        setUser(await res.json());
        setView("main");
        loadFiles();
      } else {
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
    const code = new URLSearchParams(window.location.search).get("cli_auth");
    if (!code) return;
    (async () => {
      try {
        const res = await fetch(`${API_URL}/auth/cli/login/${code}`);
        const data = await res.json();
        if (res.ok && data.status === "pending") setCliAuthCode(code);
        else toast("Invalid or expired CLI auth code", "error");
      } catch {
        toast("Failed to verify CLI auth code", "error");
      }
    })();
  }, [view, toast]);

  function clearCliAuthParam() {
    const url = new URL(window.location);
    url.searchParams.delete("cli_auth");
    window.history.replaceState({}, "", url);
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

  function login() {
    window.location.href = `${API_URL}/auth/login`;
  }

  async function logout() {
    try {
      await fetch(`${API_URL}/auth/logout`, { method: "POST", credentials: "include" });
    } catch {}
    setUser(null);
    setView("login");
  }

  async function runUploads(selectedFiles, opts) {
    const uploadOpts = { ...opts, baseFolder: currentFolder };
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
      message: `Delete folder "${folderPath}"? Files will be moved to the parent folder.`,
      onConfirm: async () => {
        setConfirm(null);
        const { res, data } = await apiFetch("/folders/delete", { method: "POST", ...jsonBody({ folderPath }) });
        if (res.ok) {
          if (currentFolder === folderPath || currentFolder.startsWith(folderPath + "/")) {
            const segs = folderPath.split("/").filter(Boolean);
            segs.pop();
            setCurrentFolder(segs.length ? "/" + segs.join("/") : "/");
          }
          setLocalFolders((lf) => lf.filter((p) => p !== folderPath));
          toast("Folder deleted", "success");
          loadFiles();
        } else {
          toast(data?.error || "Failed to delete folder", "error");
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

  if (view === "login") return <LoginView onLogin={login} />;

  return (
    <div className="relative min-h-screen">
      <Background />
      <div className="container relative z-10 mx-auto max-w-4xl px-4 py-8">
        {/* Header */}
        <div className="mb-8 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <Logo />
          <div className="flex w-full items-center justify-between gap-2 sm:w-auto sm:justify-end sm:gap-4">
            {user && (
              <span className="hidden max-w-[150px] truncate text-sm text-slate-500 sm:inline">
                {user.name || user.email}
              </span>
            )}
            <button
              onClick={() => setShowCli(true)}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
              title="Download CLI"
            >
              <Terminal className="h-4 w-4" />
              <span className="hidden sm:inline">CLI</span>
            </button>
            <button
              onClick={() => setShowUploadUrl(true)}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
              title="Create Upload URL"
            >
              <Link className="h-4 w-4" />
              <span className="hidden sm:inline">Upload URL</span>
            </button>
            <button onClick={logout} className="text-sm font-medium text-rose-500 transition hover:text-rose-600">
              Logout
            </button>
          </div>
        </div>

        <UploadPanel onStartUpload={runUploads} progress={progress} />

        <FilesSection
          allFiles={files}
          folders={folders}
          currentFolder={currentFolder}
          filters={filters}
          setFilters={setFilters}
          onNavigate={setCurrentFolder}
          onCreateFolder={() => setShowCreateFolder(true)}
          onRenameFolder={setRenameTarget}
          onDeleteFolder={deleteFolder}
          onMoveFile={setMoveFile}
          onEdit={setEditFile}
          onShare={setShareFile}
          onConvert={setConvertFile}
          onDelete={deleteFile}
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

function LoginView({ onLogin }) {
  return (
    <div className="relative min-h-screen">
      <Background />
      <div className="relative z-10 flex min-h-screen flex-col">
        <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6">
          <Logo />
          <button
            onClick={onLogin}
            className="rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            Log in
          </button>
        </header>

        <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col items-center gap-10 px-6 py-10 lg:flex-row lg:justify-between lg:py-20">
          <div className="max-w-md">
            <h1 className="text-5xl font-extrabold leading-tight tracking-tight text-slate-900 sm:text-6xl">
              Welcome to DataDrop
            </h1>
            <p className="mt-6 text-lg text-slate-500">
              Securely share files with anyone, anywhere.
            </p>
          </div>

          <div className="card w-full max-w-md p-8">
            <div className="mb-6 flex justify-center">
              <Logo size="lg" withText={false} />
            </div>
            <p className="text-center text-xl leading-relaxed text-slate-600">
              It's never been so easy and secure to share files — and completely{" "}
              <span className="font-bold text-slate-900">for free</span>!
            </p>
            <button onClick={onLogin} className="btn-primary mt-8 w-full py-4 text-lg">
              Sign in with OIDC
            </button>
          </div>
        </main>
      </div>
    </div>
  );
}
