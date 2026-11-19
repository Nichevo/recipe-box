-- "Make soon" star: when set, the recipe shows at the top of the list.
ALTER TABLE recipes ADD COLUMN starred_at TEXT;
