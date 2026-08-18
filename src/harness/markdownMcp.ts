import { MCPServerStdio } from "@openai/agents-core";

const npxCommand = process.platform === "win32" ? "npx.cmd" : "npx";

export function createMarkdownHealthMcpServer() {
  return new MCPServerStdio({
    name: "markdown-health-data",
    command: npxCommand,
    args: ["tsx", "src/mcp/markdownHealthServer.ts"],
    cwd: process.cwd(),
  });
}

export async function connectMarkdownHealthMcpServer() {
  const server = createMarkdownHealthMcpServer();
  await server.connect();
  return server;
}
