import { describe, expect, it } from "vitest";
import { lookupFodmap } from "../shared/fodmap-guide";

const r = (n: string) => lookupFodmap(n)?.rating ?? null;

describe("lookupFodmap", () => {
  it("rates common ingredients", () => {
    expect(r("garlic cloves")).toBe("high");
    expect(r("garlic-infused oil")).toBe("low");
    expect(r("brown onions")).toBe("high");
    expect(r("self-raising flour")).toBe("high");
    expect(r("rice flour")).toBe("low");
    expect(r("almond milk")).toBe("low");
    expect(r("milk")).toBe("high");
    expect(r("peanut butter")).toBe("low");
    expect(r("butternut pumpkin")).toBe("moderate");
    expect(r("cherry tomatoes")).toBe("low");
    expect(r("cherries")).toBe("high");
    expect(r("green beans")).toBe("low");
    expect(r("kidney beans")).toBe("high");
    expect(r("dark chocolate")).toBe("low");
  });
  it("gives groups and a swap", () => {
    const g = lookupFodmap("honey");
    expect(g?.groups).toEqual(["fructose"]);
    expect(g?.swap).toMatch(/maple/);
  });
  it("leaves unknown things alone", () => {
    expect(lookupFodmap("dragon fruit powder")).toBeNull();
  });
});
