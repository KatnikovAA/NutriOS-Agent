import assert from "node:assert/strict";
import test from "node:test";
import { appendRound, type RoundState } from "../src/harness/rounds";
import { calculateFinalScore, calculateImproved } from "../src/harness/score";

function round(score: number, verdict: RoundState["review"]["verdict"] = "revise"): RoundState {
  return { round: 1, plan: "plan", review: { score, verdict, issues: [] } };
}

test("empty run has zero score and no improvement", () => {
  assert.equal(calculateFinalScore([]), 0);
  assert.equal(calculateImproved([]), false);
});

test("uses latest approved score or last review score when not approved", () => {
  assert.equal(calculateFinalScore([round(3), round(8, "approve"), round(4)]), 8);
  assert.equal(calculateFinalScore([round(3), round(8, "approve"), round(9, "approve")]), 9);
  assert.equal(calculateFinalScore([round(3), round(2, "needs_human_professional")]), 2);
});

test("detects improvement and does not mistake flat or declining scores for improvement", () => {
  assert.equal(calculateImproved([round(3), round(7)]), true);
  assert.equal(calculateImproved([round(7), round(7), round(4)]), false);
  assert.equal(calculateImproved([round(7)]), false);
});

test("appending a round preserves the original history", () => {
  const history = [round(3)];
  const result = appendRound(history, round(8, "approve"));
  assert.equal(history.length, 1);
  assert.equal(result.length, 2);
  assert.notEqual(result, history);
});
