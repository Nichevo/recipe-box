-- Remember where an imported recipe came from, so importing the same file
-- twice skips recipes that are already here.
ALTER TABLE recipes ADD COLUMN import_key TEXT;
CREATE UNIQUE INDEX idx_recipes_import_key ON recipes(import_key) WHERE import_key IS NOT NULL;

-- Meal and cuisine categories, so recipes can be filtered by them.
INSERT OR IGNORE INTO tags (id, name, kind) VALUES
  ('course-breakfast', 'Breakfast', 'course'),
  ('course-lunch', 'Lunch', 'course'),
  ('course-main', 'Main', 'course'),
  ('course-side', 'Side', 'course'),
  ('course-starter', 'Starter', 'course'),
  ('course-snack', 'Snack', 'course'),
  ('course-dessert', 'Dessert', 'course'),
  ('course-baking', 'Baking', 'course'),
  ('course-bread', 'Bread', 'course'),
  ('course-drink', 'Drink', 'course'),
  ('course-sauce', 'Sauce', 'course'),
  ('cuisine-american', 'American', 'cuisine'),
  ('cuisine-chinese', 'Chinese', 'cuisine'),
  ('cuisine-french', 'French', 'cuisine'),
  ('cuisine-german', 'German', 'cuisine'),
  ('cuisine-greek', 'Greek', 'cuisine'),
  ('cuisine-indian', 'Indian', 'cuisine'),
  ('cuisine-italian', 'Italian', 'cuisine'),
  ('cuisine-japanese', 'Japanese', 'cuisine'),
  ('cuisine-korean', 'Korean', 'cuisine'),
  ('cuisine-malaysian', 'Malaysian', 'cuisine'),
  ('cuisine-mexican', 'Mexican', 'cuisine'),
  ('cuisine-middle-eastern', 'Middle Eastern', 'cuisine'),
  ('cuisine-new-zealand', 'New Zealand', 'cuisine'),
  ('cuisine-persian', 'Persian', 'cuisine'),
  ('cuisine-portuguese', 'Portuguese', 'cuisine'),
  ('cuisine-spanish', 'Spanish', 'cuisine'),
  ('cuisine-sri-lankan', 'Sri Lankan', 'cuisine'),
  ('cuisine-swedish', 'Swedish', 'cuisine'),
  ('cuisine-thai', 'Thai', 'cuisine'),
  ('cuisine-ukrainian', 'Ukrainian', 'cuisine'),
  ('cuisine-vietnamese', 'Vietnamese', 'cuisine');
