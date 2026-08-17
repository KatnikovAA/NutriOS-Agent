import { runHealthAgent } from "../../../../src/harness/runHealthAgent";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { task?: unknown };
    if (typeof body.task !== "string" || !body.task.trim()) {
      return Response.json({ error: "Передай непустую задачу" }, { status: 400 });
    }
    return Response.json(await runHealthAgent(body.task));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось запустить агента";
    return Response.json({ error: message }, { status: 500 });
  }
}
