import { EXPIRY_PRESETS } from "../lib/fileFilters.js";
import Select from "./Select.jsx";

const MODE_OPTIONS = [
  { value: "preset", label: "Preset duration" },
  { value: "custom", label: "Custom date/time" },
];

// Controlled expiry picker. `value` shape: { mode: "preset"|"custom", preset, datetime }.
export default function ExpirySelector({ label = "Expiry", value, onChange, presets = EXPIRY_PRESETS }) {
  const set = (patch) => onChange({ ...value, ...patch });
  return (
    <div>
      <label className="label">{label}</label>
      <Select value={value.mode} onChange={(mode) => set({ mode })} options={MODE_OPTIONS} />
      {value.mode === "preset" ? (
        <div className="mt-2">
          <Select
            value={value.preset}
            onChange={(preset) => set({ preset })}
            options={presets.map((p) => ({ value: p.value, label: p.label }))}
          />
        </div>
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
