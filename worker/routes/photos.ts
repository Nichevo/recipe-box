import { Hono } from "hono";
import type { Env } from "../env";

export const photos = new Hono<{ Bindings: Env }>();

const MAX_BYTES = 15 * 1024 * 1024;
const TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "image/gif"];
const KINDS = ["hero", "step", "original_page", "gallery"];

/**
 * POST /api/photos (multipart: file, kind, optional width/height).
 * The app resizes photos before upload; the photo is linked to a recipe when
 * the recipe is saved.
 */
photos.post("/", async (c) => {
  const form = await c.req.formData().catch(() => null);
  const file = form?.get("file");
  if (!form || !file || typeof file === "string") return c.json({ error: "Expected a file" }, 400);
  if (!TYPES.includes(file.type)) return c.json({ error: "Unsupported image type" }, 400);
  if (file.size > MAX_BYTES) return c.json({ error: "Photo is too large" }, 413);
  const kindField = form.get("kind");
  const kind = typeof kindField === "string" && KINDS.includes(kindField) ? kindField : "gallery";
  const dim = (k: string) => {
    const v = Number(form.get(k));
    return Number.isFinite(v) && v > 0 ? Math.round(v) : null;
  };

  const id = crypto.randomUUID();
  const key = `photos/${id}`;
  await c.env.PHOTOS.put(key, file.stream(), { httpMetadata: { contentType: file.type } });
  await c.env.DB.prepare("INSERT INTO photos (id, kind, r2_key, width, height) VALUES (?, ?, ?, ?, ?)")
    .bind(id, kind, key, dim("width"), dim("height"))
    .run();
  return c.json({ id }, 201);
});

/**
 * POST /api/photos/from-url { url, kind }: copy an image from the web (used by
 * importers, since browsers can't read most other sites' images directly).
 */
photos.post("/from-url", async (c) => {
  const body = await c.req.json<{ url?: unknown; kind?: unknown }>().catch(() => ({}) as { url?: unknown; kind?: unknown });
  const url = typeof body.url === "string" ? body.url.trim() : "";
  if (!/^https?:\/\//i.test(url) || url.length > 2000) return c.json({ error: "Expected an image link" }, 400);
  const kind = typeof body.kind === "string" && KINDS.includes(body.kind) ? body.kind : "gallery";
  let res: Response;
  try {
    res = await fetch(url, { headers: { Accept: "image/*" }, signal: AbortSignal.timeout(15000) });
  } catch {
    return c.json({ error: "Couldn't download the image" }, 502);
  }
  const type = (res.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
  if (!res.ok || !TYPES.includes(type)) return c.json({ error: "Link is not a supported image" }, 422);
  const bytes = await res.arrayBuffer();
  if (bytes.byteLength > MAX_BYTES) return c.json({ error: "Photo is too large" }, 413);

  const id = crypto.randomUUID();
  const key = `photos/${id}`;
  await c.env.PHOTOS.put(key, bytes, { httpMetadata: { contentType: type } });
  await c.env.DB.prepare("INSERT INTO photos (id, kind, r2_key) VALUES (?, ?, ?)").bind(id, kind, key).run();
  return c.json({ id }, 201);
});

/** GET /api/photos/:id streams the image. Photo ids never change, so cache hard. */
photos.get("/:id", async (c) => {
  const row = await c.env.DB.prepare("SELECT r2_key FROM photos WHERE id = ?")
    .bind(c.req.param("id"))
    .first<{ r2_key: string }>();
  if (!row) return c.json({ error: "Not found" }, 404);
  const obj = await c.env.PHOTOS.get(row.r2_key);
  if (!obj) return c.json({ error: "Not found" }, 404);
  return new Response(obj.body, {
    headers: {
      "Content-Type": obj.httpMetadata?.contentType ?? "application/octet-stream",
      "Cache-Control": "private, max-age=31536000, immutable"
    }
  });
});

photos.delete("/:id", async (c) => {
  const row = await c.env.DB.prepare("SELECT r2_key FROM photos WHERE id = ?")
    .bind(c.req.param("id"))
    .first<{ r2_key: string }>();
  if (!row) return c.json({ ok: true });
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE recipes SET hero_photo_id = NULL WHERE hero_photo_id = ?").bind(c.req.param("id")),
    c.env.DB.prepare("UPDATE steps SET photo_id = NULL WHERE photo_id = ?").bind(c.req.param("id")),
    c.env.DB.prepare("DELETE FROM photos WHERE id = ?").bind(c.req.param("id"))
  ]);
  await c.env.PHOTOS.delete(row.r2_key);
  return c.json({ ok: true });
});
