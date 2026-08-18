import { savePlanToNotion } from "../../../../src/harness/savePlanToNotion";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { markdown?: unknown; title?: unknown };
    if (typeof body.markdown !== "string" || !body.markdown.trim()) {
      return Response.json({ error: "Передай непустой markdown плана" }, { status: 400 });
    }
    if (body.title !== undefined && typeof body.title !== "string") {
      return Response.json({ error: "title должен быть строкой" }, { status: 400 });
    }

    const title = typeof body.title === "string" ? body.title.trim() : undefined;
    const result = await savePlanToNotion(body.markdown.trim(), title || undefined);
    return Response.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось сохранить план в Notion";
    return Response.json({ error: message }, { status: 500 });
  }
}
