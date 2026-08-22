import type { OSModule } from "./types";

export const dailyPlanModule: OSModule = {
  name: "dailyPlan",
  description: "Целостный план дня или периода: питание, активность, восстановление и простые привычки.",
  promptFile: "prompts/modules/dailyPlan.md",
  tools: [
    "searchKnowledge",
    "read_profile",
    "read_recent_logs",
    "list_recipes",
    "suggestWorkoutTemplate",
    "generateShoppingList",
    "weather:*",
  ],
};
