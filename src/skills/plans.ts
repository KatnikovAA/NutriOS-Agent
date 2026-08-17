import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tool } from "@openai/agents-core";
import { z } from "zod";

export function createSavePlanTool(onCall?: (name: string) => void) {
  return tool({
    name: "savePlan",
    description:
      "Сохраняет уже одобренный safety reviewer-ом markdown-план в data/output.md. Этот tool должен использоваться только когда harness явно сообщает, что ревью завершилось verdict=approve; не вызывай его для черновиков, ревизий или медицинских запросов.",
    parameters: z.object({
      markdown: z
        .string()
        .min(1)
        .describe("Полный финальный markdown-план, который уже прошел safety review и должен быть сохранен в data/output.md."),
    }),
    async execute({ markdown }) {
      onCall?.("savePlan");
      await writeFile(join(process.cwd(), "data", "output.md"), `${markdown.trim()}\n`, "utf8");
      return { ok: true };
    },
  });
}
