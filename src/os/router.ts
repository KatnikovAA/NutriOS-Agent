import { Agent, Runner } from "@openai/agents-core";
import { OpenAIProvider } from "@openai/agents-openai";
import { z } from "zod";
import { loadEnv } from "../harness/env";
import { OS_MODULE_NAMES, osModules, type OSModuleName } from "./modules";

const routerOutputSchema = z.object({
  module: z.enum(OS_MODULE_NAMES),
  confidence: z.number().min(0).max(1),
});

export type IntentClassification = {
  module: OSModuleName | "general";
  confidence: number;
};

function stripJsonFence(value: string) {
  return value
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
}

function buildModuleCatalog() {
  return Object.values(osModules)
    .map((module) => `- ${module.name}: ${module.description}`)
    .join("\n");
}

export async function classifyIntent(task: string): Promise<IntentClassification> {
  loadEnv();
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) return { module: "general", confidence: 0 };

  const baseURL = process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com";
  const model = process.env.DEEPSEEK_ROUTER_MODEL ?? "deepseek-chat";
  const modelProvider = new OpenAIProvider({ apiKey, baseURL, useResponses: false });
  const runner = new Runner({ model, modelProvider, tracingDisabled: true });
  const routerAgent = new Agent({
    name: "Wellness OS Intent Router",
    instructions:
      "Классифицируй запрос ровно в один модуль. Ответь только JSON-объектом без markdown: " +
      '{"module":"dailyPlan","confidence":0.95}. Не решай задачу пользователя и не давай wellness-советы.',
  });

  const prompt = [
    "Доступные модули:",
    buildModuleCatalog(),
    "",
    "Калибровочные примеры:",
    '- «составь план на завтра» → dailyPlan',
    '- «что приготовить на ужин» → recipes',
    '- «составь список покупок к плану» → shoppingList',
    "",
    `Запрос пользователя: ${task.trim()}`,
  ].join("\n");

  try {
    const result = await runner.run(routerAgent, prompt);
    return routerOutputSchema.parse(JSON.parse(stripJsonFence(String(result.finalOutput ?? ""))));
  } catch (error) {
    console.warn(`Intent router выбрал general fallback: ${error instanceof Error ? error.message : String(error)}`);
    return { module: "general", confidence: 0 };
  }
}
