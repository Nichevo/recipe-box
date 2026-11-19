-- Step 7: grocery purchases (synced from a spreadsheet), pantry and shopping list.

-- Placeholder tables from the first migration were never used; replace them.
DROP INDEX IF EXISTS idx_purchases_item_date;
DROP INDEX IF EXISTS idx_purchases_date;
DROP TABLE IF EXISTS purchases;
DROP TABLE IF EXISTS pantry;

-- One row per purchase line in the grocery spreadsheet, keyed by its sheet row
-- so a re-sync overwrites rather than duplicates. Personal columns (who paid,
-- invoices) are never copied.
CREATE TABLE purchases (
  sheet_row    INTEGER PRIMARY KEY,
  date         TEXT NOT NULL,                     -- YYYY-MM-DD
  shop         TEXT,
  category     TEXT,
  item         TEXT NOT NULL COLLATE NOCASE,      -- the sheet's short item name
  size         REAL,
  size_type    TEXT,
  qty          REAL NOT NULL DEFAULT 1,
  price        REAL,                              -- per pack
  total        REAL,                              -- line total
  base_amount  REAL,                              -- total bought in g, ml or each
  base_unit    TEXT CHECK (base_unit IN ('g','ml','each')),
  brand        TEXT
);
CREATE INDEX purchases_item_date ON purchases (item, date);

-- Which grocery item an ingredient is bought as ("chicken thighs" -> "Chicken").
ALTER TABLE items ADD COLUMN grocery_item TEXT COLLATE NOCASE;
-- 1 when grocery_item was set by hand, so automatic matching leaves it alone.
ALTER TABLE items ADD COLUMN grocery_item_manual INTEGER NOT NULL DEFAULT 0;

-- What's in the kitchen, as last told to the app (by hand or from a fridge photo).
-- name is a grocery item or ingredient name, lower case.
CREATE TABLE pantry (
  name        TEXT PRIMARY KEY COLLATE NOCASE,
  status      TEXT NOT NULL CHECK (status IN ('have','out','staple')),
  source      TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','photo')),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE shopping_items (
  id          TEXT PRIMARY KEY,
  text        TEXT NOT NULL,
  name        TEXT COLLATE NOCASE,                -- item name, when known
  recipe_id   TEXT REFERENCES recipes(id) ON DELETE SET NULL,
  done        INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
