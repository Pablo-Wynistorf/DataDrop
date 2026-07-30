import { useCallback, useEffect, useState } from "react";
import Background from "../components/Background.jsx";
import Logo from "../components/Logo.jsx";
import { useToast } from "../components/Toast.jsx";
import { Cog, Search, Check, Lock, Globe, Refresh } from "../components/icons.jsx";
import { API_URL, apiFetch, jsonBody } from "../lib/api.js";
import { formatFileSize, formatDate } from "../lib/format.js";

const GB = 1024 * 1024 * 1024;

// Size presets offered in the dropdown. Any other stored value is preserved
// and shown as an extra option so an admin never silently changes a limit.
const SIZE_PRESETS_GB = [1, 2, 5, 10, 25, 50, 100, 250, 500, 1024];

function UserRow({ user, onSave, saving }) {
  const [canUploadFile, setCanUploadFile] = useState(user.canUploadFile);
  const [canUploadCdn, setCanUploadCdn] = useState(user.canUploadCdn);
  const [maxFileSizeBytes, setMaxFileSizeBytes] = useState(user.maxFileSizeBytes);

  // Reset local edits whenever the underlying record changes (e.g. after a
  // reload or a successful save).
  useEffect(() => {
    setCanUploadFile(user.canUploadFile);
    setCanUploadCdn(user.canUploadCdn);
    setMaxFileSizeBytes(user.maxFileSizeBytes);
  }, [user]);

  const dirty =
    canUploadFile !== user.canUploadFile ||
    canUploadCdn !== user.canUploadCdn ||
    maxFileSizeBytes !== user.maxFileSizeBytes;

  const presetValues = SIZE_PRESETS_GB.map((gb) => gb * GB);
  const options = presetValues.includes(maxFileSizeBytes)
    ? presetValues
    : [...presetValues, maxFileSizeBytes].sort((a, b) => a - b);

  return (
    <div className="border-t border-slate-100 px-5 py-4 first:border-t-0">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-700">
            {(user.name || user.email || user.userId || "?").charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="truncate font-medium text-slate-900">{user.name || user.email || user.userId}</div>
            <div className="truncate text-xs text-slate-500">
              {user.email && user.email !== user.name ? `${user.email} · ` : ""}
              {user.userId}
            </div>
            {user.lastLoginAt && (
              <div className="text-xs text-slate-400">Last login {formatDate(user.lastLoginAt)}</div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
              checked={canUploadFile}
              onChange={(e) => setCanUploadFile(e.target.checked)}
            />
            <Lock className="h-4 w-4 text-slate-400" />
            Private files
          </label>

          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
              checked={canUploadCdn}
              onChange={(e) => setCanUploadCdn(e.target.checked)}
            />
            <Globe className="h-4 w-4 text-slate-400" />
            CDN uploads
          </label>

          <label className="flex items-center gap-2 text-sm text-slate-700">
            <span className="text-slate-500">Max size</span>
            <select
              className="field w-auto py-1.5 text-sm"
              value={maxFileSizeBytes}
              onChange={(e) => setMaxFileSizeBytes(Number(e.target.value))}
            >
              {options.map((bytes) => (
                <option key={bytes} value={bytes}>
                  {formatFileSize(bytes)}
                </option>
              ))}
            </select>
          </label>

          <button
            className="btn-primary px-4 py-2 text-sm disabled:cursor-not-allowed"
            disabled={!dirty || saving}
            onClick={() => onSave(user.userId, { canUploadFile, canUploadCdn, maxFileSizeBytes })}
          >
            <Check className="h-4 w-4" />
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Admin() {
  const toast = useToast();
  const [view, setView] = useState("loading"); // loading | denied | login | main
  const [users, setUsers] = useState([]);
  const [query, setQuery] = useState("");
  const [savingId, setSavingId] = useState(null);

  const loadUsers = useCallback(async () => {
    const { res, data } = await apiFetch("/admin/users");
    if (res.ok && data) {
      setUsers(data.users);
      return true;
    }
    if (res.status === 403) {
      setView("denied");
      return false;
    }
    toast(data?.error || "Failed to load users", "error");
    return false;
  }, [toast]);

  useEffect(() => {
    (async () => {
      try {
        let res = await fetch(`${API_URL}/auth/verify`, { credentials: "include" });
        if (res.status === 401) {
          const refresh = await fetch(`${API_URL}/auth/refresh`, { method: "POST", credentials: "include" });
          if (refresh.ok) res = await fetch(`${API_URL}/auth/verify`, { credentials: "include" });
        }
        if (!res.ok) {
          setView("login");
          return;
        }
        const me = await res.json();
        if (!me.isAdmin) {
          setView("denied");
          return;
        }
        if (await loadUsers()) setView("main");
      } catch {
        setView("login");
      }
    })();
  }, [loadUsers]);

  async function saveUser(userId, permissions) {
    setSavingId(userId);
    const { res, data } = await apiFetch(`/admin/users/${encodeURIComponent(userId)}`, {
      method: "PUT",
      ...jsonBody({
        canUploadCdn: permissions.canUploadCdn,
        canUploadFile: permissions.canUploadFile,
        maxFileSizeBytes: permissions.maxFileSizeBytes,
      }),
    });
    setSavingId(null);

    if (res.ok && data?.user) {
      setUsers((list) => list.map((u) => (u.userId === userId ? data.user : u)));
      toast("Permissions updated", "success");
    } else {
      toast(data?.error || "Failed to update permissions", "error");
    }
  }

  if (view === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Background />
        <div className="spinner h-12 w-12" />
      </div>
    );
  }

  if (view === "login" || view === "denied") {
    return (
      <div className="relative flex min-h-screen items-center justify-center p-4">
        <Background />
        <div className="card relative z-10 w-full max-w-md p-8 text-center">
          <div className="mb-6 flex justify-center">
            <Logo />
          </div>
          <h1 className="mb-2 text-xl font-semibold text-slate-900">
            {view === "login" ? "Sign in required" : "Admin access required"}
          </h1>
          <p className="mb-6 text-slate-600">
            {view === "login"
              ? "Sign in with your account to continue."
              : "Your account does not have the admin role. Ask an administrator to grant it in OneIDP."}
          </p>
          {view === "login" ? (
            <a href={`${API_URL}/auth/login`} className="btn-primary w-full">
              Sign in
            </a>
          ) : (
            <a href="/" className="btn-ghost w-full">
              Back to DataDrop
            </a>
          )}
        </div>
      </div>
    );
  }

  const filtered = users.filter((u) => {
    if (!query.trim()) return true;
    const q = query.trim().toLowerCase();
    return [u.name, u.email, u.userId].some((v) => v && v.toLowerCase().includes(q));
  });

  return (
    <div className="relative min-h-screen">
      <Background />
      <div className="container relative z-10 mx-auto max-w-5xl px-4 py-8">
        <header className="mb-8 flex items-center justify-between gap-3">
          <Logo />
          <div className="flex items-center gap-1 sm:gap-2">
            <button onClick={loadUsers} className="header-action" title="Reload users">
              <Refresh className="h-4 w-4" />
              <span className="hidden sm:inline">Reload</span>
            </button>
            <a href="/" className="header-action" title="Back to DataDrop">
              <span>Dashboard</span>
            </a>
          </div>
        </header>

        <div className="card p-6">
          <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
                <Cog className="h-5 w-5 text-slate-400" />
                User permissions
              </h1>
              <p className="mt-1 text-sm text-slate-500">
                Users appear here after their first sign-in. Permissions apply to both the web app and the CLI.
              </p>
            </div>
            <div className="relative sm:w-64">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                className="field pl-9"
                placeholder="Search users"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl ring-1 ring-slate-900/5">
            {filtered.length === 0 ? (
              <p className="px-5 py-10 text-center text-sm text-slate-500">
                {users.length === 0 ? "No users have signed in yet." : "No users match your search."}
              </p>
            ) : (
              filtered.map((user) => (
                <UserRow
                  key={user.userId}
                  user={user}
                  onSave={saveUser}
                  saving={savingId === user.userId}
                />
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
