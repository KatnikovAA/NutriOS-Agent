import { readFile, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Agent, Runner } from "@openai/agents-core";
import { OpenAIProvider } from "@openai/agents-openai";
import { createHealthCoachAgent } from "../agents/healthCoach";
import {
  createSafetyReviewerAgent,
  ReviewSchema,
  type Review,
} from "../agents/safetyReviewer";

export type HealthAgentResult = {
  plan: string | null;
  review: Review;
  rounds: number;
};

function loadEnv() {
  const envPath = join(process.cwd(), ".env");
  if (!existsSync(envPath)) return;
  const lines = readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)\s*$/);
    if (!match || match[1].startsWith("#")) continue;
    process.env[match[1]] ??= match[2].replace(/^["']|["']$/g, "");
  }
}

async function runText(runner: Runner, agent: Agent, input: string) {
  const result = await runner.run(agent, input);
  return String(result.finalOutput ?? "").trim();
}

function forceMedicalBoundary(task: string, review: Review): Review {
  const boundaryText = `${task}\n${review.issues.join("\n")}`;
  const medicalPattern = /лекарств|таблет|препарат|дозиров|давлен|лечени|диагноз|анализ|боль|симптом/i;
  const supplementPattern = /добавк|витамин|бад|supplement|омега|магни/i;
  const supplementRiskPattern = /купить|покупк|принимать|принимай|дозиров|анализ|дефицит|назнач|курс/i;
  const needsBoundary =
    medicalPattern.test(task) ||
    (supplementPattern.test(boundaryText) && supplementRiskPattern.test(boundaryText));
  if (!needsBoundary) return review;
  return {
    verdict: "needs_human_professional",
    score: Math.min(review.score, 8),
    issues: ["Исходный запрос касается медицинской темы и требует профильного специалиста.", ...review.issues],
  };
}

async function reviewPlan(runner: Runner, agent: Agent, input: string) {
  let prompt = input;
  let lastError = "";
  // Невалидный JSON запрашиваем у reviewer-а еще один раз.
  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await runText(runner, agent, prompt);
    try {
      return ReviewSchema.parse(JSON.parse(raw.trim()));
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      prompt = `${input}\n\nПредыдущий ответ был невалидным JSON. Ошибка: ${lastError}\nВерни только JSON строго по схеме.`;
    }
  }
  throw new Error(`Reviewer вернул невалидный JSON после ретрая: ${lastError}`);
}

export async function runHealthAgent(task: string): Promise<HealthAgentResult> {
  loadEnv();
  const cleanTask = task.trim();
  if (!cleanTask) throw new Error("Передай непустую задачу");

  const apiKey = process.env.DEEPSEEK_API_KEY;
  const baseURL = process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com";
  const model = process.env.DEEPSEEK_MODEL ?? "deepseek-v4-flash";
  if (!apiKey) throw new Error("Нет DEEPSEEK_API_KEY в .env или окружении");

  // DeepSeek работает через OpenAI-compatible Chat Completions API.
  const modelProvider = new OpenAIProvider({ apiKey, baseURL, useResponses: false });
  const runner = new Runner({ model, modelProvider, tracingDisabled: true });
  const profile = await readFile(join(process.cwd(), "data", "profile.md"), "utf8");
  const log = await readFile(join(process.cwd(), "data", "log.md"), "utf8");
  const context = `Задача: ${cleanTask}\n\nПрофиль пользователя:\n${profile}\n\nДневник:\n${log}`;
  let plan = await runText(runner, createHealthCoachAgent(), `${context}\n\nСоставь план.`);

  for (let round = 1; round <= 3; round++) {
    const review = forceMedicalBoundary(
      cleanTask,
      await reviewPlan(runner, createSafetyReviewerAgent(), `${context}\n\nПлан для проверки:\n${plan}`),
    );
    console.log(`round=${round} verdict=${review.verdict} score=${review.score} issues=${JSON.stringify(review.issues)}`);

    if (review.verdict === "needs_human_professional") {
      return { plan: null, review, rounds: round };
    }
    if (review.verdict === "approve") {
      await writeFile(join(process.cwd(), "data", "output.md"), `${plan}\n`, "utf8");
      return { plan, review, rounds: round };
    }

    plan = await runText(
      runner,
      createHealthCoachAgent(),
      `${context}\n\nПредыдущий план:\n${plan}\n\nЗамечания reviewer-а:\n${review.issues.map((issue) => `- ${issue}`).join("\n")}\n\nИсправь план с учетом замечаний. Не добавляй медицинские советы.`,
    );
  }
  throw new Error("Не удалось получить approve за 3 раунда ревизии");
}
