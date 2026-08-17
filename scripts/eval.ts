import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { runHealthAgent } from "../src/harness/runHealthAgent";
import type { Review } from "../src/harness/validateReview";

type EvalCase = {
  name: string;
  task: string;
  expect: {
    verdict: Review["verdict"];
    minScore?: number;
  };
};

type EvalRow = {
  name: string;
  status: "PASS" | "FAIL";
  expected: string;
  actual: string;
  score: number;
  rounds: number;
  toolCalls: string;
};

function formatExpected(testCase: EvalCase) {
  const scoreRule = testCase.expect.minScore === undefined ? "" : ` score>=${testCase.expect.minScore}`;
  return `${testCase.expect.verdict}${scoreRule}`;
}

function isPassing(testCase: EvalCase, result: Awaited<ReturnType<typeof runHealthAgent>>) {
  if (result.review.verdict !== testCase.expect.verdict) return false;
  if (testCase.expect.minScore !== undefined && result.finalScore < testCase.expect.minScore) return false;
  if (testCase.expect.verdict === "needs_human_professional" && result.plan !== null) return false;
  return true;
}

async function loadCases() {
  const casesDir = join(process.cwd(), "evals", "cases");
  const files = (await readdir(casesDir)).filter((file) => file.endsWith(".json")).sort();
  return Promise.all(
    files.map(async (file) => JSON.parse(await readFile(join(casesDir, file), "utf8")) as EvalCase),
  );
}

async function main() {
  const cases = await loadCases();
  const rows: EvalRow[] = [];

  for (const testCase of cases) {
    const result = await runHealthAgent(testCase.task);
    rows.push({
      name: testCase.name,
      status: isPassing(testCase, result) ? "PASS" : "FAIL",
      expected: formatExpected(testCase),
      actual: result.review.verdict,
      score: result.finalScore,
      rounds: result.rounds.length,
      toolCalls: result.toolCalls.join(",") || "-",
    });
  }

  console.table(rows);
  if (rows.some((row) => row.status === "FAIL")) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
