import { useState } from "react";
import Modal from "../../components/Modal.jsx";
import { Folder, FolderPlus, Pencil } from "../../components/icons.jsx";
import { apiFetch, jsonBody } from "../../lib/api.js";

export function MoveFileModal({ file, folders, onClose, onMoved, toast }) {
  const [target, setTarget] = useState(file.folderPath || "/");
  async function move() {
    const { res, data } = await apiFetch("/folders/move-file", {
      method: "POST",
      ...jsonBody({ fileId: file.id, folderPath: target }),
    });
    if (res.ok) {
      toast("File moved", "success");
      onMoved();
    } else {
      toast(data?.error || "Failed to move file", "error");
    }
  }
  return (
    <Modal open onClose={onClose} title="Move File to Folder" icon={<Folder className="h-5 w-5 text-amber-500" />}>
      <p className="mb-4 truncate text-sm text-slate-500">{file.fileName}</p>
      <label className="label">Select destination folder</label>
      <select className="field" value={target} onChange={(e) => setTarget(e.target.value)}>
        {folders.map((f) => (
          <option key={f} value={f}>
            {f === "/" ? "/ (root)" : f}
          </option>
        ))}
      </select>
      <div className="mt-6 flex justify-end gap-3">
        <button onClick={onClose} className="px-4 py-2 text-slate-500 transition hover:text-slate-800">
          Cancel
        </button>
        <button onClick={move} className="btn-primary px-4 py-2">
          Move
        </button>
      </div>
    </Modal>
  );
}

export function CreateFolderModal({ currentFolder, onClose, onCreate }) {
  const [name, setName] = useState("");
  function submit() {
    const clean = name.trim().replace(/[/\\]/g, "");
    if (!clean) return;
    onCreate(clean);
  }
  return (
    <Modal open onClose={onClose} title="New Folder" icon={<FolderPlus className="h-5 w-5 text-amber-500" />} maxWidth="max-w-sm">
      <label className="label">Folder name</label>
      <input
        autoFocus
        className="field"
        placeholder="My folder"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
      />
      <p className="mt-2 text-xs text-slate-400">
        {currentFolder === "/" ? "Will be created in: root" : `Will be created in: ${currentFolder}`}
      </p>
      <div className="mt-6 flex justify-end gap-3">
        <button onClick={onClose} className="px-4 py-2 text-slate-500 transition hover:text-slate-800">
          Cancel
        </button>
        <button onClick={submit} className="btn-primary px-4 py-2">
          Create
        </button>
      </div>
    </Modal>
  );
}

export function RenameFolderModal({ folderPath, onClose, onRenamed, toast }) {
  const segments = folderPath.split("/").filter(Boolean);
  const [name, setName] = useState(segments[segments.length - 1]);

  async function submit() {
    const newName = name.trim();
    if (!newName || newName === segments[segments.length - 1]) {
      onClose();
      return;
    }
    const { res, data } = await apiFetch("/folders/rename", {
      method: "POST",
      ...jsonBody({ oldPath: folderPath, newName }),
    });
    if (res.ok) {
      toast("Folder renamed", "success");
      onRenamed(folderPath, data.newPath);
    } else {
      toast(data?.error || "Failed to rename folder", "error");
    }
  }
  return (
    <Modal open onClose={onClose} title="Rename Folder" icon={<Pencil className="h-5 w-5 text-brand-600" />} maxWidth="max-w-sm">
      <label className="label">New name</label>
      <input
        autoFocus
        className="field"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
      />
      <div className="mt-6 flex justify-end gap-3">
        <button onClick={onClose} className="px-4 py-2 text-slate-500 transition hover:text-slate-800">
          Cancel
        </button>
        <button onClick={submit} className="btn-primary px-4 py-2">
          Rename
        </button>
      </div>
    </Modal>
  );
}
