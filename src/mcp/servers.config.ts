import { join } from "node:path";

const npxCommand = process.platform === "win32" ? "npx.cmd" : "npx";
const projectRoot = process.cwd();

export type McpServerConfig = {
  name: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
  enabled: boolean;
  enableWhenEnv?: string;
  clientSessionTimeoutSeconds?: number;
};

export const mcpServerConfigs: McpServerConfig[] = [
  {
    name: "markdown-health",
    command: npxCommand,
    args: ["tsx", "src/mcp/markdownHealthServer.ts"],
    enabled: true,
  },
  {
    name: "filesystem",
    command: npxCommand,
    args: [
      "-y",
      "@modelcontextprotocol/server-filesystem",
      join(projectRoot, "data"),
      join(projectRoot, "plans"),
    ],
    enabled: true,
  },
  {
    name: "weather",
    command: npxCommand,
    args: ["-y", "@cyanheads/open-meteo-mcp-server@0.3.4"],
    env: {
      MCP_TRANSPORT_TYPE: "stdio",
      MCP_LOG_LEVEL: "error",
    },
    enabled: true,
    clientSessionTimeoutSeconds: 30,
  },
  {
    name: "notion",
    command: npxCommand,
    args: ["-y", "@notionhq/notion-mcp-server"],
    env: {
      NOTION_TOKEN: "$NOTION_TOKEN",
    },
    enabled: false,
    enableWhenEnv: "NOTION_TOKEN",
    clientSessionTimeoutSeconds: 30,
  },
];
