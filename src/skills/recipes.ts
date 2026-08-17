import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { tool } from "@openai/agents-core";
import { z } from "zod";

export function createListFavoriteRecipesTool(onCall?: (name: string) => void) {
  return tool({
    name: "listFavoriteRecipes",
    description:
      "Возвращает локальный список любимых простых рецептов из data/recipes.md. Используй, когда нужно подобрать блюда без долгой готовки, разнообразить рацион, заменить неподходящий прием пищи или собрать план из привычных продуктов пользователя.",
    parameters: z.object({}),
    async execute() {
      onCall?.("listFavoriteRecipes");
      return readFile(join(process.cwd(), "data", "recipes.md"), "utf8");
    },
  });
}
