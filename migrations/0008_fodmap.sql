-- FODMAP detail per ingredient: a swap suggestion, and where the rating came
-- from ('guide' = built-in list, 'ai', 'manual' = set by hand).
ALTER TABLE items ADD COLUMN fodmap_swap TEXT;
ALTER TABLE items ADD COLUMN fodmap_source TEXT;
