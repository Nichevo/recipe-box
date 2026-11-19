# Data model

Recipes link to a shared list of **items** (canonical ingredients). Because an
item is shared, the same "spring onion" carries one FODMAP rating, matches
grocery purchases and has one latest price.

| Table | Purpose |
| --- | --- |
| `recipes` | One row per recipe: title, times, servings, source, FODMAP rating, status (draft/published) |
| `recipe_ingredients` | Ingredient lines: quantity and unit as written, normalised metric amount, linked item |
| `steps` | Ordered instructions, optional photo and timer |
| `items` | Canonical ingredients: category, shelf life, FODMAP rating and per-group detail |
| `item_aliases` | Other names for an item, including grocery product names |
| `tags`, `recipe_tags` | Diet, course, cuisine and custom tags |
| `photos` | Every image (hero, step, original book page) stored in R2 |
| `purchases` | Food lines synced from the grocery log |
| `pantry` | Manual overrides: have / out / always have |
| `settings` | App settings such as AI provider switches and unit display |

## Quantities

`quantity` + `unit` keep what the recipe says (for "as written" display).
`metric_amount` + `metric_unit` hold grams or millilitres for conversion and
costing. Cups and spoons are kept as written in every display mode.
See `shared/units.ts`.

## FODMAP

`items.fodmap_rating` (low / moderate / high) drives filtering. The per-group
flags (fructans, GOS, lactose, fructose, polyols) and safe serving size are shown
on the recipe page. A recipe's rating defaults to its highest-rated ingredient
unless set by hand (`fodmap_override`).
