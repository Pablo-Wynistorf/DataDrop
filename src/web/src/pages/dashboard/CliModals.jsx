import Modal from "../../components/Modal.jsx";
import { Terminal, Copy } from "../../components/icons.jsx";

const COMMANDS = [
  ["login", "Authenticate with DataDrop"],
  ["logout", "Remove stored credentials"],
  ["status", "Show login status"],
  ["upload", "Upload a file"],
  ["download", "Download a file"],
  ["list", "List all files"],
  ["info", "Show detailed file information"],
  ["get-url", "Get shareable URL"],
  ["rename", "Rename a file"],
  ["convert", "Convert between private and CDN storage"],
  ["delete", "Delete a file"],
  ["create-upload-url", "Create an upload URL for external users"],
  ["list-upload-urls", "List your upload URL projects"],
  ["delete-upload-url", "Delete an upload URL project"],
  ["update", "Update the CLI to the latest version"],
  ["completion", "Generate shell completion script"],
];

export function CliModal({ onClose, toast }) {
  const origin = window.location.origin;
  const installCmd = `curl -fsSL ${origin}/install.sh | bash`;

  return (
    <Modal
      open
      onClose={onClose}
      maxWidth="max-w-lg"
      title="DataDrop CLI"
      icon={<Terminal className="h-5 w-5 text-brand-600" />}
    >
      <p className="mb-6 text-sm text-slate-500">Upload and manage files from your terminal.</p>

      <div className="mb-6">
        <h4 className="mb-3 text-sm font-medium text-slate-600">Install (macOS / Linux)</h4>
        <div className="relative rounded-xl bg-slate-900 p-4">
          <code className="block break-all pr-8 font-mono text-xs text-emerald-400 sm:text-sm">{installCmd}</code>
          <button
            onClick={() =>
              navigator.clipboard.writeText(installCmd).then(() => toast("Install command copied!", "success"))
            }
            className="absolute right-3 top-3 text-slate-400 transition hover:text-white"
            title="Copy"
          >
            <Copy className="h-5 w-5" />
          </button>
        </div>
        <p className="mt-2 text-xs text-slate-400">Automatically detects your OS and architecture.</p>
      </div>

      <div className="mb-6">
        <h4 className="mb-3 text-sm font-medium text-slate-600">Quick Start</h4>
        <div className="space-y-2 overflow-x-auto rounded-xl bg-slate-900 p-4 font-mono text-xs sm:text-sm">
          <p className="text-slate-400"># Login to DataDrop</p>
          <p className="whitespace-nowrap text-emerald-400">
            datadrop login --api <span className="text-brand-400">{origin}</span>
          </p>
          <p className="mt-3 text-slate-400"># Upload a file</p>
          <p className="text-emerald-400">datadrop upload myfile.txt</p>
          <p className="mt-3 text-slate-400"># List your files</p>
          <p className="text-emerald-400">datadrop list</p>
          <p className="mt-3 text-slate-400"># Get share URL</p>
          <p className="text-emerald-400">datadrop get-url --name myfile.txt</p>
        </div>
      </div>

      <div>
        <h4 className="mb-3 text-sm font-medium text-slate-600">Commands</h4>
        <div className="space-y-2 rounded-xl bg-slate-50 p-4 text-xs sm:text-sm">
          {COMMANDS.map(([cmd, desc]) => (
            <div key={cmd} className="flex justify-between gap-2">
              <span className="text-brand-600">{cmd}</span>
              <span className="text-right text-slate-400">{desc}</span>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}

export function CliAuthModal({ code, onAuthorize, onClose }) {
  return (
    <Modal open onClose={onClose} title="Authorize CLI" icon={<Terminal className="h-5 w-5 text-brand-600" />}>
      <div className="mb-6 rounded-xl border border-brand-200 bg-brand-50 p-4">
        <p className="mb-2 text-sm text-brand-700">A CLI application is requesting access to your account.</p>
        <p className="text-xs text-brand-600/80">Verification code:</p>
        <p className="mt-1 font-mono text-2xl font-bold text-slate-900">{code.substring(0, 8).toUpperCase()}</p>
      </div>
      <p className="mb-4 text-sm text-slate-500">
        Make sure this code matches what's shown in your terminal before authorizing.
      </p>
      <div className="flex justify-end gap-3">
        <button onClick={onClose} className="px-4 py-2 text-slate-500 transition hover:text-slate-800">
          Cancel
        </button>
        <button onClick={onAuthorize} className="btn-primary px-4 py-2">
          Authorize
        </button>
      </div>
    </Modal>
  );
}
