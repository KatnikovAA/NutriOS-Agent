import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { MCPServerStdio } from "@openai/agents-core";
import { mcpServerConfigs, type McpServerConfig } from "../mcp/servers.config";

export type ToolSource = McpServerConfig["name"] | "local";

export type ConnectedMcpServers = {
  servers: MCPServerStdio[];
  toolSources: Map<string, ToolSource>;
  close: () => Promise<void>;
};

function minimalProcessEnv() {
  const keys = [
    "PATH",
    "Path",
    "SystemRoot",
    "WINDIR",
    "TEMP",
    "TMP",
    "USERPROFILE",
    "APPDATA",
    "LOCALAPPDATA",
    "ComSpec",
    "PROCESSOR_ARCHITECTURE",
  ];
  return Object.fromEntries(
    keys.map((key) => [key, process.env[key]]).filter((entry): entry is [string, string] => Boolean(entry[1])),
  );
}

function resolveEnv(config: McpServerConfig) {
  const env = { ...minimalProcessEnv() };
  for (const [key, value] of Object.entries(config.env ?? {})) {
    if (value.startsWith("$")) {
      const envName = value.slice(1);
      const resolved = process.env[envName];
      if (resolved) env[key] = resolved;
    } else {
      env[key] = value;
    }
  }
  return env;
}

function isEnabled(config: McpServerConfig) {
  if (config.enabled) return true;
  return Boolean(config.enableWhenEnv && process.env[config.enableWhenEnv]);
}

async function ensureRuntimeDirectories() {
  await Promise.all([
    mkdir(join(process.cwd(), "data"), { recursive: true }),
    mkdir(join(process.cwd(), "plans"), { recursive: true }),
  ]);
}

function createServer(config: McpServerConfig) {
  return new MCPServerStdio({
    name: config.name,
    command: config.command,
    args: config.args,
    env: resolveEnv(config),
    cwd: process.cwd(),
    clientSessionTimeoutSeconds: config.clientSessionTimeoutSeconds,
  });
}

export function formatToolCallName(name: string, toolSources: Map<string, ToolSource>) {
  return `[${toolSources.get(name) ?? "local"}] ${name}`;
}

export function extractRawToolName(toolCall: string) {
  return toolCall.replace(/^\[[^\]]+\]\s*/, "");
}

export async function connectConfiguredMcpServers(names?: string[]): Promise<ConnectedMcpServers> {
  await ensureRuntimeDirectories();

  const activeConfigs = mcpServerConfigs.filter((config) => isEnabled(config) && (!names || names.includes(config.name)));
  const connected: { config: McpServerConfig; server: MCPServerStdio }[] = [];
  const toolSources = new Map<string, ToolSource>();

  try {
    for (const config of activeConfigs) {
      const server = createServer(config);
      await server.connect();
      connected.push({ config, server });

      const tools = await server.listTools();
      for (const tool of tools) {
        toolSources.set(tool.name, config.name);
      }
    }
  } catch (error) {
    await Promise.allSettled(connected.map(({ server }) => server.close()));
    throw error;
  }

  return {
    servers: connected.map(({ server }) => server),
    toolSources,
    close: async () => {
      await Promise.allSettled(connected.map(({ server }) => server.close()));
    },
  };
}
