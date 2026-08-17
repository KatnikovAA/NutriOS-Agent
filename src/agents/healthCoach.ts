import { Agent } from "@openai/agents-core";

export function createHealthCoachAgent(instructions: string) {
  return new Agent({ name: "Health Coach Agent", instructions });
}
