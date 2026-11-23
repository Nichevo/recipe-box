-- Step 8: weekly meal plan.
CREATE TABLE meal_plan (
  id         TEXT PRIMARY KEY,
  day        TEXT NOT NULL,                       -- YYYY-MM-DD
  recipe_id  TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  servings   REAL,                                -- null = as the recipe says
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_meal_plan_day ON meal_plan(day);
