import type { Review } from "./validateReview";

export type RoundState = {
  round: number;
  plan: string;
  review: Review;
};

export function appendRound(history: RoundState[], state: RoundState) {
  return [...history, state];
}
