import { connectMarkdownHealthMcpServer } from "../src/harness/markdownMcp";

async function main() {
  const server = await connectMarkdownHealthMcpServer();
  try {
    const tools = await server.listTools();
    const resources = await server.listResources();

    console.log("MCP tools:");
    for (const tool of tools) {
      console.log(`- ${tool.name}`);
    }

    console.log("\nMCP resources:");
    for (const resource of resources.resources) {
      console.log(`- ${resource.uri}`);
    }
  } finally {
    await server.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
