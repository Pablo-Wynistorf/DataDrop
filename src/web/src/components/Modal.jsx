import { Close } from "./icons.jsx";

// Generic centered modal with a light backdrop. Clicking the backdrop closes it.
export default function Modal({ open, onClose, title, icon, children, maxWidth = "max-w-md" }) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 p-4 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={`card relative max-h-[90vh] w-full overflow-y-auto p-6 ${maxWidth}`}>
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          title="Close"
        >
          <Close className="h-5 w-5" />
        </button>
        {title && (
          <h3 className="mb-4 flex items-center gap-2 pr-8 text-lg font-semibold text-slate-900">
            {icon}
            {title}
          </h3>
        )}
        {children}
      </div>
    </div>
  );
}

// A small confirm dialog helper hook usable via <ConfirmDialog />.
export function ConfirmDialog({ open, message, confirmLabel = "Delete", onConfirm, onCancel }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[55] flex items-center justify-center bg-slate-900/30 p-4 backdrop-blur-sm">
      <div className="card w-full max-w-sm p-6">
        <p className="mb-6 text-slate-700">{message}</p>
        <div className="flex justify-end gap-3">
          <button onClick={onCancel} className="px-4 py-2 text-slate-500 transition hover:text-slate-800">
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="rounded-xl bg-rose-500 px-4 py-2 text-white transition hover:bg-rose-600"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
