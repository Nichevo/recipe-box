-- Initial schema. See docs/DATA_MODEL.md for the reasoning behind each table.
PRAGMA foreign_keys = ON;

CREATE TABLE recipes (
  id               TEXT PRIMARY KEY,               -- UUID
  title            TEXT NOT NULL,
  summary          TEXT,
  servings         REAL,
  prep_minutes     INTEGER,
  cook_minutes     INTEGER,
  source_type      TEXT NOT NULL DEFAULT 'manual'
                   CHECK (source_type IN ('manual','web','photo','ai','notion')),
  source_url       TEXT,
  source_name      TEXT,                            -- e.g. "BBC Good Food"
  hero_photo_id    TEXT,
  fodmap_rating    TEXT CHECK (fodmap_rating IN ('low','moderate','high')),
  fodmap_override  INTEGER NOT NULL DEFAULT 0,      -- 1 = set by hand, don't recompute
  notes            TEXT,
  rating           INTEGER CHECK (rating BETWEEN 1 AND 5),
  status           TEXT NOT NULL DEFAULT 'published'
                   CHECK (status IN ('draft','published')),
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_recipes_title ON recipes(title COLLATE NOCASE);

-- Canonical ingredients shared by recipes, purchases and the pantry.
CREATE TABLE items (
  id                TEXT PRIMARY KEY,
  name              TEXT NOT NULL UNIQUE COLLATE NOCASE,
  category          TEXT,                           -- produce, dairy, meat...
  default_unit      TEXT,                           -- g, ml, each
  shelf_life_days   INTEGER,
  -- FODMAP: overall rating for filtering, plus per-group detail.
  fodmap_rating     TEXT CHECK (fodmap_rating IN ('low','moderate','high')),
  fodmap_fructans   INTEGER NOT NULL DEFAULT 0,
  fodmap_gos        INTEGER NOT NULL DEFAULT 0,
  fodmap_lactose    INTEGER NOT NULL DEFAULT 0,
  fodmap_fructose   INTEGER NOT NULL DEFAULT 0,
  fodmap_polyols    INTEGER NOT NULL DEFAULT 0,
  fodmap_safe_serving TEXT,                         -- e.g. "1/8 avocado (20 g)"
  fodmap_note       TEXT,
  grams_per_unit    REAL,                           -- for "each" -> grams costing
  ml_to_g           REAL                            -- density for volume -> weight
);

CREATE TABLE item_aliases (
  alias    TEXT PRIMARY KEY COLLATE NOCASE,
  item_id  TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE
);

CREATE TABLE recipe_ingredients (
  id             TEXT PRIMARY KEY,
  recipe_id      TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  position       INTEGER NOT NULL,
  section        TEXT,                              -- "For the sauce"
  item_id        TEXT REFERENCES items(id) ON DELETE SET NULL,
  quantity       REAL,
  quantity_max   REAL,                              -- ranges: "2-3"
  unit           TEXT,                              -- as written: cup, tbsp, oz, g
  metric_amount  REAL,                              -- normalised: grams or ml
  metric_unit    TEXT CHECK (metric_unit IN ('g','ml','each')),
  preparation    TEXT,                              -- "finely chopped"
  original_text  TEXT NOT NULL,
  optional       INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_ingredients_recipe ON recipe_ingredients(recipe_id, position);
CREATE INDEX idx_ingredients_item ON recipe_ingredients(item_id);

CREATE TABLE steps (
  id             TEXT PRIMARY KEY,
  recipe_id      TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  position       INTEGER NOT NULL,
  text           TEXT NOT NULL,
  photo_id       TEXT,
  timer_seconds  INTEGER
);
CREATE INDEX idx_steps_recipe ON steps(recipe_id, position);

CREATE TABLE photos (
  id          TEXT PRIMARY KEY,
  recipe_id   TEXT REFERENCES recipes(id) ON DELETE CASCADE,
  step_id     TEXT REFERENCES steps(id) ON DELETE SET NULL,
  kind        TEXT NOT NULL CHECK (kind IN ('hero','step','original_page','gallery')),
  r2_key      TEXT NOT NULL UNIQUE,
  width       INTEGER,
  height      INTEGER,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE tags (
  id    TEXT PRIMARY KEY,
  name  TEXT NOT NULL UNIQUE COLLATE NOCASE,
  kind  TEXT NOT NULL DEFAULT 'custom'
        CHECK (kind IN ('diet','course','cuisine','custom'))
);

CREATE TABLE recipe_tags (
  recipe_id  TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  tag_id     TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (recipe_id, tag_id)
);

-- Grocery lines synced from the purchases spreadsheet (food only).
CREATE TABLE purchases (
  id            TEXT PRIMARY KEY,                   -- hash of the source row
  purchased_on  TEXT NOT NULL,                      -- ISO date
  shop          TEXT,
  category      TEXT,
  product       TEXT NOT NULL,                      -- short item name from the sheet
  description   TEXT,                               -- full product name
  brand         TEXT,
  size          REAL,
  size_unit     TEXT,
  quantity      REAL,
  price         REAL,                               -- unit price, in the configured currency
  total         REAL,
  item_id       TEXT REFERENCES items(id) ON DELETE SET NULL
);
CREATE INDEX idx_purchases_item_date ON purchases(item_id, purchased_on);
CREATE INDEX idx_purchases_date ON purchases(purchased_on);

CREATE TABLE pantry (
  item_id     TEXT PRIMARY KEY REFERENCES items(id) ON DELETE CASCADE,
  status      TEXT NOT NULL CHECK (status IN ('have','out','always')),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- App settings (AI provider switches, unit preference, sync cursor...).
CREATE TABLE settings (
  key    TEXT PRIMARY KEY,
  value  TEXT NOT NULL
);

INSERT INTO settings (key, value) VALUES
  ('ai.claude_enabled', 'true'),
  ('ai.ollama_enabled', 'false'),
  ('ai.fallback_to_claude', 'true'),
  ('units.display', 'as_written');

INSERT INTO tags (id, name, kind) VALUES
  ('tag-keto', 'Keto', 'diet'),
  ('tag-vegetarian', 'Vegetarian', 'diet'),
  ('tag-vegan', 'Vegan', 'diet'),
  ('tag-gluten-free', 'Gluten free', 'diet'),
  ('tag-dairy-free', 'Dairy free', 'diet'),
  ('tag-low-fodmap', 'Low FODMAP', 'diet');
