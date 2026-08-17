import type { RoundState } from "./rounds";

export function calculateFinalScore(rounds: RoundState[]) {
  const approvedRound = [...rounds].reverse().find((round) => round.review.verdict === "approve");
  return approvedRound?.review.score ?? rounds.at(-1)?.review.score ?? 0;
}

export function calculateImproved(rounds: RoundState[]) {
  if (rounds.length < 2) return false;
  return rounds.some((round, index) => index > 0 && round.review.score > rounds[index - 1].review.score);
}
