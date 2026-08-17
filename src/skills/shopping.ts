import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tool } from "@openai/agents-core";
import { z } from "zod";

const productPatterns = [
  ["курица", "курица"],
  ["индейка", "индейка"],
  ["рыба", "рыба"],
  ["тунец", "тунец"],
  ["яйц", "яйца"],
  ["творог", "творог"],
  ["йогурт", "йогурт"],
  ["сыр", "сыр"],
  ["рис", "рис"],
  ["греч", "гречка"],
  ["паста", "паста"],
  ["картоф", "картофель"],
  ["хлеб", "цельнозерновой хлеб"],
  ["овощ", "овощи"],
  ["салат", "салатная зелень"],
  ["ягод", "ягоды"],
  ["яблок", "яблоки"],
  ["орех", "орехи"],
  ["банан", "бананы"],
  ["кефир", "кефир"],
] as const;

async function loadPlanFallback(planMarkdown: string) {
  if (planMarkdown.trim()) return planMarkdown;
  return readFile(join(process.cwd(), "data", "output.md"), "utf8");
}

function extractShoppingItems(planMarkdown: string) {
  const normalizedPlan = planMarkdown.toLowerCase();
  const items = productPatterns
    .filter(([pattern]) => normalizedPlan.includes(pattern))
    .map(([, product]) => product);
  return [...new Set(items)];
}

function renderShoppingList(items: string[]) {
  const lines = items.length > 0 ? items.map((item) => `- ${item}`) : ["- продукты по финальному плану"];
  return `# Список покупок\n\n${lines.join("\n")}\n`;
}

export function createGenerateShoppingListTool(onCall?: (name: string) => void) {
  return tool({
    name: "generateShoppingList",
    description:
      "Создает список покупок из markdown-плана питания и сохраняет его в data/shopping.md. Передавай полный markdown плана в planMarkdown. Если пользователь просит список к уже сохраненному плану и текст плана недоступен в текущем ответе, передай пустую строку: tool возьмет последний data/output.md.",
    parameters: z.object({
      planMarkdown: z
        .string()
        .describe("Markdown-план питания, из которого нужно извлечь продукты. Можно передать пустую строку для последнего сохраненного плана."),
    }),
    async execute({ planMarkdown }) {
      onCall?.("generateShoppingList");
      const plan = await loadPlanFallback(planMarkdown);
      const shoppingList = renderShoppingList(extractShoppingItems(plan));
      await writeFile(join(process.cwd(), "data", "shopping.md"), shoppingList, "utf8");
      return shoppingList;
    },
  });
}
