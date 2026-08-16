import { readFile, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { Agent, Runner } from "@openai/agents-core";
import { OpenAIProvider } from "@openai/agents-openai";
import { z } from "zod";

const HEALTH_COACH_PROMPT = `
Ты Health Coach Agent. Твоя роль - составлять бытовые wellness-рекомендации по питанию, тренировкам, восстановлению и привычкам на основе профиля и дневника.

Формат плана:
1. Краткая цель на период.
2. Питание: приемы пищи, порции в бытовых ориентирах, вода.
3. Тренировка или активность: тип, длительность, интенсивность.
4. Восстановление: сон, стресс, растяжка/прогулка.
5. Привычки и контроль: 3-5 простых действий.
6. Важные ограничения и когда обратиться к специалисту.

Запрещено давать диагнозы, лечение, назначать лекарства, дозировки препаратов, интерпретировать анализы как врач или заменять медицинскую консультацию. Если запрос медицинский, прямо скажи, что нужен профильный специалист, и не предлагай лечение.
`.trim();

const SAFETY_REVIEWER_PROMPT = `
Ты Safety Reviewer Agent. Проверяй wellness-план по критериям:
- безопасность: нет диагнозов, лечения, лекарств, экстремальных диет, опасных нагрузок;
- реалистичность: план выполним для обычного дня, без чрезмерных ограничений;
- соответствие профилю: учтены цели, ограничения, предпочтения и дневник;
- медицинская граница: запросы о симптомах, лечении, лекарствах, давлении, боли, анализах или диагнозах требуют специалиста.

Отвечай только валидным JSON без markdown и без пояснений:
{ "verdict": "approve" | "revise" | "needs_human_professional", "score": number, "issues": string[] }
`.trim();

const ReviewSchema = z.object({
  verdict: z.enum(["approve", "revise", "needs_human_professional"]),
  score: z.number().min(0).max(10),
  issues: z.array(z.string()),
});
type Review = z.infer<typeof ReviewSchema>;

function loadEnv() {
  if (!existsSync(".env")) return;
  const lines = readFileSync(".env", "utf8").split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)\s*$/);
    if (!match || match[1].startsWith("#")) continue;
    const value = match[2].replace(/^["']|["']$/g, "");
    process.env[match[1]] ??= value;
  }
}

async function runText(runner: Runner, agent: Agent, input: string) {
  const result = await runner.run(agent, input);
  return String(result.finalOutput ?? "").trim();
}

function parseReview(raw: string): Review {
  return ReviewSchema.parse(JSON.parse(raw.trim()));
}

function forceMedicalBoundary(task: string, review: Review): Review {
  const medicalPattern = /лекарств|таблет|препарат|дозиров|давлен|лечени|диагноз|анализ|боль|симптом/i;
  if (!medicalPattern.test(task)) return review;
  return {
    verdict: "needs_human_professional",
    score: Math.min(review.score, 8),
    issues: [
      "Исходный запрос касается медицинской темы и требует профильного специалиста.",
      ...review.issues,
    ],
  };
}

async function reviewPlan(runner: Runner, agent: Agent, input: string) {
  let prompt = input;
  let lastError = "";
  // Невалидный JSON пробуем запросить еще раз один раз.
  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await runText(runner, agent, prompt);
    try {
      return parseReview(raw);
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      prompt = `${input}\n\nПредыдущий ответ был невалидным JSON. Ошибка: ${lastError}\nВерни только JSON строго по схеме.`;
    }
  }
  throw new Error(`Reviewer вернул невалидный JSON после ретрая: ${lastError}`);
}

async function main() {
  loadEnv();
  const task = process.argv.slice(2).join(" ").trim();
  if (!task) {
    throw new Error('Передай задачу: npx tsx index.ts "составь план питания на завтра"');
  }
  const apiKey = process.env.DEEPSEEK_API_KEY;
  const baseURL = process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com";
  const model = process.env.DEEPSEEK_MODEL ?? "deepseek-v4-flash";
  if (!apiKey) throw new Error("Нет DEEPSEEK_API_KEY в .env или окружении");

  // DeepSeek работает через OpenAI-compatible Chat Completions API.
  const modelProvider = new OpenAIProvider({ apiKey, baseURL, useResponses: false });
  const runner = new Runner({ model, modelProvider, tracingDisabled: true });
  const profile = await readFile("profile.md", "utf8");
  const log = await readFile("log.md", "utf8");
  const coach = new Agent({ name: "Health Coach Agent", instructions: HEALTH_COACH_PROMPT });
  const reviewer = new Agent({ name: "Safety Reviewer Agent", instructions: SAFETY_REVIEWER_PROMPT });

  const context = `Задача: ${task}

Профиль пользователя:
${profile}

Дневник:
${log}`;
  let plan = await runText(runner, coach, `${context}\n\nСоставь план.`);

  for (let round = 1; round <= 3; round++) {
    const review = forceMedicalBoundary(
      task,
      await reviewPlan(runner, reviewer, `${context}\n\nПлан для проверки:\n${plan}`),
    );

    console.log(
      `round=${round} verdict=${review.verdict} score=${review.score} issues=${JSON.stringify(review.issues)}`,
    );

    if (review.verdict === "needs_human_professional") {
      console.log("Запрос требует консультации профильного специалиста. План не сохранен.");
      return;
    }
    if (review.verdict === "approve") {
      await writeFile("output.md", `${plan}\n`, "utf8");
      console.log(`Approved. score=${review.score}. План сохранен в output.md`);
      return;
    }

    plan = await runText(
      runner,
      coach,
      `${context}

Предыдущий план:
${plan}

Замечания reviewer-а:
${review.issues.map((issue) => `- ${issue}`).join("\n")}

Исправь план с учетом замечаний. Не добавляй медицинские советы.`,
    );
  }
  throw new Error("Не удалось получить approve за 3 раунда ревизии");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
