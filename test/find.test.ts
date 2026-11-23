import { describe, expect, it } from "vitest";
import { parseFoundText } from "../worker/ai";

describe("parseFoundText", () => {
  it("reads a fenced JSON answer", () => {
    const text = 'Here you go:\n```json\n{"options":[{"title":"Classic Pie","url":"https://example.com/pie","site":"Example","summary":"Simple.","minutes":90},{"title":"Bad","url":"not a link"}]}\n```';
    expect(parseFoundText(text)).toEqual([{ title: "Classic Pie", url: "https://example.com/pie", site: "Example", summary: "Simple.", minutes: 90 }]);
  });
  it("reads bare JSON and fills in the site", () => {
    expect(parseFoundText('{"options":[{"title":"Tart","url":"https://www.example.org/tart"}]}')).toEqual([
      { title: "Tart", url: "https://www.example.org/tart", site: "example.org", summary: "", minutes: null }
    ]);
  });
  it("gives null for text it can't read", () => {
    expect(parseFoundText("Sorry, nothing found.")).toBeNull();
  });
});
