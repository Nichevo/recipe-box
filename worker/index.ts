import { Hono } from "hono";
import type { Env } from "./env";
import { requireAccess } from "./access";
import { recipes } from "./routes/recipes";
import { settings } from "./routes/settings";
import { photos } from "./routes/photos";
import { webImport } from "./routes/web-import";
import { ai } from "./routes/ai";
import { grocery, pantry, shopping } from "./routes/kitchen";
import { plan } from "./routes/plan";
import { backup } from "./routes/backup";
import { dropboxConfigured, runBackup } from "./backup";
import { fodmap } from "./routes/fodmap";
import { applyGuide, refreshRecipeRatings } from "./fodmap";
import { nightlySync } from "./grocery-sync";

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
    `SELECT t.name, t.kind, (SELECT COUNT(*) FROM recipe_tags rt WHERE rt.tag_id = t.id) AS count
     FROM tags t ORDER BY t.kind, t.name COLLATE NOCASE`
  ).all();
  return c.json(results);
});

app.route("/api/recipes", recipes);
app.route("/api/settings", settings);
app.route("/api/photos", photos);
app.route("/api/import", webImport);
app.route("/api/ai", ai);
app.route("/api/grocery", grocery);
app.route("/api/pantry", pantry);
app.route("/api/shopping", shopping);
app.route("/api/plan", plan);
app.route("/api/backup", backup);
app.route("/api/fodmap", fodmap);

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: "Something went wrong" }, 500);
});

app.notFound((c) => c.json({ error: "Not found" }, 404));

export default {
  fetch: app.fetch,
  /** Nightly cron (see wrangler.jsonc): pick up new rows from the grocery sheet. */
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(nightlySync(env).catch((e) => console.error("Grocery sync failed:", e)));
    // Back up to Dropbox when it's connected (errors are shown in Settings).
    if (dropboxConfigured(env)) ctx.waitUntil(runBackup(env).catch((e) => console.error("Backup failed:", e.message)));
    // Rate any new ingredients from the built-in FODMAP guide.
    ctx.waitUntil(
      applyGuide(env.DB)
        .then((n) => (n ? refreshRecipeRatings(env.DB) : undefined))
        .catch((e) => console.error("FODMAP update failed:", e))
    );
  }
} satisfies ExportedHandler<Env>;
