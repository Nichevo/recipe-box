import { afterEach, describe, expect, it, vi } from "vitest";
import { findRecipesOnline } from "../worker/ai";
import type { Env } from "../worker/env";

function fakeEnv(settings: Record<string, string>, extra: Partial<Env>): Env {
  const db = {
    prepare: () => ({ all: async () => ({ results: Object.entries(settings).map(([key, value]) => ({ key, value })) }) })
  };
  return { DB: db as unknown as D1Database, ...extra } as Env;
}

const brave = {
  web: {
    results: [
      { title: "Classic <strong>Pumpkin</strong> Pie", url: "https://example.com/pie", description: "A &amp; B" },
      { title: "25 Best Pies", url: "https://example.org/list", description: "Roundup" }
    ]
  }
};

afterEach(() => vi.unstubAllGlobals());

describe("findRecipesOnline with Brave", () => {
  it("lets the home PC choose from Brave's results, keeping only real result links", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      calls.push(url);
      if (url.startsWith("https://api.search.brave.com/")) {
        expect((init?.headers as Record<string, string>)["X-Subscription-Token"]).toBe("k");
        return new Response(JSON.stringify(brave));
      }
      const content = JSON.stringify({
        options: [
          { title: "Classic Pumpkin Pie", url: "https://example.com/pie", site: "Example", summary: "Spiced.", minutes: 90 },
          { title: "Made up", url: "https://invented.example/x", site: "", summary: "", minutes: null }
        ]
      });
      return new Response(JSON.stringify({ message: { content } }));
    });
    const env = fakeEnv({ "ai.claude_enabled": "false", "ai.ollama_enabled": "true", "ai.ollama_model": "m" }, { BRAVE_API_KEY: "k", OLLAMA_URL: "https://pc.example" });
    const r = await findRecipesOnline(env, "pumpkin pie");
    expect(r.via).toBe("ollama");
    expect(r.options).toEqual([{ title: "Classic Pumpkin Pie", url: "https://example.com/pie", site: "Example", summary: "Spiced.", minutes: 90 }]);
    expect(calls[1]).toBe("https://pc.example/api/chat");
  });

  it("lists Brave's results as they are when no AI is on", async () => {
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify(brave)));
    const env = fakeEnv({ "ai.claude_enabled": "false" }, { BRAVE_API_KEY: "k" });
    const r = await findRecipesOnline(env, "pumpkin pie");
    expect(r.via).toBe("brave");
    expect(r.options[0]).toEqual({ title: "Classic Pumpkin Pie", url: "https://example.com/pie", site: "example.com", summary: "A & B", minutes: null });
  });

  it("falls back to Brave's list when the PC is off and Claude isn't allowed", async () => {
    vi.stubGlobal("fetch", async (url: string) => {
      if (url.startsWith("https://api.search.brave.com/")) return new Response(JSON.stringify(brave));
      throw new Error("offline");
    });
    const env = fakeEnv({ "ai.claude_enabled": "false", "ai.ollama_enabled": "true", "ai.ollama_model": "m" }, { BRAVE_API_KEY: "k", OLLAMA_URL: "https://pc.example" });
    const r = await findRecipesOnline(env, "pumpkin pie");
    expect(r.via).toBe("brave");
    expect(r.options).toHaveLength(2);
  });

  it("says it isn't set up with neither Claude nor Brave", async () => {
    const env = fakeEnv({ "ai.claude_enabled": "true" }, {});
    await expect(findRecipesOnline(env, "pie")).rejects.toThrow(/isn't set up/);
  });
});
