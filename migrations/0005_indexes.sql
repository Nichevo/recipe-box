-- Indexes for lookups that were scanning whole tables.

-- Tag counts and "recipes with this tag": recipe_tags' primary key starts with
-- recipe_id, so looking up by tag_id read every row once per tag.
CREATE INDEX IF NOT EXISTS idx_recipe_tags_tag ON recipe_tags(tag_id, recipe_id);

-- A recipe's photos (recipe page, delete, AI read-from-photo).
CREATE INDEX IF NOT EXISTS idx_photos_recipe ON photos(recipe_id);

-- Ingredient matching and pantry lookups by grocery item.
CREATE INDEX IF NOT EXISTS idx_items_grocery ON items(grocery_item);
