/**
 * A built-in guide to common ingredients, from general low FODMAP guidance.
 * Ratings are for a typical serving in a recipe; many "moderate" foods are fine
 * in smaller amounts (see `serving`). It's a starting point: anything can be
 * corrected by hand in the app, and unknown ingredients can be checked with AI.
 */
import type { FodmapRating } from "./types";

export type FodmapGroup = "fructans" | "gos" | "lactose" | "fructose" | "polyols";

export const GROUP_LABEL: Record<FodmapGroup, string> = {
  fructans: "Fructans",
  gos: "GOS",
  lactose: "Lactose",
  fructose: "Excess fructose",
  polyols: "Polyols"
};

export interface GuideEntry {
  rating: FodmapRating;
  groups: FodmapGroup[];
  /** A serving that is usually tolerated, where that helps. */
  serving?: string;
  swap?: string;
}

type Row = [names: string, rating: FodmapRating, groups: FodmapGroup[], serving?: string, swap?: string];

// Names are matched as whole words (plurals too). The longest match wins, so
// "garlic infused oil" beats "garlic" and "almond milk" beats "milk".
const ROWS: Row[] = [
  // Alliums
  ["garlic|garlic clove|garlic powder|garlic salt|minced garlic", "high", ["fructans"], undefined, "garlic-infused oil, or a pinch of asafoetida"],
  ["garlic infused oil|garlic oil", "low", []],
  ["onion|red onion|brown onion|white onion|yellow onion|onion powder|shallot|eschalot|pearl onion", "high", ["fructans"], undefined, "green tops of spring onion, chives, or onion-infused oil"],
  ["spring onion|green onion|scallion", "high", ["fructans"], "green tops only", "use only the green tops"],
  ["spring onion greens|spring onion tops|green onion tops|scallion greens|chives", "low", []],
  ["leek", "high", ["fructans"], "green leaves only", "use only the green leaves"],
  ["leek leaves|leek greens", "low", []],
  // Grains and flours
  ["flour|plain flour|all purpose flour|wheat flour|self raising flour|self rising flour|bread flour|wholemeal flour|whole wheat flour|cake flour|semolina", "high", ["fructans"], undefined, "a gluten-free flour blend"],
  ["spelt flour", "moderate", ["fructans"], undefined, "a gluten-free flour blend"],
  ["rice flour|gluten free flour|cornflour|corn flour|cornstarch|corn starch|potato starch|potato flour|tapioca|tapioca flour|tapioca starch|buckwheat flour|sorghum flour|millet flour|polenta|cornmeal|arrowroot", "low", []],
  ["almond flour|almond meal|ground almond", "moderate", ["gos"], "¼ cup", "use up to ¼ cup per serve, or mix with gluten-free flour"],
  ["coconut flour", "moderate", ["polyols"], "2 tbsp", "mix with a gluten-free flour blend"],
  ["chickpea flour|besan|gram flour", "high", ["gos", "fructans"], undefined, "gluten-free flour blend"],
  ["breadcrumb|bread crumb|panko", "high", ["fructans"], undefined, "gluten-free breadcrumbs or crushed rice crackers"],
  ["bread|pita|naan|tortilla|wrap|bun|bagel|croissant|brioche", "high", ["fructans"], "1 slice white bread", "gluten-free bread or spelt sourdough"],
  ["corn tortilla|gluten free bread|sourdough", "low", [], "2 slices sourdough"],
  ["pasta|spaghetti|noodle|egg noodle|lasagne|macaroni|penne|fettuccine|gnocchi|couscous", "high", ["fructans"], "½ cup cooked wheat pasta", "gluten-free pasta, rice noodles or quinoa"],
  ["rice noodle|rice vermicelli|gluten free pasta|soba", "low", []],
  ["rye|barley|pearl barley|bulgur|freekeh", "high", ["fructans"], undefined, "rice, quinoa or millet"],
  ["rice|basmati|jasmine rice|brown rice|arborio|quinoa|millet|buckwheat|oat|rolled oat|oatmeal", "low", [], "½ cup oats"],
  // Legumes, nuts, seeds
  ["bean|kidney bean|black bean|baked bean|borlotti bean|cannellini bean|haricot bean|pinto bean|navy bean|butter bean|broad bean|fava bean|lima bean|mung bean|soy bean|soybean|split pea", "high", ["gos"], undefined, "canned, rinsed lentils (small serve) or firm tofu"],
  ["green bean|string bean|runner bean|bean sprout|vanilla bean", "low", []],
  ["chickpea|garbanzo", "moderate", ["gos"], "¼ cup canned, rinsed", "canned, rinsed chickpeas in small amounts"],
  ["lentil|red lentil|brown lentil", "moderate", ["gos"], "½ cup canned, rinsed", "canned, rinsed lentils"],
  ["hummus", "high", ["gos", "fructans"], "1 tbsp", "a little low FODMAP dip, e.g. made with canned rinsed chickpeas and no garlic"],
  ["firm tofu|tofu|tempeh", "low", []],
  ["silken tofu", "high", ["fructans", "gos"], undefined, "firm tofu"],
  ["soy milk", "high", ["gos"], undefined, "soy protein milk, almond or lactose-free milk"],
  ["cashew|pistachio", "high", ["gos", "fructans"], undefined, "macadamias, peanuts or walnuts"],
  ["almond", "moderate", ["gos"], "10 nuts"],
  ["hazelnut", "moderate", ["gos", "fructans"], "10 nuts"],
  ["peanut|peanut butter|walnut|macadamia|pecan|pine nut|brazil nut|pumpkin seed|pepita|sunflower seed|sesame seed|chia seed|chia|flaxseed|linseed|tahini", "low", [], "2 tbsp seeds or 10–20 nuts"],
  // Dairy
  ["milk|whole milk|skim milk|full cream milk|evaporated milk|condensed milk|sweetened condensed milk|milk powder|buttermilk|custard|ice cream", "high", ["lactose"], undefined, "lactose-free milk, almond or rice milk"],
  ["lactose free milk|almond milk|rice milk|macadamia milk|coconut milk|coconut cream", "low", [], "½ cup coconut milk"],
  ["oat milk", "moderate", ["fructans", "gos"], "½ cup", "lactose-free or almond milk"],
  ["yogurt|yoghurt|plain yogurt|natural yoghurt|kefir", "high", ["lactose"], undefined, "lactose-free or coconut yoghurt"],
  ["greek yogurt|greek yoghurt", "moderate", ["lactose"], "2 tbsp", "lactose-free Greek yoghurt"],
  ["lactose free yogurt|lactose free yoghurt|coconut yogurt|coconut yoghurt", "low", []],
  ["ricotta|cottage cheese|cream cheese|mascarpone|quark", "moderate", ["lactose"], "2 tbsp", "lactose-free cream cheese, or a hard cheese"],
  ["cheese|cheddar|parmesan|parmigiano|pecorino|mozzarella|feta|brie|camembert|swiss cheese|gruyere|halloumi|goat cheese|blue cheese|edam|gouda|colby|manchego", "low", [], "40 g"],
  ["butter|ghee|cream|thickened cream|double cream|heavy cream|whipping cream|sour cream|creme fraiche", "low", [], "2 tbsp cream"],
  ["milk chocolate|white chocolate", "moderate", ["lactose"], "20 g", "dark chocolate"],
  ["dark chocolate|cocoa|cocoa powder|cacao", "low", [], "30 g dark chocolate"],
  // Sweeteners
  ["honey|agave|agave syrup|high fructose corn syrup", "high", ["fructose"], undefined, "maple syrup, rice malt syrup or golden syrup"],
  ["golden syrup", "low", [], "1 tbsp"],
  ["maple syrup|rice malt syrup|sugar|white sugar|caster sugar|brown sugar|raw sugar|icing sugar|powdered sugar|confectioners sugar|glucose|dextrose|stevia|monk fruit", "low", []],
  ["sorbitol|mannitol|xylitol|maltitol|isomalt", "high", ["polyols"], undefined, "regular sugar, stevia or monk fruit"],
  ["erythritol|lakanto|swerve", "moderate", ["polyols"], "small amounts", "stevia, monk fruit or regular sugar (erythritol is a polyol; some people react)"],
  ["inulin|chicory|chicory root|fos", "high", ["fructans"]],
  // Fruit
  ["apple|apple juice|applesauce|apple sauce|pear|nashi|mango|watermelon|cherry|peach|nectarine|plum|apricot|blackberry|persimmon|fig|lychee|tamarillo", "high", ["fructose", "polyols"], undefined, "orange, kiwifruit, strawberries, blueberries or pineapple"],
  ["dried fruit|raisin|sultana|date|medjool date|prune|dried apricot|dried fig|currant", "high", ["fructans", "polyols", "fructose"], "1 tbsp dried cranberries", "a few dried cranberries"],
  ["banana", "moderate", ["fructans"], "1 firm (just ripe) banana; ripe ones are higher", "firm banana"],
  ["avocado", "moderate", ["polyols"], "⅛ avocado (30 g)"],
  ["coconut|desiccated coconut|shredded coconut", "moderate", ["polyols"], "¼ cup"],
  ["pomegranate", "moderate", ["fructans"], "¼ cup seeds"],
  ["orange|mandarin|clementine|lemon|lime|lemon juice|lime juice|kiwi|kiwifruit|strawberry|blueberry|raspberry|pineapple|grape|passionfruit|papaya|cantaloupe|rockmelon|honeydew|rhubarb|dried cranberry|cranberry", "low", [], "1 cup most low FODMAP fruit"],
  // Vegetables
  ["mushroom|button mushroom|portobello|shiitake|porcini|cremini", "high", ["polyols"], undefined, "oyster mushrooms or canned champignons"],
  ["oyster mushroom|champignon", "low", []],
  ["cauliflower", "high", ["polyols"], undefined, "broccoli heads or zucchini"],
  ["asparagus|artichoke|jerusalem artichoke|snow pea|sugar snap pea|mange tout", "high", ["fructans", "fructose", "polyols"], undefined, "green beans or bok choy"],
  ["celery", "moderate", ["polyols"], "¼ stalk"],
  ["sweet corn|corn|corn kernel|sweetcorn", "moderate", ["polyols"], "½ cob"],
  ["pea|green pea|frozen pea|garden pea", "moderate", ["gos"], "¼ cup"],
  ["butternut|butternut squash|butternut pumpkin", "moderate", ["polyols", "gos"], "⅓ cup", "Japanese or kent pumpkin"],
  ["sweet potato|kumara", "moderate", ["polyols"], "½ cup"],
  ["beetroot|beet", "moderate", ["gos", "fructans"], "2 slices"],
  ["brussels sprout|savoy cabbage|fennel bulb", "moderate", ["fructans", "polyols"], "½ cup"],
  ["broccoli", "low", [], "¾ cup heads; stalks are higher"],
  ["pumpkin|kent pumpkin|japanese pumpkin|kabocha", "low", []],
  ["potato|carrot|zucchini|courgette|eggplant|aubergine|capsicum|bell pepper|red capsicum|red bell pepper|tomato|cherry tomato|canned tomato|tomato paste|passata|cucumber|lettuce|rocket|arugula|spinach|baby spinach|kale|silverbeet|chard|bok choy|pak choy|choy sum|cabbage|red cabbage|parsnip|swede|turnip|radish|bean sprout|olive|ginger|chilli|chili|jalapeno|okra|water chestnut|bamboo shoot|seaweed|nori", "low", []],
  ["green capsicum|green bell pepper", "low", []],
  // Herbs, spices, condiments
  ["basil|parsley|coriander|cilantro|mint|dill|rosemary|thyme|oregano|sage|tarragon|bay leaf|lemongrass|kaffir lime|curry leaf|cumin|paprika|smoked paprika|turmeric|cinnamon|nutmeg|clove|cardamom|star anise|fennel seed|mustard seed|chilli flake|chili powder|cayenne|black pepper|pepper|salt|sea salt|vanilla|vanilla extract|asafoetida|garam masala|curry powder|five spice", "low", []],
  ["soy sauce|tamari|fish sauce|oyster sauce|worcestershire sauce|mustard|dijon|mayonnaise|vinegar|balsamic vinegar|rice vinegar|red wine vinegar|apple cider vinegar|sesame oil|olive oil|extra virgin olive oil|vegetable oil|canola oil|coconut oil|sunflower oil|peanut oil|miso|ketchup", "low", [], "1–2 tbsp sauces"],
  ["stock|broth|bouillon|stock cube|gravy", "high", ["fructans"], undefined, "a low FODMAP stock, or one made without onion and garlic"],
  ["chutney|relish|pesto|salsa|curry paste|taco seasoning|onion soup mix|bbq sauce|barbecue sauce", "high", ["fructans"], undefined, "make it without onion and garlic"],
  ["rum|port|sweet wine|dessert wine", "high", ["fructose"], undefined, "dry wine, gin or vodka"],
  ["wine|white wine|red wine|beer|gin|vodka|whisky|whiskey", "low", [], "1 glass"],
  // Protein (plain meat, fish and eggs have no FODMAPs)
  ["egg|chicken|beef|pork|lamb|turkey|duck|veal|bacon|ham|prosciutto|fish|salmon|tuna|cod|snapper|prawn|shrimp|scallop|mussel|crab|squid|mince|steak", "low", []],
  ["sausage|chorizo|salami|meatball|marinated", "moderate", ["fructans"], undefined, "check the label for onion, garlic or wheat"],
  ["marinara|marinara sauce|pasta sauce|tomato sauce", "high", ["fructans"], undefined, "passata or crushed tomatoes with garlic-infused oil"],
  ["sriracha", "low", [], "1 tsp"],
  ["oyster", "low", []],
  // Baking basics
  ["pastry|puff pastry|shortcrust pastry|filo|phyllo|graham cracker|digestive biscuit|cracker|cake mix", "high", ["fructans"], undefined, "gluten-free pastry or biscuits"],
  ["corn syrup|light corn syrup|dark corn syrup|glucose syrup", "low", []],
  ["nut milk|avocado oil|water|cooking spray|cooking oil|xanthan gum|allspice", "low", []],
  ["baking powder|baking soda|bicarbonate of soda|yeast|gelatine|gelatin|agar", "low", []]
];

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const ENTRIES = ROWS.flatMap(([names, rating, groups, serving, swap]) =>
  names.split("|").map((n) => {
    const key = norm(n);
    // Plurals: "eggs", "tomatoes", "cherries", "bay leaves".
    const pattern = /[^aeiou]y$/.test(key) ? `${key.slice(0, -1)}(y|ies)` : /f$/.test(key) ? `${key.slice(0, -1)}(f|ves)` : `${key}(e?s)?`;
    return { key, re: new RegExp(`\\b${pattern}\\b`), entry: { rating, groups, serving, swap } as GuideEntry };
  })
);

/** The guide's entry for an ingredient name, or null if it isn't in the guide. */
export function lookupFodmap(name: string): (GuideEntry & { matched: string }) | null {
  const n = norm(name);
  let best: { key: string; entry: GuideEntry } | null = null;
  for (const e of ENTRIES) if (e.re.test(n) && (!best || e.key.length > best.key.length)) best = e;
  return best ? { ...best.entry, matched: best.key } : null;
}
