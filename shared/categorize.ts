/**
 * Guesses a meal type and cuisine from a recipe's title (and optionally its
 * ingredients). Used by importers; anything it gets wrong can be changed on
 * the recipe's edit page. Names match the tags seeded in the database.
 */

const COURSE_RULES: [RegExp, string][] = [
  [/pancake|waffle|crepe|pikelet|porridge|granola|banosh|egg cups?|omelet|scramble|poach|breakfast|muesli/i, "Breakfast"],
  [/cookie|biscuit(?!.*sandwich)|brownie|cake|muffin|slice|donut|doughnut|macaron|macaroon|shortbread|fudge|truffle|tart|cheesecake|ice ?cream|icecream|meringue|melting moments|bars?\b|scroll|squares?\b|dessert|pudding|pie with|pecan|peacan|custard/i, "Dessert"],
  [/bread|focaccia|rolls?\b|flatbread|loaf|vogels|pizza crust|english muffin/i, "Bread"],
  [/cracker|chips|roasted chickpeas|energy bites|nuts\b/i, "Snack"],
  [/scones?/i, "Baking"],
  [/curry|korma|madras|rogan josh|chicken|beef|lamb|pork|ribs|steak|salmon|fish|oysters|pie\b|pies\b|risotto|pasta|burger|bake\b|ratatouille|byaldi|braciole|involtini|spanakopita|fritters/i, "Main"],
  [/sauce|dressing|pesto|gravy|dip\b/i, "Sauce"],
  [/smoothie|drink|cocktail|lemonade/i, "Drink"]
];

const CUISINE_RULES: [RegExp, string][] = [
  [/sri lankan/i, "Sri Lankan"],
  [/shirini|iranian|persian/i, "Persian"],
  [/curry|korma|madras|rogan josh|masala|tikka|butter chicken|dahl|dal\b|naan|biryani|raita/i, "Indian"],
  [/mongolian beef|stir.?fry|sweet chil+i chicken|chow mein|dumpling|fried rice/i, "Chinese"],
  [/japanese|teriyaki|katsu|ramen|miso|crispy rice with spicy salmon|sushi/i, "Japanese"],
  [/malaysian|rendang|laksa|satay/i, "Malaysian"],
  [/thai|pad thai|green curry|tom yum/i, "Thai"],
  [/korean|bulgogi|kimchi|gochujang/i, "Korean"],
  [/focaccia|braciole|involtini|risotto|pasta|lasagne|lasagna|parmesan bowls|parmigiana|pesto|pizza|tiramisu|biscotti|pranzi/i, "Italian"],
  [/ratatouille|byaldi|crepe|macaron\b|macarons|madeleine|brioche|french/i, "French"],
  [/portuguese|pastel de nata/i, "Portuguese"],
  [/spanakopita|greek|tzatziki|souvlaki/i, "Greek"],
  [/german/i, "German"],
  [/swedish|havreflarn|ikea/i, "Swedish"],
  [/banosh|ukrainian|borscht/i, "Ukrainian"],
  [/churro|paella|spanish/i, "Spanish"],
  [/taco|burrito|enchilada|quesadilla|mexican|salsa/i, "Mexican"],
  [/anzac|pikelet|custard square|kūmara|kumara|vogels|pavlova|afghan|ginger crunch|louise slice/i, "New Zealand"],
  [/corn ?bread|apple cider doughnut|cinnamon roll|butter tart|pecan pie|peacan pie/i, "American"],
  [/shakshuka|hummus|falafel|tahini|za'?atar/i, "Middle Eastern"],
  [/pho\b|banh mi|vietnamese/i, "Vietnamese"]
];

export interface CategoryGuess {
  course: string | null;
  cuisine: string | null;
}

export function guessCategories(title: string, extra = ""): CategoryGuess {
  const first = (rules: [RegExp, string][], text: string) => rules.find(([re]) => re.test(text))?.[1] ?? null;
  return {
    course: first(COURSE_RULES, title),
    cuisine: first(CUISINE_RULES, title) ?? (extra ? first(CUISINE_RULES.slice(0, 2), extra) : null)
  };
}

/** Notion-style folder names that are really meal types. */
export const FOLDER_COURSES: Record<string, string> = {
  mains: "Main",
  main: "Main",
  entrees: "Starter",
  entree: "Starter",
  starters: "Starter",
  breads: "Bread",
  "deserts & treats": "Dessert",
  "desserts & treats": "Dessert",
  desserts: "Dessert",
  "pancakes and related": "Breakfast",
  eggs: "Breakfast",
  breakfast: "Breakfast",
  snacks: "Snack",
  sides: "Side",
  drinks: "Drink",
  sauces: "Sauce",
  baking: "Baking"
};
