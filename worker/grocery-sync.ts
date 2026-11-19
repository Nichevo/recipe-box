import { columnIndex, matchGroceryItem, parsePurchase, type Purchase } from "../shared/grocery";
import type { Env } from "./env";
import { readRange, sheetsConfigured } from "./google";

const CHUNK = 1500;
/** Nightly syncs re-read this many rows before the last one, to pick up recent edits. */
const OVERLAP = 300;

async function getSetting(db: D1Database, key: string) {
  return (await db.prepare("SELECT value FROM settings WHERE key = ?").bind(key).first<{ value: string }>())?.value ?? null;
}
const putSetting = (db: D1Database, key: string, value: string) =>
  db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(key, value);

export async function groceryStatus(env: Env) {
  const [count, last, synced] = await Promise.all([
    env.DB.prepare("SELECT COUNT(*) AS n, MAX(date) AS latest FROM purchases").first<{ n: number; latest: string | null }>(),
    getSetting(env.DB, "grocery.next_row"),
    getSetting(env.DB, "grocery.synced_at")
  ]);
  return {
    configured: sheetsConfigured(env),
    purchases: count?.n ?? 0,
    latestPurchase: count?.latest ?? null,
    nextRow: last ? Number(last) : 2,
    syncedAt: synced
  };
}

const COLS = 13; // sheet_row ... brand
function insertPurchases(db: D1Database, rows: Purchase[]): D1PreparedStatement[] {
  // D1 allows 100 bound values per statement.
  const per = Math.floor(100 / COLS);
  const stmts: D1PreparedStatement[] = [];
  for (let i = 0; i < rows.length; i += per) {
    const chunk = rows.slice(i, i + per);
    stmts.push(
      db
        .prepare(
          `INSERT OR REPLACE INTO purchases (sheet_row, date, shop, category, item, size, size_type, qty, price, total, base_amount, base_unit, brand)
           VALUES ${chunk.map(() => `(${Array(COLS).fill("?").join(",")})`).join(",")}`
        )
        .bind(
          ...chunk.flatMap((p) => [
            p.sheet_row, p.date, p.shop, p.category, p.item, p.size, p.size_type, p.qty, p.price, p.total, p.base_amount, p.base_unit, p.brand
          ])
        )
    );
  }
  return stmts;
}

/**
 * Sync one chunk of the sheet starting at row `from` (2 = first data row).
 * Returns where to carry on, and done when the end of the data is reached.
 */
export async function syncChunk(env: Env, from: number) {
  if (!sheetsConfigured(env)) throw new Error("The grocery sheet isn't connected yet. See the setup guide.");
  const tab = env.GROCERY_SHEET_TAB || "Data";
  const start = Math.max(2, Math.floor(from));
  const [header, values] = await Promise.all([readRange(env, `${tab}!1:1`), readRange(env, `${tab}!A${start}:AF${start + CHUNK - 1}`)]);
  const cols = columnIndex(header[0] ?? []);

  const keep: Purchase[] = [];
  const drop: number[] = [];
  let lastDataRow = start - 1;
  values.forEach((row, i) => {
    const sheetRow = start + i;
    const p = parsePurchase(row, cols, sheetRow);
    const hasItem = cols.item >= 0 && String(row[cols.item] ?? "").trim() !== "";
    if (hasItem) lastDataRow = sheetRow;
    if (p) keep.push(p);
    else drop.push(sheetRow);
  });
  const done = values.length < CHUNK || lastDataRow < start + CHUNK - 1 - 50;
  const next = done ? lastDataRow + 1 : start + CHUNK;

  const stmts = insertPurchases(env.DB, keep);
  // Rows that are now blank or non-food (e.g. edited in the sheet) are removed.
  for (let i = 0; i < drop.length; i += 90) {
    const ids = drop.slice(i, i + 90);
    stmts.push(env.DB.prepare(`DELETE FROM purchases WHERE sheet_row IN (${ids.map(() => "?").join(",")})`).bind(...ids));
  }
  stmts.push(putSetting(env.DB, "grocery.next_row", String(next)));
  if (done) {
    // Anything past the end of the data (e.g. rows deleted in the sheet) goes too.
    stmts.push(env.DB.prepare("DELETE FROM purchases WHERE sheet_row >= ?").bind(next));
    stmts.push(putSetting(env.DB, "grocery.synced_at", new Date().toISOString()));
  }
  for (let i = 0; i < stmts.length; i += 50) await env.DB.batch(stmts.slice(i, i + 50));
  if (done) await matchItems(env.DB);
  return { imported: keep.length, next, done };
}

/** Nightly: read the newest rows (plus a few before, in case they were edited). */
export async function nightlySync(env: Env) {
  if (!sheetsConfigured(env)) return;
  const status = await groceryStatus(env);
  let from = Math.max(2, status.nextRow - OVERLAP);
  for (let i = 0; i < 10; i++) {
    const r = await syncChunk(env, from);
    if (r.done) return;
    from = r.next;
  }
}

/**
 * Link ingredients to grocery items by name, where nobody has linked them by hand.
 * Pass item ids to match just those (e.g. new ingredients from a saved recipe).
 */
export async function matchItems(db: D1Database, itemIds?: string[]): Promise<void> {
  if (itemIds && itemIds.length > 90) {
    for (let i = 0; i < itemIds.length; i += 90) await matchItems(db, itemIds.slice(i, i + 90));
    return;
  }
  const { results: grocery } = await db
    .prepare("SELECT item FROM purchases WHERE date >= date('now', '-3 years') GROUP BY item COLLATE NOCASE ORDER BY MAX(date) DESC")
    .all<{ item: string }>();
  if (!grocery.length) return;
  const names = grocery.map((g) => g.item);
  const items = itemIds?.length
    ? (
        await db
          .prepare(`SELECT id, name, grocery_item FROM items WHERE grocery_item_manual = 0 AND id IN (${itemIds.map(() => "?").join(",")})`)
          .bind(...itemIds)
          .all<{ id: string; name: string; grocery_item: string | null }>()
      ).results
    : (await db.prepare("SELECT id, name, grocery_item FROM items WHERE grocery_item_manual = 0").all<{ id: string; name: string; grocery_item: string | null }>())
        .results;
  const updates: D1PreparedStatement[] = [];
  for (const it of items) {
    const m = matchGroceryItem(it.name, names);
    if ((m ?? null) !== (it.grocery_item ?? null)) {
      updates.push(db.prepare("UPDATE items SET grocery_item = ? WHERE id = ?").bind(m, it.id));
    }
  }
  for (let i = 0; i < updates.length; i += 50) await db.batch(updates.slice(i, i + 50));
}
