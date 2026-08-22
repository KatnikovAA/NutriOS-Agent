import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { OSModule } from "./modules";

export async function loadModulePrompt(module: OSModule) {
  const promptPath = join(process.cwd(), module.promptFile);
  return (await readFile(promptPath, "utf8")).trim();
}
