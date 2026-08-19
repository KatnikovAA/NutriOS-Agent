import { Agent, type MCPServer, Runner } from "@openai/agents-core";
import { OpenAIProvider } from "@openai/agents-openai";
import { createHealthCoachAgent } from "../agents/healthCoach";
import { createSafetyReviewerAgent } from "../agents/safetyReviewer";
import type { KnowledgeRetrievalTrace } from "../rag/types";
import { createSearchKnowledgeTool } from "../skills/knowledge";
import { createGenerateShoppingListTool } from "../skills/shopping";
import { createSuggestWorkoutTemplateTool } from "../skills/workouts";
import { loadEnv } from "./env";
import { connectConfiguredMcpServers, extractRawToolName, formatToolCallName, type ToolSource } from "./mcpServers";
import { loadActivePrompts, type ActivePromptVersions } from "./promptVersions";
import { appendRound, type RoundState } from "./rounds";
import { calculateFinalScore, calculateImproved } from "./score";
import { traceRun } from "./traceRun";
import { validateReviewWithRetry, type Review } from "./validateReview";

const DEEPSEEK_TOOL_MODEL_SETTINGS = {
  // Agents SDK 0.16 does not preserve DeepSeek reasoning_content across a tool loop.
  providerData: { thinking: { type: "disabled" } },
};

export type HealthAgentResult = {
  plan: string | null;
  review: Review;
  rounds: RoundState[];
  finalScore: number;
  improved: boolean;
  promptVersions: ActivePromptVersions;
  durationMs: number;
  toolCalls: string[];
  retrievals: KnowledgeRetrievalTrace[];
};

type RunWithItems = {
  finalOutput?: unknown;
  newItems?: { rawItem?: { type?: string; name?: string } }[];
};

function extractToolCallNames(result: RunWithItems) {
  return (
    result.newItems
      ?.map((item) => item.rawItem)
      .filter((item) => item?.type === "function_call" && typeof item.name === "string")
      .map((item) => item.name as string) ?? []
  );
}

function recordToolCall(toolCalls: string[], toolSources: Map<string, ToolSource>, name: string) {
  toolCalls.push(formatToolCallName(name, toolSources));
}

function hasToolCall(toolCalls: string[], name: string) {
  return toolCalls.some((toolCall) => extractRawToolName(toolCall) === name);
}

async function runText(
  runner: Runner,
  agent: Agent,
  input: string,
  toolCalls: string[] = [],
  toolSources = new Map<string, ToolSource>(),
) {
  const beforeCount = toolCalls.length;
  const result = await runner.run(agent, input);
  const itemCalls = extractToolCallNames(result);
  const callbackCalls = toolCalls.slice(beforeCount).map(extractRawToolName);
  for (const itemCall of itemCalls) {
    const matchingCallbackIndex = callbackCalls.indexOf(itemCall);
    if (matchingCallbackIndex >= 0) {
      callbackCalls.splice(matchingCallbackIndex, 1);
    } else {
      recordToolCall(toolCalls, toolSources, itemCall);
    }
  }
  return String(result.finalOutput ?? "").trim();
}

function forceMedicalBoundary(task: string, review: Review): Review {
  const boundaryText = `${task}\n${review.issues.join("\n")}`;
  const medicalPattern =
    /лекарств|таблет|препарат|дозиров|давлен|лечени|диагноз|анализ|(?<![а-яё])боль(?![а-яё])|симптом/i;
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
  toolCalls: string[],
  retrievals: KnowledgeRetrievalTrace[],
): HealthAgentResult {
  return {
    plan,
    review,
    rounds,
    finalScore: calculateFinalScore(rounds),
    improved: calculateImproved(rounds),
    promptVersions,
    durationMs: Date.now() - startTime,
    toolCalls,
    retrievals,
  };
}

async function buildAndTraceResult(
  task: string,
  model: string,
  plan: string | null,
  review: Review,
  rounds: RoundState[],
  promptVersions: ActivePromptVersions,
  startTime: number,
  toolCalls: string[],
  retrievals: KnowledgeRetrievalTrace[],
) {
  const result = buildResult(plan, review, rounds, promptVersions, startTime, toolCalls, retrievals);
  await traceRun(task, model, result);
  return result;
}

