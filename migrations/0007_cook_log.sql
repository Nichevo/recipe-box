-- Each time a recipe is cooked, with an optional 1-5 rating and a note.
CREATE TABLE cook_log (
  id         TEXT PRIMARY KEY,
  recipe_id  TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  cooked_on  TEXT NOT NULL,                        -- YYYY-MM-DD
  rating     INTEGER CHECK (rating BETWEEN 1 AND 5),
  note       TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_cook_log_recipe ON cook_log(recipe_id, cooked_on);
