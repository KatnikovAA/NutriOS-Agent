import { loadEnv } from "./env";
import { connectConfiguredMcpServers } from "./mcpServers";

type TextContent = {
  type: "text";
  text: string;
};

export type SavePlanToNotionResult = {
  id: string;
  url: string;
  title: string;
  toolCalls: string[];
};

function firstText(content: unknown) {
  const items = Array.isArray(content) ? content : [];
  const textItem = items.find((item): item is TextContent => {
    return Boolean(
      item &&
        typeof item === "object" &&
        "type" in item &&
        item.type === "text" &&
        "text" in item &&
        typeof item.text === "string",
    );
  });
  return textItem?.text ?? "";
}

function parseToolJson(content: unknown) {
  const text = firstText(content);
  if (!text) throw new Error("Notion MCP вернул пустой ответ");
  return JSON.parse(text);
}

function extractPageTitle(page: any) {
  const titleProperty = page?.properties?.title;
  const titleParts = Array.isArray(titleProperty?.title) ? titleProperty.title : [];
  return titleParts.map((part: any) => part?.plain_text).filter(Boolean).join("");
}

function findWellnessPage(searchResult: any) {
  const pages = Array.isArray(searchResult?.results) ? searchResult.results : [];
  const exactPage = pages.find((page: any) => page?.object === "page" && extractPageTitle(page) === "Wellness");
  return exactPage ?? pages.find((page: any) => page?.object === "page");
}

function defaultNotionTitle() {
  return `NutriOS plan ${new Date().toISOString().slice(0, 10)}`;
}

export async function savePlanToNotion(markdown: string, title = defaultNotionTitle()): Promise<SavePlanToNotionResult> {
  loadEnv();
  const mcp = await connectConfiguredMcpServers(["notion"]);
  const toolCalls: string[] = [];

  try {
    const notion = mcp.servers.find((server) => server.name === "notion");
    if (!notion) {
      throw new Error("Notion не настроен: добавь NOTION_TOKEN в .env и дай integration доступ к странице Wellness");
    }

    toolCalls.push("[notion] API-post-search");
    const searchContent = await notion.callTool("API-post-search", {
      query: "Wellness",
      filter: { value: "page", property: "object" },
      page_size: 10,
    });
    const wellnessPage = findWellnessPage(parseToolJson(searchContent));
    if (!wellnessPage?.id) {
      throw new Error("Notion MCP не нашел страницу Wellness. Проверь, что integration подключена к этой странице.");
    }

    toolCalls.push("[notion] API-post-page");
    const createdContent = await notion.callTool("API-post-page", {
      parent: { page_id: wellnessPage.id },
      properties: {
        title: {
          title: [{ type: "text", text: { content: title } }],
        },
      },
    });
    const createdPage = parseToolJson(createdContent);
    if (!createdPage?.id || !createdPage?.url) {
      throw new Error("Notion MCP создал страницу, но не вернул id/url");
    }

    toolCalls.push("[notion] API-update-page-markdown");
    await notion.callTool("API-update-page-markdown", {
      page_id: createdPage.id,
      type: "replace_content",
      replace_content: {
        new_str: markdown,
      },
    });

    return {
      id: createdPage.id,
      url: createdPage.url,
      title,
      toolCalls,
    };
  } finally {
    await mcp.close();
  }
}
