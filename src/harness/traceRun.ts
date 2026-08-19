import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { HealthAgentResult } from "./runHealthAgent";

export type RunTrace = {
  runId: string;
  task: string;
  promptVersions: HealthAgentResult["promptVersions"];
  model: string;
  rounds: {
    round: number;
    planExcerpt: string;
    review: HealthAgentResult["review"];
  }[];
  toolCalls: string[];
  retrievals: HealthAgentResult["retrievals"];
  finalScore: number;
  verdict: HealthAgentResult["review"]["verdict"];
  durationMs: number;
  createdAt: string;
};

function buildRunId(createdAt: string) {
  return `run-${createdAt.replace(/[:.]/g, "-")}`;
}

export async function traceRun(task: string, model: string, result: HealthAgentResult) {
  const createdAt = new Date().toISOString();
  const runId = buildRunId(createdAt);
  const trace: RunTrace = {
    runId,
    task,
    promptVersions: result.promptVersions,
    model,
    rounds: result.rounds.map((round) => ({
      round: round.round,
      planExcerpt: round.plan.slice(0, 500),
      review: round.review,
    })),
    toolCalls: result.toolCalls,
    retrievals: result.retrievals,
    finalScore: result.finalScore,
    verdict: result.review.verdict,
    durationMs: result.durationMs,
    createdAt,
  };

  try {
    const runsDir = join(process.cwd(), "runs");
    await mkdir(runsDir, { recursive: true });
    await writeFile(join(runsDir, `${runId}.json`), `${JSON.stringify(trace, null, 2)}\n`, "utf8");
    return trace;
  } catch (error) {
    console.warn(`Не удалось сохранить trace run: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}
