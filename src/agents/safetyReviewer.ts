import { Agent } from "@openai/agents-core";

export function createSafetyReviewerAgent(instructions: string) {
  // Reviewer intentionally has no tools: safety review must stay side-effect free.
  return new Agent({ name: "Safety Reviewer Agent", instructions });
}
