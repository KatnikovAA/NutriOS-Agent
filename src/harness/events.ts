import type { KnowledgeRetrievalTrace } from "../rag/types";
import type { ActivePromptVersions } from "./promptVersions";
import type { RoundState } from "./rounds";
import type { Review } from "./validateReview";

export type HealthAgentStage =
  | "reading_profile"
  | "searching_knowledge"
  | "generating_plan"
  | "reviewing_safety"
  | "revising"
  | "final_approved_plan";

export type HealthAgentStageEvent = {
  type: "stage";
  id: string;
  stage: HealthAgentStage;
  status: "active" | "completed";
  round?: number;
  query?: string;
  verdict?: Review["verdict"];
  score?: number;
  issues?: string[];
};

export type HealthAgentToolCallEvent = {
  type: "tool_call";
  id: string;
  name: string;
  formattedName: string;
  source: "mcp" | "local" | "rag";
  server?: string;
  query?: string;
};

export type HealthAgentResultEvent = {
  type: "result";
  id: "result";
  review: Review;
  rounds: RoundState[];
  finalScore: number;
  improved: boolean;
  promptVersions: ActivePromptVersions;
  durationMs: number;
  toolCalls: string[];
  retrievals: KnowledgeRetrievalTrace[];
};

export type HealthAgentEvent = HealthAgentStageEvent | HealthAgentToolCallEvent | HealthAgentResultEvent;

export type HealthAgentEventHandler = (event: HealthAgentEvent) => void | Promise<void>;

export type HealthAgentRunOptions = {
  onEvent?: HealthAgentEventHandler;
};
