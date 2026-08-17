import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { tool } from "@openai/agents-core";
import { z } from "zod";

function takeRecentDays(log: string, days: number) {
  const intro = log.split(/\r?\n##\s+/)[0].trim();
  const entries = log.match(/^##\s+[\s\S]*?(?=^##\s+|\s*$)/gm) ?? [];
  const recentEntries = entries.slice(-days).map((entry) => entry.trim());
  return [intro, ...recentEntries].filter(Boolean).join("\n\n");
}

export function createGetRecentLogTool(onCall?: (name: string) => void) {
  return tool({
    name: "getRecentLog",
    description:
      "Возвращает последние N дней локального дневника из data/log.md. Используй, когда пользователь просит учитывать лог, последние дни, сон, питание, самочувствие, активность, голод, энергию или восстановление. Обычно достаточно 3-7 дней; не запрашивай больше без явной причины.",
    parameters: z.object({
      days: z
        .number()
        .int()
        .min(1)
        .max(30)
        .describe("Сколько последних дней дневника нужно вернуть. Минимум 1, максимум 30."),
    }),
    async execute({ days }) {
      onCall?.("getRecentLog");
      const log = await readFile(join(process.cwd(), "data", "log.md"), "utf8");
      return takeRecentDays(log, days);
    },
  });
}
