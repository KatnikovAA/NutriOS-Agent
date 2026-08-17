import { z } from "zod";

export const ReviewSchema = z.object({
  verdict: z.enum(["approve", "revise", "needs_human_professional"]),
  score: z.number().min(0).max(10),
  issues: z.array(z.string()),
});

export type Review = z.infer<typeof ReviewSchema>;

type ReviewTextRunner = (prompt: string) => Promise<string>;

function parseReview(raw: string) {
  try {
    const parsedJson = JSON.parse(raw.trim()) as unknown;
    const parsedReview = ReviewSchema.safeParse(parsedJson);
    if (parsedReview.success) return { review: parsedReview.data };
    return { error: parsedReview.error.message };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

export async function validateReviewWithRetry(input: string, runReviewText: ReviewTextRunner) {
  let prompt = input;
  let lastError = "";

  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await runReviewText(prompt);
    const parsed = parseReview(raw);
    if (parsed.review) return parsed.review;

    lastError = parsed.error;
    prompt = `${input}\n\nПредыдущий ответ был невалидным JSON. Ошибка: ${lastError}\nВерни только JSON строго по схеме.`;
  }

  throw new Error(`Reviewer вернул невалидный JSON после ретрая: ${lastError}`);
}
