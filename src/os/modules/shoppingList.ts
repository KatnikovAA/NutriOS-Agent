import type { OSModule } from "./types";

export const shoppingListModule: OSModule = {
  name: "shoppingList",
  description: "Список покупок к текущему запросу или последнему сохраненному плану.",
  promptFile: "prompts/modules/shoppingList.md",
  tools: ["generateShoppingList", "list_recipes"],
};
