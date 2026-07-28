import { Image, Film, Music, Archive, Code, Doc } from "./icons.jsx";
import { getFileCategory } from "../lib/fileFilters.js";

// Maps a file category to a tinted tile + glyph, the way OneDrive shows
// meaningful per-type icons instead of one generic badge for everything.
const STYLES = {
  image: { icon: Image, tile: "bg-purple-100", glyph: "text-purple-500" },
  video: { icon: Film, tile: "bg-rose-100", glyph: "text-rose-500" },
  audio: { icon: Music, tile: "bg-pink-100", glyph: "text-pink-500" },
  document: { icon: Doc, tile: "bg-blue-100", glyph: "text-blue-500" },
  archive: { icon: Archive, tile: "bg-amber-100", glyph: "text-amber-500" },
  code: { icon: Code, tile: "bg-emerald-100", glyph: "text-emerald-500" },
  other: { icon: Doc, tile: "bg-slate-100", glyph: "text-slate-400" },
};

export default function FileIcon({ file, className = "h-10 w-10" }) {
  const category = getFileCategory(file.fileName, file.fileType);
  const { icon: Glyph, tile, glyph } = STYLES[category] || STYLES.other;
  return (
    <div className={`flex flex-shrink-0 items-center justify-center rounded-lg ${tile} ${className}`}>
      <Glyph className={`h-5 w-5 ${glyph}`} />
    </div>
  );
}
