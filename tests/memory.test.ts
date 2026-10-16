import assert from "node:assert/strict";
import test from "node:test";
import type { McpToolInvoker } from "../src/harness/events";
import { hasExplicitPreferenceSignal, updateMemoryAfterApprove } from "../src/os/memory";

for (const phrase of ["Запомни: люблю рис", "мне понравилось блюдо", "мне нравятся овощи", "я предпочитаю рыбу", "не люблю молоко"]) {
  test(`recognizes explicit preference: ${phrase}`, () => assert.equal(hasExplicitPreferenceSignal(phrase), true));
}

test("ordinary plan request does not imply permission to store preferences", () => {
  assert.equal(hasExplicitPreferenceSignal("Составь план на завтра"), false);
});

test("writes compact markdown-free log with date and module, without preferences", async () => {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const callMcpTool: McpToolInvoker = async (name, args) => { calls.push({ name, args }); };
  await updateMemoryAfterApprove({ task: "План на завтра", module: "dailyPlan", plan: "# План\n**Овощи**\n```secret block```\n" + "а".repeat(500), callMcpTool });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, "append_daily_log");
  const entry = String(calls[0].args.entry);
  assert.match(entry, /^## \d{4}-\d{2}-\d{2}/);
  assert.match(entry, /Тип запроса: dailyPlan/);
  assert.match(entry, /План Овощи/);
  assert.doesNotMatch(entry, /secret block|\*\*/);
  assert.ok(entry.split("- Результат: ")[1].length <= 280);
});

test("writes explicit preferences only after daily log succeeds", async () => {
  const names: string[] = [];
  await updateMemoryAfterApprove({ task: "Запомни: люблю рис", plan: "Рис с овощами", module: "recipes", callMcpTool: async (name) => { names.push(name); } });
  assert.deepEqual(names, ["append_daily_log", "update_preferences"]);
});

test("propagates failed log write and does not write preferences afterwards", async () => {
  const names: string[] = [];
  await assert.rejects(updateMemoryAfterApprove({ task: "Запомни: люблю рис", plan: "Рис", module: "recipes", callMcpTool: async (name) => { names.push(name); throw new Error("MCP failed"); } }), /MCP failed/);
  assert.deepEqual(names, ["append_daily_log"]);
});
