import { Agent, type AgentOptions, type Tool } from "@openai/agents-core";

export function createHealthCoachAgent(
  instructions: string,
  tools: Tool[] = [],
  options: Pick<AgentOptions, "modelSettings" | "toolUseBehavior"> = {},
) {
  return new Agent({ name: "Health Coach Agent", instructions, tools, ...options });
}
