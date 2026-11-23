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

/** "Make soon" star toggle. */
export function StarButton({ starred, onToggle, compact }: { starred: boolean; onToggle: () => void; compact?: boolean }) {
  return (
    <button
      type="button"
      className={`star${starred ? " on" : ""}${compact ? " compact" : ""}`}
      aria-pressed={starred}
      title={starred ? "Remove from Make soon" : "Make soon"}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onToggle();
      }}
    >
      {starred ? "★" : "☆"}
      {!compact && <span> Make soon</span>}
    </button>
  );
}

/** A 1–5 rating shown as hearts (the star is for "Make soon"). */
export function Hearts({ value, small }: { value: number; small?: boolean }) {
  return (
    <span className={`hearts${small ? " small" : ""}`} aria-label={`Rated ${value} out of 5`} title={`Rated ${value} out of 5`}>
      {"♥".repeat(value)}
      <span className="off">{"♥".repeat(5 - value)}</span>
    </span>
  );
}

export function HeartPicker({ value, onChange }: { value: number | null; onChange: (v: number | null) => void }) {
  return (
    <span className="heart-picker" role="radiogroup" aria-label="Rating">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} out of 5`}
          className={value !== null && n <= value ? "on" : ""}
          onClick={() => onChange(value === n ? null : n)}
        >
          ♥
        </button>
      ))}
    </span>
  );
}
