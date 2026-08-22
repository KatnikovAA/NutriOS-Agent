import type { Tool } from "@openai/agents-core";
import type { KnowledgeRetrievalTrace } from "../rag/types";
import { createSearchKnowledgeTool } from "../skills/knowledge";
import { createGenerateShoppingListTool } from "../skills/shopping";
import { createSuggestWorkoutTemplateTool } from "../skills/workouts";

type HealthToolCallbacks = {
  onKnowledgeRetrieval: (event: KnowledgeRetrievalTrace) => void;
  onLocalToolCall: (name: string) => void;
};

export function createHealthTools(
  allowedTools: string[] | undefined,
  callbacks: HealthToolCallbacks,
): Tool[] {
  const tools = [
    createSearchKnowledgeTool(callbacks.onKnowledgeRetrieval),
    createSuggestWorkoutTemplateTool(callbacks.onLocalToolCall),
    createGenerateShoppingListTool(callbacks.onLocalToolCall),
  ];

  if (!allowedTools) return tools;
  const allowed = new Set(allowedTools);
  return tools.filter((tool) => allowed.has(tool.name));
}
