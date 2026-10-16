import assert from "node:assert/strict";
import test from "node:test";
import { validateReviewWithRetry } from "../src/harness/validateReview";

test("accepts valid safety stop without upgrading its score", async () => {
  const review = { verdict: "needs_human_professional", score: 2, issues: ["Нужен врач"] };
  assert.deepEqual(await validateReviewWithRetry("plan", async () => JSON.stringify(review)), review);
});

test("normalizes an issue-free approval to the minimum approved score", async () => {
  const result = await validateReviewWithRetry("plan", async () =>
    JSON.stringify({ verdict: "approve", score: 3, issues: [] }),
  );
  assert.equal(result.score, 7);
});

test("retries malformed JSON once and includes original input in repair prompt", async () => {
  const inputs: string[] = [];
  const result = await validateReviewWithRetry("original plan", async (prompt) => {
    inputs.push(prompt);
    return inputs.length === 1 ? "not JSON" : JSON.stringify({ verdict: "revise", score: 5, issues: ["Уточнить"] });
  });
  assert.equal(inputs.length, 2);
  assert.match(inputs[1], /original plan/);
  assert.match(inputs[1], /невалидным JSON/);
  assert.equal(result.verdict, "revise");
});

for (const invalid of [
  "broken JSON",
  JSON.stringify({ verdict: "approve", score: 11, issues: [] }),
  JSON.stringify({ verdict: "unknown", score: 7, issues: [] }),
  JSON.stringify({ verdict: "approve", score: 7 }),
]) {
  test(`rejects invalid review after exactly two attempts: ${invalid}`, async () => {
    let calls = 0;
    await assert.rejects(validateReviewWithRetry("plan", async () => { calls++; return invalid; }), /невалидный JSON после ретрая/);
    assert.equal(calls, 2);
  });
}

test("propagates provider errors without treating them as approval", async () => {
  await assert.rejects(validateReviewWithRetry("plan", async () => { throw new Error("provider unavailable"); }), /provider unavailable/);
});
