import { describe, expect, it } from "vitest";
import { findTimes, formatClock } from "../shared/timers";

describe("findTimes", () => {
  it("finds simple and ranged times, using the longer end", () => {
    expect(findTimes("Bake for 25 minutes.").map((t) => t.seconds)).toEqual([1500]);
    expect(findTimes("Simmer 10–15 mins, then rest 5 min").map((t) => t.seconds)).toEqual([900, 300]);
  });
  it("handles hours with minutes and 'an hour'", () => {
    expect(findTimes("Roast 1 hour 15 minutes").map((t) => t.seconds)).toEqual([4500]);
    expect(findTimes("Chill for an hour").map((t) => t.seconds)).toEqual([3600]);
    expect(findTimes("Prove 1.5 hrs").map((t) => t.seconds)).toEqual([5400]);
  });
  it("ignores things that aren't times", () => {
    expect(findTimes("Add 200 g butter and 2 eggs")).toEqual([]);
    expect(findTimes("Stir for a minute")).toEqual([]);
  });
  it("formats a countdown", () => {
    expect(formatClock(65)).toBe("1:05");
    expect(formatClock(3725)).toBe("1:02:05");
  });
});
