import { describe, expect, it } from "vitest";
import { cleanTitle, parseNotionExport, parseRecipePage, resolveLink } from "../shared/notion-import";

const ROOT = "Food 00000000000000000000000000000001";
const CAT = `${ROOT}/Baking 00000000000000000000000000000002`;

describe("resolveLink", () => {
  it("decodes and resolves relative to the page", () => {
    expect(resolveLink("A b/Page 1.md", "Page%201/Untitled.png")).toBe("A b/Page 1/Untitled.png");
  });
});

describe("cleanTitle", () => {
  it("strips prefixes and site names", () => {
    expect(cleanTitle("Recipe: Oat Pancakes")).toEqual({ title: "Oat Pancakes", sourceName: null });
    expect(cleanTitle("Lighter pie recipe \\| Some Site")).toEqual({ title: "Lighter pie recipe", sourceName: "Some Site" });
    expect(cleanTitle("**SIMPLE FLATBREAD**").title).toBe("Simple Flatbread");
    expect(cleanTitle("AD/Tomato bake.").title).toBe("Tomato bake");
  });
});

describe("parseRecipePage", () => {
  it("reads headed sections, joins split amounts and links photos", () => {
    const files = new Set(["Crackers 1/Untitled.png"]);
    const md = [
      "![Untitled](Crackers%201/Untitled.png)",
      "",
      "Crunchy and easy.",
      "",
      "**Ingredients**",
      "",
      "Serves 4",
      "",
      "1 large egg",
      "",
      "2 tablespoons",
      "",
      "[chia seeds](http://example.com/x)",
      "",
      "½ teaspoon salt",
      "",
      "**Directions**",
      "",
      "1. Mix everything.",
      "2. Bake at 160°C.",
      "",
      "**Notes**",
      "",
      "Keeps a week."
    ].join("\n");
    const r = parseRecipePage(md, "Crackers 1.md", files);
    expect(r.heroImage).toBe("Crackers 1/Untitled.png");
    expect(r.summary).toBe("Crunchy and easy.");
    expect(r.servings).toBe(4);
    expect(r.ingredientsText).toBe("1 large egg\n2 tablespoons chia seeds\n½ teaspoon salt");
    expect(r.steps.map((s) => s.text)).toEqual(["Mix everything.", "Bake at 160°C."]);
    expect(r.notes).toBe("Keeps a week.");
    expect(r.warnings).toEqual([]);
  });

  it("keeps sub-groups and step photos", () => {
    const md = [
      "## Ingredients",
      "- 1 cup flour",
      "For the icing:",
      "- 1 cup icing sugar",
      "## Method",
      "- Make the cake.",
      "![](https://example.com/step.jpg)",
      "- Ice it."
    ].join("\n");
    const r = parseRecipePage(md, "Cake.md", new Set());
    expect(r.ingredientsText).toBe("1 cup flour\nFor the icing:\n1 cup icing sugar");
    expect(r.steps).toEqual([{ text: "Make the cake.", image: "https://example.com/step.jpg" }, { text: "Ice it." }]);
  });

  it("guesses structure when there are no headings", () => {
    const md = ["Quick one.", "- 2 eggs", "- 1 cup milk", "1. Whisk.", "2. Cook."].join("\n");
    const r = parseRecipePage(md, "X.md", new Set());
    expect(r.ingredientsText).toBe("2 eggs\n1 cup milk");
    expect(r.steps.map((s) => s.text)).toEqual(["Whisk.", "Cook."]);
    expect(r.summary).toBe("Quick one.");
  });

  it("finds the source link", () => {
    const r = parseRecipePage("URL: https://example.com/r\n\n## Ingredients\n- 1 egg\n## Method\n- Cook", "X.md", new Set());
    expect(r.sourceUrl).toBe("https://example.com/r");
  });
});

describe("parseNotionExport", () => {
  it("skips category pages, tags by folder and group, and keys by page id", () => {
    const pages = [
      { path: `${ROOT}.md`, text: `# Food\n\n[Baking](Food%2000000000000000000000000000000001/Baking%2000000000000000000000000000000002.md)` },
      {
        path: `${CAT}.md`,
        text: `# Baking\n\nKeto:\n\n[Almond cake](Baking%2000000000000000000000000000000002/Almond%20cake%20aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.md)\n\nGeneral:\n\n[Scones](Baking%2000000000000000000000000000000002/Scones%20bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.md)`
      },
      { path: `${CAT}/Almond cake aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.md`, text: "# Almond cake\n\n## Ingredients\n- 2 cups almond flour\n## Method\n- Bake" },
      { path: `${CAT}/Scones bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.md`, text: "# Scones\n\n## Ingredients\n- 2 cups flour\n## Method\n- Bake" }
    ];
    const r = parseNotionExport(pages, new Set());
    expect(r.map((x) => x.title)).toEqual(["Almond cake", "Scones"]);
    expect(r[0]!.tags).toEqual(["Baking", "Keto"]);
    expect(r[1]!.tags).toEqual(["Baking"]);
    expect(r[0]!.key).toBe("notion:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
  });
});
