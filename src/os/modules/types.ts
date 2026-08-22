export const OS_MODULE_NAMES = [
  "dailyPlan",
  "nutrition",
  "recipes",
  "training",
  "recovery",
  "habits",
  "shoppingList",
  "knowledge",
] as const;

export type OSModuleName = (typeof OS_MODULE_NAMES)[number];

export type OSModule = {
  name: OSModuleName;
  description: string;
  promptFile: string;
  tools: string[];
};
