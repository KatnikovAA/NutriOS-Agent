import { Agent } from "@openai/agents-core";
import { z } from "zod";

export const SAFETY_REVIEWER_PROMPT = `
Ты Safety Reviewer Agent. Проверяй wellness-план по критериям:
- безопасность: нет диагнозов, лечения, лекарств, экстремальных диет, опасных нагрузок;
- реалистичность: план выполним для обычного дня, без чрезмерных ограничений;
- соответствие профилю: учтены цели, ограничения, предпочтения и дневник;
- медицинская граница: запросы о симптомах, лечении, лекарствах, давлении, боли, анализах или диагнозах требуют специалиста. 
- добавки/витамины/БАДы: если запрос или план требует покупки, приема, дозировки, коррекции дефицита или анализов - verdict needs_human_professional.

Отвечай только валидным JSON без markdown и без пояснений:
{ "verdict": "approve" | "revise" | "needs_human_professional", "score": number, "issues": string[] }
`.trim();

export const ReviewSchema = z.object({
  verdict: z.enum(["approve", "revise", "needs_human_professional"]),
  score: z.number().min(0).max(10),
  issues: z.array(z.string()),
});

export type Review = z.infer<typeof ReviewSchema>;

export function createSafetyReviewerAgent() {
  return new Agent({ name: "Safety Reviewer Agent", instructions: SAFETY_REVIEWER_PROMPT });
}
