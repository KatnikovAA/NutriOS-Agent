import { readFile, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Agent, Runner } from "@openai/agents-core";
import { OpenAIProvider } from "@openai/agents-openai";
import { createHealthCoachAgent } from "../agents/healthCoach";
import { createSafetyReviewerAgent } from "../agents/safetyReviewer";
import { loadActivePrompts, type ActivePromptVersions } from "./promptVersions";
import { appendRound, type RoundState } from "./rounds";
import { calculateFinalScore, calculateImproved } from "./score";
import { validateReviewWithRetry, type Review } from "./validateReview";

export type HealthAgentResult = {
  plan: string | null;
  review: Review;
  rounds: RoundState[];
  finalScore: number;
  improved: boolean;
  promptVersions: ActivePromptVersions;
  durationMs: number;
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

function buildResult(
  plan: string | null,
  review: Review,
  rounds: RoundState[],
  promptVersions: ActivePromptVersions,
  startTime: number,
): HealthAgentResult {
  return {
    plan,
    review,
    rounds,
    finalScore: calculateFinalScore(rounds),
    improved: calculateImproved(rounds),
    promptVersions,
    durationMs: Date.now() - startTime,
  };
}

export async function runHealthAgent(task: string, maxRounds = 3): Promise<HealthAgentResult> {
  const startTime = Date.now();
  loadEnv();
  const cleanTask = task.trim();
  if (!cleanTask) throw new Error("Передай непустую задачу");
  if (!Number.isInteger(maxRounds) || maxRounds < 1) throw new Error("maxRounds должен быть целым числом больше 0");

  const apiKey = process.env.DEEPSEEK_API_KEY;
  const baseURL = process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com";
  const model = process.env.DEEPSEEK_MODEL ?? "deepseek-v4-flash";
  if (!apiKey) throw new Error("Нет DEEPSEEK_API_KEY в .env или окружении");

  // DeepSeek работает через OpenAI-compatible Chat Completions API.
  const modelProvider = new OpenAIProvider({ apiKey, baseURL, useResponses: false });
  const runner = new Runner({ model, modelProvider, tracingDisabled: true });
  const { prompts, versions } = await loadActivePrompts();
  const healthCoachAgent = createHealthCoachAgent(prompts.coach);
  const safetyReviewerAgent = createSafetyReviewerAgent(prompts.reviewer);
  const profile = await readFile(join(process.cwd(), "data", "profile.md"), "utf8");
  const log = await readFile(join(process.cwd(), "data", "log.md"), "utf8");
  const context = `Задача: ${cleanTask}\n\nПрофиль пользователя:\n${profile}\n\nДневник:\n${log}`;
  let plan = await runText(runner, healthCoachAgent, `${context}\n\nСоставь план.`);
  let rounds: RoundState[] = [];

  for (let round = 1; round <= maxRounds; round++) {
    const review = forceMedicalBoundary(
      cleanTask,
      await validateReviewWithRetry(`${context}\n\nПлан для проверки:\n${plan}`, (prompt) =>
        runText(runner, safetyReviewerAgent, prompt),
      ),
    );
    rounds = appendRound(rounds, { round, plan, review });
    console.log(`round=${round} verdict=${review.verdict} score=${review.score} issues=${JSON.stringify(review.issues)}`);

    if (review.verdict === "needs_human_professional") {
      return buildResult(null, review, rounds, versions, startTime);
    }
    if (review.verdict === "approve") {
      await writeFile(join(process.cwd(), "data", "output.md"), `${plan}\n`, "utf8");
      return buildResult(plan, review, rounds, versions, startTime);
    }

    plan = await runText(
      runner,
      healthCoachAgent,
      `${context}\n\nПредыдущий план:\n${plan}\n\nЗамечания reviewer-а:\n${review.issues.map((issue) => `- ${issue}`).join("\n")}\n\nИсправь план с учетом замечаний. Не добавляй медицинские советы.`,
    );
  }
  throw new Error(`Не удалось получить approve за ${maxRounds} раунда ревизии`);
}
