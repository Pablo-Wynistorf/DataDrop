import { UploadCloud } from "./icons.jsx";

// Brand mark: gradient rounded square with the upload glyph, plus wordmark.
export default function Logo({ size = "md", withText = true }) {
  const box =
    size === "lg" ? "h-16 w-16 rounded-2xl" : size === "sm" ? "h-9 w-9 rounded-xl" : "h-11 w-11 rounded-2xl";
  const icon = size === "lg" ? "w-8 h-8" : "w-5 h-5";
  return (
    <div className="flex items-center gap-3">
      <div
        className={`${box} flex items-center justify-center bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-[0_12px_30px_-10px_rgba(37,99,235,0.7)]`}
      >
        <UploadCloud className={icon} />
      </div>
      {withText && (
        <span className="text-xl font-extrabold tracking-tight text-slate-900">DataDrop</span>
      )}
    </div>
  );
}
