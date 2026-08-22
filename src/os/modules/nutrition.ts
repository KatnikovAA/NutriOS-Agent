import type { OSModule } from "./types";

export const nutritionModule: OSModule = {
  name: "nutrition",
  description: "Питание, режим приемов пищи, порции, продуктовые ограничения и бытовые замены.",
  promptFile: "prompts/modules/nutrition.md",
  tools: ["searchKnowledge", "read_profile", "read_recent_logs", "list_recipes"],
};
