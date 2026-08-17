import { Agent } from "@openai/agents-core";

export function createSafetyReviewerAgent(instructions: string) {
  return new Agent({ name: "Safety Reviewer Agent", instructions });
}
