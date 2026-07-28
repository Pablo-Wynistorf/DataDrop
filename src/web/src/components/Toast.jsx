import { createContext, useCallback, useContext, useState } from "react";
import { Check, Close, Info, Warning } from "./icons.jsx";

const ToastContext = createContext(() => {});

export function useToast() {
  return useContext(ToastContext);
}

const styles = {
  success: "bg-emerald-500",
  error: "bg-rose-500",
  info: "bg-brand-600",
  warning: "bg-amber-500",
};
const icons = { success: Check, error: Close, info: Info, warning: Warning };

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const remove = useCallback((id) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const showToast = useCallback(
    (message, type = "info", duration = 4000) => {
      const id = Math.random().toString(36).slice(2);
      setToasts((t) => [...t, { id, message, type }]);
      if (duration > 0) setTimeout(() => remove(id), duration);
    },
    [remove]
  );

  return (
    <ToastContext.Provider value={showToast}>
      {children}
      <div className="fixed top-4 right-4 z-[60] flex flex-col gap-2">
        {toasts.map((t) => {
          const TypeIcon = icons[t.type] || icons.info;
          return (
            <div
              key={t.id}
              className={`animate-slideIn flex min-w-[280px] max-w-md items-center gap-3 rounded-xl px-4 py-3 text-white shadow-lg ${styles[t.type] || styles.info}`}
            >
              <TypeIcon className="h-5 w-5 shrink-0" />
              <span className="flex-1 text-sm">{t.message}</span>
              <button onClick={() => remove(t.id)} className="text-white/80 hover:text-white">
                <Close className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
