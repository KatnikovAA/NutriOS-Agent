import { loadEnv } from "../src/harness/env";
import { connectConfiguredMcpServers } from "../src/harness/mcpServers";

async function main() {
  loadEnv();
  const mcp = await connectConfiguredMcpServers();
  try {
    console.log("MCP tools:");
    for (const [toolName, source] of [...mcp.toolSources.entries()].sort(([left], [right]) =>
      left.localeCompare(right),
    )) {
      console.log(`- [${source}] ${toolName}`);
    }

    console.log("\nMCP resources:");
    for (const server of mcp.servers) {
      let resources;
      try {
        resources = await server.listResources();
      } catch (error) {
        if (error instanceof Error && /Method not found/i.test(error.message)) continue;
        throw error;
      }
      for (const resource of resources.resources) {
        console.log(`- ${resource.uri}`);
      }
    }
  } finally {
    await mcp.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