async function saveApprovedPlanWithMcp(
  runner: Runner,
  instructions: string,
  plan: string,
  mcpServers: MCPServer[],
  toolCalls: string[],
  toolSources: Map<string, ToolSource>,
) {
  const beforeCount = toolCalls.length;
  const savingAgent = createHealthCoachAgent(instructions, [], {
    mcpServers,
    modelSettings: DEEPSEEK_TOOL_MODEL_SETTINGS,
    toolUseBehavior: { stopAtToolNames: ["save_health_plan"] },
  });

  // Harness controls persistence: this save path runs only after approve.
  // DeepSeek thinking-mode rejects forced toolChoice, so we verify the call and allow one retry.
  for (let attempt = 1; attempt <= 2; attempt++) {
    await runText(
      runner,
      savingAgent,
      `Safety reviewer вернул verdict=approve. Вызови только tool save_health_plan и сохрани этот финальный план без изменений. Не отвечай текстом вместо tool-вызова.\n\n${plan}`,
      toolCalls,
      toolSources,
    );
    if (hasToolCall(toolCalls.slice(beforeCount), "save_health_plan")) return;
  }

  throw new Error("Финальный план одобрен, но save_health_plan не был вызван после двух попыток");
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
  const toolCalls: string[] = [];
  const retrievals: KnowledgeRetrievalTrace[] = [];
  const mcp = await connectConfiguredMcpServers();
  const recordLocalToolCall = (name: string) => recordToolCall(toolCalls, mcp.toolSources, name);
  const recordKnowledgeRetrieval = (event: KnowledgeRetrievalTrace) => {
    recordLocalToolCall("searchKnowledge");
    retrievals.push(event);
  };

  try {
    const healthCoachAgent = createHealthCoachAgent(
      prompts.coach,
      [
        createSearchKnowledgeTool(recordKnowledgeRetrieval),
        createSuggestWorkoutTemplateTool(recordLocalToolCall),
        createGenerateShoppingListTool(recordLocalToolCall),
      ],
      { mcpServers: mcp.servers, modelSettings: DEEPSEEK_TOOL_MODEL_SETTINGS },
    );
    const safetyReviewerAgent = createSafetyReviewerAgent(prompts.reviewer);
    let plan = await runText(
      runner,
      healthCoachAgent,
      `Задача пользователя: ${cleanTask}\n\nСоставь полезный ответ. Если для качества нужны профиль, дневник, рецепты, тренировка или список покупок, сам вызови доступные tools.`,
      toolCalls,
      mcp.toolSources,
    );
    let rounds: RoundState[] = [];

    for (let round = 1; round <= maxRounds; round++) {
      const review = forceMedicalBoundary(
        cleanTask,
        await validateReviewWithRetry(`План для проверки:\n${plan}`, (prompt) =>
          runText(runner, safetyReviewerAgent, prompt, toolCalls, mcp.toolSources),
        ),
      );
      rounds = appendRound(rounds, { round, plan, review });
      console.log(
        `round=${round} verdict=${review.verdict} score=${review.score} issues=${JSON.stringify(review.issues)}`,
      );

      if (review.verdict === "needs_human_professional") {
        return buildAndTraceResult(
          cleanTask,
          model,
          null,
          review,
          rounds,
          versions,
          startTime,
          toolCalls,
          retrievals,
        );
      }
      if (review.verdict === "approve") {
        await saveApprovedPlanWithMcp(runner, prompts.coach, plan, mcp.servers, toolCalls, mcp.toolSources);
        return buildAndTraceResult(
          cleanTask,
          model,
          plan,
          review,
          rounds,
          versions,
          startTime,
          toolCalls,
          retrievals,
        );
      }

      plan = await runText(
        runner,
        healthCoachAgent,
        `Задача пользователя: ${cleanTask}\n\nПредыдущий план:\n${plan}\n\nЗамечания reviewer-а:\n${review.issues.map((issue) => `- ${issue}`).join("\n")}\n\nИсправь план с учетом замечаний. Если нужны профиль, дневник или рецепты, используй tools. Не добавляй медицинские советы.`,
        toolCalls,
        mcp.toolSources,
      );
    }
    const lastRound = rounds.at(-1);
    if (lastRound) {
      await buildAndTraceResult(
        cleanTask,
        model,
        null,
        lastRound.review,
        rounds,
        versions,
        startTime,
        toolCalls,
        retrievals,
      );
    }
    throw new Error(`Не удалось получить approve за ${maxRounds} раунда ревизии`);
  } finally {
    await mcp.close();
  }
}
