import { tool } from "@openai/agents-core";
import { z } from "zod";

const templates = {
  strength:
    "Силовая 45 минут: разминка 7 минут, жим/тяга/присед в умеренной технике 3x8-10, тяга горизонтальная 3x10, легкая заминка 5 минут. Интенсивность RPE 6-7.",
  mobility:
    "Мобилити 20 минут: кошка-корова, раскрытие грудного отдела, ягодичный мост, мягкая растяжка сгибателей бедра, дыхание 3 минуты. Без боли и резких движений.",
  recovery:
    "Восстановительная активность 30-40 минут: спокойная прогулка, 5 минут суставной разминки, 5 минут растяжки икр и бедер. Темп разговорный.",
  home:
    "Домашняя тренировка 25 минут: присед к стулу, отжимания от опоры, тяга эспандера, планка короткими подходами, растяжка. 2-3 круга без работы до отказа.",
} as const;

function pickTemplate(goal: string) {
  const normalizedGoal = goal.toLowerCase();
  if (/сил|зал|мышц|трениров/.test(normalizedGoal)) return templates.strength;
  if (/поясниц|спин|мобил|растяж/.test(normalizedGoal)) return templates.mobility;
  if (/дом|коврик|эспанд/.test(normalizedGoal)) return templates.home;
  return templates.recovery;
}

export function createSuggestWorkoutTemplateTool(onCall?: (name: string) => void) {
  return tool({
    name: "suggestWorkoutTemplate",
    description:
      "Возвращает один безопасный шаблон активности из локального набора: силовая, мобилити для спины/поясницы, восстановительная прогулка или домашняя тренировка. Используй, когда в плане нужна тренировка, активность, восстановление или адаптация нагрузки под цель пользователя.",
    parameters: z.object({
      goal: z
        .string()
        .min(1)
        .describe("Цель или контекст активности, например: восстановление, силовая тренировка, поясница, домашняя тренировка."),
    }),
    execute({ goal }) {
      onCall?.("suggestWorkoutTemplate");
      return pickTemplate(goal);
    },
  });
}
