/** Finds cooking times in a step ("bake for 25–30 minutes", "1 hour 15 min") to offer as timers. */
export interface FoundTime {
  label: string;
  seconds: number;
}

const UNIT_SECONDS: [RegExp, number][] = [
  [/^h(?:ou)?rs?$/i, 3600],
  [/^m(?:in(?:ute)?s?)?$/i, 60],
  [/^s(?:ec(?:ond)?s?)?$/i, 1]
];

const unitSeconds = (u: string) => UNIT_SECONDS.find(([re]) => re.test(u))?.[1] ?? null;

export function findTimes(text: string): FoundTime[] {
  const out: FoundTime[] = [];
  const re =
    /(?<![\w.])(\d+(?:[.,]\d+)?|½|an?)(?:\s*(?:-|–|to)\s*(\d+(?:[.,]\d+)?))?\s*(hours?|hrs?|h|minutes?|mins?|seconds?|secs?)\b(?:\s*(?:and\s*)?(\d+)\s*(minutes?|mins?|m)\b)?/gi;
  for (const m of text.matchAll(re)) {
    const unit = unitSeconds(m[3]!);
    if (!unit) continue;
    const n = (s: string) => (s === "½" ? 0.5 : /^an?$/i.test(s) ? 1 : Number(s.replace(",", ".")));
    const low = n(m[1]!);
    const high = m[2] ? n(m[2]) : low;
    const extra = m[4] ? Number(m[4]) * 60 : 0;
    const seconds = Math.round(Math.max(low, high) * unit + extra);
    if (!Number.isFinite(seconds) || seconds < 30 || seconds > 48 * 3600) continue;
    if (/^an?$/i.test(m[1]!) && unit !== 3600) continue; // "a minute" isn't worth a timer; "an hour" is
    out.push({ label: m[0].trim(), seconds });
  }
  return out.filter((t, i) => out.findIndex((x) => x.seconds === t.seconds) === i);
}

export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}
