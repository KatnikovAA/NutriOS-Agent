import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  type UIMessageStreamWriter,
} from "ai";

import type { ChatMessage } from "../../../src/chat/types";
import type { HealthAgentResultEvent } from "../../../src/harness/events";
import { runHealthAgent } from "../../../src/harness/runHealthAgent";

export const runtime = "nodejs";
export const maxDuration = 300;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseChatRequest(value: unknown) {
  if (!isRecord(value) || !isRecord(value.message)) return null;
  const { message } = value;
  if (message.role !== "user" || typeof message.id !== "string" || !message.id || !Array.isArray(message.parts)) {
    return null;
  }
  if (
    message.parts.length === 0 ||
    !message.parts.every(
      (part) => isRecord(part) && part.type === "text" && typeof part.text === "string",
    )
  ) {
    return null;
  }

  const parts = message.parts.map((part) => ({ type: "text" as const, text: part.text as string }));
  const task = parts.map((part) => part.text).join("\n").trim();
  if (!task) return null;
  return { message: { id: message.id, role: "user" as const, parts } satisfies ChatMessage, task };
}

async function writeApprovedPlan(writer: UIMessageStreamWriter<ChatMessage>, plan: string) {
  const id = "approved-plan";
  writer.write({ type: "text-start", id });
  for (const delta of plan.match(/\S+\s*/g) ?? [plan]) {
    writer.write({ type: "text-delta", id, delta });
    await new Promise((resolve) => setTimeout(resolve, 8));
  }
  writer.write({ type: "text-end", id });
}

export async function POST(request: Request) {
  let input: ReturnType<typeof parseChatRequest>;
  try {
    input = parseChatRequest(await request.json());
  } catch {
    return Response.json({ error: "Передай непустую задачу" }, { status: 400 });
  }

  if (!input) {
    return Response.json({ error: "Передай непустую задачу" }, { status: 400 });
  }
  const { message, task } = input;

  const stream = createUIMessageStream<ChatMessage>({
    originalMessages: [message],
    async execute({ writer }) {
      let resultEvent: HealthAgentResultEvent | undefined;
      const result = await runHealthAgent(task, undefined, {
        onEvent(event) {
          if (event.type === "stage") {
            writer.write({ type: "data-stage", id: event.id, data: event });
          } else if (event.type === "tool_call") {
            writer.write({ type: "data-toolCall", id: event.id, data: event });
          } else {
            resultEvent = event;
          }
        },
      });

      if (result.review.verdict === "approve" && result.plan) {
        await writeApprovedPlan(writer, result.plan);
      }
      if (resultEvent) {
        writer.write({ type: "data-result", id: resultEvent.id, data: resultEvent });
      }
    },
    onError() {
      return "Не удалось завершить работу агента";
    },
  });

  return createUIMessageStreamResponse({ stream });
}
