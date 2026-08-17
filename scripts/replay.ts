import { readFile } from "node:fs/promises";
import { runHealthAgent } from "../src/harness/runHealthAgent";
import { type RunTrace } from "../src/harness/traceRun";

type ComparableRun = {
  verdict: string;
  score: number;
  rounds: number;
  toolCalls: string[];
  promptVersions: unknown;
};

function sameJson(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function formatValue(value: unknown) {
  if (Array.isArray(value)) return value.length > 0 ? value.join(", ") : "-";
  if (typeof value === "object" && value !== null) return JSON.stringify(value);
  return String(value);
}

function printComparison(oldRun: ComparableRun, newRun: ComparableRun) {
  const rows = [
    ["verdict", oldRun.verdict, newRun.verdict, oldRun.verdict === newRun.verdict],
    ["score", oldRun.score, newRun.score, oldRun.score === newRun.score],
    ["rounds", oldRun.rounds, newRun.rounds, oldRun.rounds === newRun.rounds],
    ["toolCalls", oldRun.toolCalls, newRun.toolCalls, sameJson(oldRun.toolCalls, newRun.toolCalls)],
    [
      "promptVersions",
      oldRun.promptVersions,
      newRun.promptVersions,
      sameJson(oldRun.promptVersions, newRun.promptVersions),
    ],
  ] as const;

  console.log("| field | old | new | diff |");
  console.log("| --- | --- | --- | --- |");
  for (const [field, oldValue, newValue, isSame] of rows) {
    console.log(`| ${field} | ${formatValue(oldValue)} | ${formatValue(newValue)} | ${isSame ? "same" : "changed"} |`);
  }
}

async function main() {
  const tracePath = process.argv[2];
  if (!tracePath) {
    throw new Error("Передай путь к trace: npm run replay runs/run-XXX.json");
  }

  const trace = JSON.parse(await readFile(tracePath, "utf8")) as RunTrace;
  const result = await runHealthAgent(trace.task);

  const oldRun: ComparableRun = {
    verdict: trace.verdict,
    score: trace.finalScore,
    rounds: trace.rounds.length,
    toolCalls: trace.toolCalls,
    promptVersions: trace.promptVersions,
  };
  const newRun: ComparableRun = {
    verdict: result.review.verdict,
    score: result.finalScore,
    rounds: result.rounds.length,
    toolCalls: result.toolCalls,
    promptVersions: result.promptVersions,
  };

  console.log(`Replay task: ${trace.task}`);
  console.log(`Trace: ${trace.runId} (${trace.createdAt})`);
  printComparison(oldRun, newRun);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
