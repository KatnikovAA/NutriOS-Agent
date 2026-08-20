import type { UIMessage } from "ai";
import type {
  HealthAgentResultEvent,
  HealthAgentStageEvent,
  HealthAgentToolCallEvent,
} from "../harness/events";

export type ChatDataParts = {
  stage: HealthAgentStageEvent;
  toolCall: HealthAgentToolCallEvent;
  result: HealthAgentResultEvent;
};

export type ChatMessage = UIMessage<unknown, ChatDataParts>;
