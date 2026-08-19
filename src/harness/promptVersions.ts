import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const ACTIVE_PROMPTS = {
  coach: "v4",
  reviewer: "v1",
} as const;

export type PromptName = "healthCoach" | "safetyReviewer";
export type ActivePromptVersions = typeof ACTIVE_PROMPTS;

export async function loadPromptVersion(name: PromptName, version: string) {
  const promptPath = join(process.cwd(), "prompts", `${name}.${version}.md`);
  return (await readFile(promptPath, "utf8")).trim();
}

export async function loadActivePrompts() {
  const [coach, reviewer] = await Promise.all([
    loadPromptVersion("healthCoach", ACTIVE_PROMPTS.coach),
    loadPromptVersion("safetyReviewer", ACTIVE_PROMPTS.reviewer),
  ]);

  return {
    prompts: { coach, reviewer },
    versions: ACTIVE_PROMPTS,
  };
}
