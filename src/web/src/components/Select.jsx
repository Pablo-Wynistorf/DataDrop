import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Check } from "./icons.jsx";

// A styled, accessible dropdown that replaces the native <select>. The list is
// rendered in a portal with fixed positioning so it is never clipped by a
// modal's overflow, and it flips upward when there isn't room below.
export default function Select({ value, onChange, options, placeholder = "Select…", className = "" }) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0, width: 0, flip: false });
  const btnRef = useRef(null);
  const listRef = useRef(null);

  const selected = options.find((o) => o.value === value);
  const ITEM_HEIGHT = 40;

  const position = () => {
    if (!btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    const estHeight = Math.min(options.length, 6) * ITEM_HEIGHT + 8;
    const spaceBelow = window.innerHeight - r.bottom;
    const flip = spaceBelow < estHeight + 8 && r.top > spaceBelow;
    setCoords({
      top: flip ? r.top - 6 : r.bottom + 6,
      left: r.left,
      width: r.width,
      flip,
    });
  };

  useLayoutEffect(() => {
    if (open) position();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (
        btnRef.current && !btnRef.current.contains(e.target) &&
        listRef.current && !listRef.current.contains(e.target)
      ) {
        setOpen(false);
      }
    };
    const close = () => setOpen(false);
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  const onKeyDown = (e) => {
    if (e.key === "Escape") return setOpen(false);
    if (!open && (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      return setOpen(true);
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const idx = options.findIndex((o) => o.value === value);
      const next = e.key === "ArrowDown" ? Math.min(options.length - 1, idx + 1) : Math.max(0, idx - 1);
      onChange(options[next].value);
    }
  };

  return (
    <>
      <button
        type="button"
        ref={btnRef}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`field flex w-full items-center justify-between gap-2 text-left ${
          open ? "border-brand-500 bg-white ring-2 ring-brand-500/30" : ""
        } ${className}`}
      >
        <span className={selected ? "text-slate-800" : "text-slate-400"}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown className={`h-4 w-4 flex-shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open &&
        createPortal(
          <ul
            ref={listRef}
            role="listbox"
            style={{
              position: "fixed",
              top: coords.flip ? undefined : coords.top,
              bottom: coords.flip ? window.innerHeight - coords.top : undefined,
              left: coords.left,
              width: coords.width,
            }}
            className="z-[60] max-h-60 overflow-auto rounded-xl border border-slate-100 bg-white py-1 shadow-lg ring-1 ring-slate-900/5"
          >
            {options.map((o) => {
              const active = o.value === value;
              return (
                <li key={o.value + o.label} role="option" aria-selected={active}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange(o.value);
                      setOpen(false);
                    }}
                    className={`flex w-full items-center justify-between gap-2 px-3.5 py-2 text-left text-sm transition-colors ${
                      active ? "bg-brand-50 text-brand-700" : "text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    <span className="truncate">{o.label}</span>
                    {active && <Check className="h-4 w-4 flex-shrink-0 text-brand-600" />}
                  </button>
                </li>
              );
            })}
          </ul>,
          document.body
        )}
    </>
  );
}
