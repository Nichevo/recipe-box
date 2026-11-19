import type { FodmapRating } from "../shared/types";
import type { DisplayMode } from "../shared/units";

const FODMAP_LABEL: Record<FodmapRating, string> = {
  low: "Low FODMAP",
  moderate: "Moderate FODMAP",
  high: "High FODMAP"
};

export function FodmapBadge({ rating }: { rating: FodmapRating }) {
  return <span className={`badge fodmap-${rating}`}>{FODMAP_LABEL[rating]}</span>;
}

export function UnitsToggle({ mode, onChange }: { mode: DisplayMode; onChange: (m: DisplayMode) => void }) {
  const options: [DisplayMode, string][] = [
    ["as_written", "As written"],
    ["metric", "Metric"],
    ["imperial", "Imperial"]
  ];
  return (
    <div className="segmented" role="group" aria-label="Units">
      {options.map(([value, label]) => (
        <button key={value} className={mode === value ? "on" : ""} onClick={() => onChange(value)}>
          {label}
        </button>
      ))}
    </div>
  );
}
