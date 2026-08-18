import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const dataDir = join(process.cwd(), "data");

function dataFile(name: string) {
  return join(dataDir, name);
}

async function readMarkdownFile(name: string) {
  return readFile(dataFile(name), "utf8");
}

function takeRecentDays(log: string, days: number) {
  const intro = log.split(/\r?\n##\s+/)[0].trim();
  const entries = log.match(/^##\s+[\s\S]*?(?=^##\s+|\s*$)/gm) ?? [];
  const recentEntries = entries.slice(-days).map((entry) => entry.trim());
  return [intro, ...recentEntries].filter(Boolean).join("\n\n");
}

function textResult(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

function jsonResult(value: unknown) {
  return textResult(JSON.stringify(value));
}

function createMarkdownHealthServer() {
  const server = new McpServer({
    name: "markdown-health-data",
    version: "1.0.0",
  });

  server.registerTool(
    "read_profile",
    {
      description:
        "Возвращает полный локальный профиль пользователя из data/profile.md: цели, предпочтения в еде, ограничения, уровень активности, сон и доступный инвентарь. Вызывай перед персонализацией wellness-плана.",
      inputSchema: z.object({}),
    },
    async () => textResult(await readMarkdownFile("profile.md")),
  );

  server.registerTool(
    "read_recent_logs",
    {
      description:
        "Возвращает последние N дней локального дневника из data/log.md. Используй, когда пользователь просит учитывать лог, последние дни, сон, питание, самочувствие, активность, голод, энергию или восстановление.",
      inputSchema: z.object({
        days: z
          .number()
          .int()
          .min(1)
          .max(30)
          .describe("Сколько последних дней дневника нужно вернуть. Минимум 1, максимум 30."),
      }),
    },
    async ({ days }) => textResult(takeRecentDays(await readMarkdownFile("log.md"), days)),
  );

  server.registerTool(
    "append_daily_log",
    {
      description:
        "Добавляет новую markdown-запись в конец data/log.md. Используй только когда пользователь явно просит записать дневниковую заметку или сохранить запись дня.",
      inputSchema: z.object({
        entry: z.string().min(1).describe("Markdown-запись дневника, которую нужно добавить в data/log.md."),
      }),
    },
    async ({ entry }) => {
      await mkdir(dataDir, { recursive: true });
      await appendFile(dataFile("log.md"), `\n\n${entry.trim()}\n`, "utf8");
      return jsonResult({ ok: true });
    },
  );

  server.registerTool(
    "save_health_plan",
    {
      description:
        "Сохраняет уже одобренный safety reviewer-ом markdown-план в data/output.md. Не вызывай для черновиков, ревизий или медицинских запросов.",
      inputSchema: z.object({
        markdown: z
          .string()
          .min(1)
          .describe("Полный финальный markdown-план, который уже прошел safety review и должен быть сохранен."),
      }),
    },
    async ({ markdown }) => {
      await mkdir(dataDir, { recursive: true });
      await writeFile(dataFile("output.md"), `${markdown.trim()}\n`, "utf8");
      return jsonResult({ ok: true });
    },
  );

  server.registerTool(
    "list_recipes",
    {
      description:
        "Возвращает локальный список любимых простых рецептов из data/recipes.md. Используй, когда нужно подобрать блюда без долгой готовки, разнообразить рацион или собрать план из привычных продуктов пользователя.",
      inputSchema: z.object({}),
    },
    async () => textResult(await readMarkdownFile("recipes.md")),
  );

  server.registerResource(
    "profile",
    "profile://me",
    {
      title: "Health profile",
      description: "Локальный профиль пользователя из data/profile.md.",
      mimeType: "text/markdown",
    },
    async (uri) => ({
      contents: [{ uri: uri.href, mimeType: "text/markdown", text: await readMarkdownFile("profile.md") }],
    }),
  );

  server.registerResource(
    "recent_logs",
    "logs://recent",
    {
      title: "Recent health logs",
      description: "Последние записи локального дневника из data/log.md.",
      mimeType: "text/markdown",
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "text/markdown",
          text: takeRecentDays(await readMarkdownFile("log.md"), 7),
        },
      ],
    }),
  );

  server.registerResource(
    "recipes",
    "recipes://all",
    {
      title: "Favorite recipes",
      description: "Локальные любимые рецепты из data/recipes.md.",
      mimeType: "text/markdown",
    },
    async (uri) => ({
      contents: [{ uri: uri.href, mimeType: "text/markdown", text: await readMarkdownFile("recipes.md") }],
    }),
  );

  server.registerResource(
    "latest_plan",
    "plans://latest",
    {
      title: "Latest approved plan",
      description: "Последний одобренный план из data/output.md.",
      mimeType: "text/markdown",
    },
    async (uri) => ({
      contents: [{ uri: uri.href, mimeType: "text/markdown", text: await readMarkdownFile("output.md") }],
    }),
  );

  return server;
}

async function main() {
  const server = createMarkdownHealthServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
