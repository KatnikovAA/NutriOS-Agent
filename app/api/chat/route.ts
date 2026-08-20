import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  type UIMessageStreamWriter,
} from "ai";

import type { ChatMessage } from "../../../src/chat/types";
import { runHealthAgent } from "../../../src/harness/runHealthAgent";

export const runtime = "nodejs";
export const maxDuration = 300;

function getTask(message: ChatMessage | undefined) {
  if (!message || message.role !== "user") return "";
  return message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("\n")
    .trim();
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
  let message: ChatMessage | undefined;
  try {
    const body = (await request.json()) as { message?: ChatMessage };
    message = body.message;
  } catch {
    return Response.json({ error: "Передай непустую задачу" }, { status: 400 });
  }

  const task = getTask(message);
  if (!message || !task) {
    return Response.json({ error: "Передай непустую задачу" }, { status: 400 });
  }

  const stream = createUIMessageStream<ChatMessage>({
    originalMessages: [message],
    async execute({ writer }) {
      const result = await runHealthAgent(task, undefined, {
        onEvent(event) {
          if (event.type === "stage") {
            writer.write({ type: "data-stage", id: event.id, data: event });
          } else if (event.type === "tool_call") {
            writer.write({ type: "data-toolCall", id: event.id, data: event });
          } else {
            writer.write({ type: "data-result", id: event.id, data: event });
          }
        },
      });

      if (result.review.verdict === "approve" && result.plan) {
        await writeApprovedPlan(writer, result.plan);
      }
    },
    onError() {
      return "Не удалось завершить работу агента";
    },
  });

  return createUIMessageStreamResponse({ stream });
}
