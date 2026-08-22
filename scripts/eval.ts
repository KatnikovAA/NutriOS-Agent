import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { runOS } from "../src/os/runOS";
import type { Review } from "../src/harness/validateReview";

type EvalCase = {
  name: string;
  task: string;
  expect: {
    module?: string;
    verdict: Review["verdict"];
    minScore?: number;
    requiredToolCalls?: string[];
  };
};

type EvalRow = {
  name: string;
  status: "PASS" | "FAIL";
  expected: string;
  actual: string;
  expectedModule: string;
  actualModule: string;
  score: number;
  rounds: number;
  toolCalls: string;
};

function formatExpected(testCase: EvalCase) {
  const moduleRule = testCase.expect.module ? ` module=${testCase.expect.module}` : "";
  const scoreRule = testCase.expect.minScore === undefined ? "" : ` score>=${testCase.expect.minScore}`;
  const toolsRule = testCase.expect.requiredToolCalls?.length
    ? ` tools=${testCase.expect.requiredToolCalls.join(",")}`
    : "";
  return `${testCase.expect.verdict}${moduleRule}${scoreRule}${toolsRule}`;
}

function extractRawToolName(toolCall: string) {
  return toolCall.match(/^\[[^\]]+\]\s*(.+)$/)?.[1] ?? toolCall;
}

function isPassing(testCase: EvalCase, result: Awaited<ReturnType<typeof runOS>>) {
  if (result.review.verdict !== testCase.expect.verdict) return false;
  if (testCase.expect.module && result.module !== testCase.expect.module) return false;
  if (testCase.expect.minScore !== undefined && result.finalScore < testCase.expect.minScore) return false;
  if (testCase.expect.verdict === "needs_human_professional" && result.plan !== null) return false;
  const calledTools = result.toolCalls.map(extractRawToolName);
  if (testCase.expect.requiredToolCalls?.some((toolName) => !calledTools.includes(toolName))) return false;
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
    const result = await runOS(testCase.task, undefined, { updateMemory: false });
    rows.push({
      name: testCase.name,
      status: isPassing(testCase, result) ? "PASS" : "FAIL",
      expected: formatExpected(testCase),
      actual: result.review.verdict,
      score: result.finalScore,
      expectedModule: testCase.expect.module ?? "-",
      actualModule: result.module,
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
