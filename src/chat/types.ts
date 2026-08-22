import type { UIMessage } from "ai";
import type {
  HealthAgentResultEvent,
  HealthAgentModuleEvent,
  HealthAgentStageEvent,
  HealthAgentToolCallEvent,
} from "../harness/events";

export type ChatDataParts = {
  stage: HealthAgentStageEvent;
  toolCall: HealthAgentToolCallEvent;
  module: HealthAgentModuleEvent;
  result: HealthAgentResultEvent;
};

export type ChatMessage = UIMessage<unknown, ChatDataParts>;
