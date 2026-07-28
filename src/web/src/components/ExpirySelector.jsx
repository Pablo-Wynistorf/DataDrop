import { EXPIRY_PRESETS } from "../lib/fileFilters.js";

// Controlled expiry picker. `value` shape: { mode: "preset"|"custom", preset, datetime }.
export default function ExpirySelector({ label = "Expiry", value, onChange, presets = EXPIRY_PRESETS }) {
  const set = (patch) => onChange({ ...value, ...patch });
  return (
    <div>
      <label className="label">{label}</label>
      <select className="field" value={value.mode} onChange={(e) => set({ mode: e.target.value })}>
        <option value="preset">Preset duration</option>
        <option value="custom">Custom date/time</option>
      </select>
      {value.mode === "preset" ? (
        <select
          className="field mt-2"
          value={value.preset}
          onChange={(e) => set({ preset: e.target.value })}
        >
          {presets.map((p) => (
            <option key={p.value + p.label} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          type="datetime-local"
          className="field mt-2"
          value={value.datetime}
          onChange={(e) => set({ datetime: e.target.value })}
        />
      )}
    </div>
  );
}
