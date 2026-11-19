import { describe, expect, it } from "vitest";
import { cleanText, firstUrl, isoMinutes, parseRecipeHtml } from "../shared/web-recipe";

const page = (ld: unknown, head = "") => `<html><head>${head}
<script type="application/ld+json">${JSON.stringify(ld)}</script></head><body></body></html>`;

describe("helpers", () => {
  it("reads ISO durations", () => {
    expect(isoMinutes("PT1H30M")).toBe(90);
    expect(isoMinutes("PT20M")).toBe(20);
    expect(isoMinutes("P0DT0H45M")).toBe(45);
    expect(isoMinutes("soon")).toBeNull();
  });
  it("cleans html text", () => {
    expect(cleanText("1 &frac12; cups <b>flour</b>&nbsp;")).toBe("1 ½ cups flour");
    expect(cleanText("Bake at 180&#176;C")).toBe("Bake at 180°C");
  });
  it("finds a link in shared text", () => {
    expect(firstUrl("Try this! https://example.com/r/1?x=2.")).toBe("https://example.com/r/1?x=2");
    expect(firstUrl("no link")).toBeNull();
  });
});

describe("parseRecipeHtml", () => {
  it("reads a schema.org recipe inside @graph", () => {
    const html = page(
      {
        "@context": "https://schema.org",
        "@graph": [
          { "@type": "WebPage", name: "x" },
          {
            "@type": ["Recipe"],
            name: "Tomato Soup",
            description: "A simple soup.",
            image: [{ "@type": "ImageObject", url: "https://example.com/soup.jpg" }],
            recipeYield: ["4", "4 bowls"],
            prepTime: "PT10M",
            cookTime: "PT30M",
            recipeIngredient: ["1 kg tomatoes", "1 onion, chopped"],
            recipeInstructions: [
              { "@type": "HowToSection", name: "Soup", itemListElement: [{ "@type": "HowToStep", text: "Cook onion." }, { "@type": "HowToStep", text: "Add tomatoes." }] },
              { "@type": "HowToStep", text: "Blend &amp; serve." }
            ],
            recipeCategory: "Main",
            recipeCuisine: ["Italian"],
            suitableForDiet: "https://schema.org/VegetarianDiet"
          }
        ]
      },
      '<meta property="og:site_name" content="Example Kitchen">'
    );
    const r = parseRecipeHtml(html, "https://example.com/soup");
    expect(r).toMatchObject({
      title: "Tomato Soup",
      summary: "A simple soup.",
      servings: 4,
      prepMinutes: 10,
      cookMinutes: 30,
      ingredientsText: "1 kg tomatoes\n1 onion, chopped",
      steps: ["Soup: Cook onion.", "Add tomatoes.", "Blend & serve."],
      imageUrl: "https://example.com/soup.jpg",
      sourceName: "Example Kitchen",
      complete: true
    });
    expect(r.hints).toEqual(["Main", "Italian", "Vegetarian"]);
  });

  it("splits plain-text instructions", () => {
    const r = parseRecipeHtml(
      page({ "@type": "Recipe", name: "Toast", recipeIngredient: ["bread"], recipeInstructions: "1. Toast it.\n2. Butter it." }),
      "https://example.com/t"
    );
    expect(r.steps).toEqual(["Toast it.", "Butter it."]);
  });

  it("falls back to the page title and image", () => {
    const html = `<html><head><title>Nice Cake | Blog</title><meta property="og:image" content="https://example.com/c.jpg"></head></html>`;
    const r = parseRecipeHtml(html, "https://www.example.com/cake");
    expect(r).toMatchObject({ title: "Nice Cake | Blog", imageUrl: "https://example.com/c.jpg", sourceName: "example.com", complete: false });
  });
});
