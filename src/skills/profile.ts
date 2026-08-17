import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { tool } from "@openai/agents-core";
import { z } from "zod";

export function createGetProfileTool(onCall?: (name: string) => void) {
  return tool({
    name: "getProfile",
    description:
      "Возвращает полный локальный профиль пользователя из data/profile.md: цели, предпочтения в еде, ограничения, уровень активности, сон и доступный инвентарь. Вызывай перед персонализацией плана, если задача зависит от привычек, питания, тренировок или ограничений пользователя.",
    parameters: z.object({}),
    async execute() {
      onCall?.("getProfile");
      return readFile(join(process.cwd(), "data", "profile.md"), "utf8");
    },
  });
}
