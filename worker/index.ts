import { Hono } from "hono";
import type { Env } from "./env";
import { requireAccess } from "./access";
import { recipes } from "./routes/recipes";
import { settings } from "./routes/settings";

const app = new Hono<{ Bindings: Env }>();

app.use("/api/*", requireAccess);

app.get("/api/health", async (c) => {
  const row = await c.env.DB.prepare("SELECT COUNT(*) AS recipes FROM recipes").first<{
    recipes: number;
  }>();
  return c.json({ ok: true, recipes: row?.recipes ?? 0 });
});

app.get("/api/tags", async (c) => {
  const { results } = await c.env.DB.prepare(
    "SELECT name, kind FROM tags ORDER BY kind, name COLLATE NOCASE"
  ).all();
  return c.json(results);
});

app.route("/api/recipes", recipes);
app.route("/api/settings", settings);

app.notFound((c) => c.json({ error: "Not found" }, 404));

export default app;
