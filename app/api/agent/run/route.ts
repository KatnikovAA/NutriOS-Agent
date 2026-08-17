import { runHealthAgent } from "../../../../src/harness/runHealthAgent";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { task?: unknown; maxRounds?: unknown };
    if (typeof body.task !== "string" || !body.task.trim()) {
      return Response.json({ error: "Передай непустую задачу" }, { status: 400 });
    }
    if (
      body.maxRounds !== undefined &&
      (typeof body.maxRounds !== "number" || !Number.isInteger(body.maxRounds) || body.maxRounds < 1)
    ) {
      return Response.json({ error: "maxRounds должен быть целым числом больше 0" }, { status: 400 });
    }
    const maxRounds = typeof body.maxRounds === "number" ? body.maxRounds : undefined;
    return Response.json(await runHealthAgent(body.task, maxRounds));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось запустить агента";
    return Response.json({ error: message }, { status: 500 });
  }
}
