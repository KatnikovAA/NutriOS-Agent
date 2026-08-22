import type { OSModule } from "./types";

export const recipesModule: OSModule = {
  name: "recipes",
  description: "Выбор блюд, рецепты, замены ингредиентов и идеи приготовления еды.",
  promptFile: "prompts/modules/recipes.md",
  tools: ["searchKnowledge", "read_profile", "list_recipes", "generateShoppingList"],
};
