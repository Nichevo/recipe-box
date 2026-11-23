-- Nutrition per serving (JSON), from the recipe's own figures or an AI estimate.
ALTER TABLE recipes ADD COLUMN nutrition TEXT;
ALTER TABLE recipes ADD COLUMN nutrition_at TEXT;
