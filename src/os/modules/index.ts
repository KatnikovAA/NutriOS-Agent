import { dailyPlanModule } from "./dailyPlan";
import { habitsModule } from "./habits";
import { knowledgeModule } from "./knowledge";
import { nutritionModule } from "./nutrition";
import { recipesModule } from "./recipes";
import { recoveryModule } from "./recovery";
import { shoppingListModule } from "./shoppingList";
import { trainingModule } from "./training";
import type { OSModule, OSModuleName } from "./types";

export { OS_MODULE_NAMES, type OSModule, type OSModuleName } from "./types";

const modules: OSModule[] = [
  dailyPlanModule,
  nutritionModule,
  recipesModule,
  trainingModule,
  recoveryModule,
  habitsModule,
  shoppingListModule,
  knowledgeModule,
];

export const osModules = Object.fromEntries(
  modules.map((module) => [module.name, module]),
) as Record<OSModuleName, OSModule>;

export function getOSModule(name: OSModuleName) {
  return osModules[name];
}
