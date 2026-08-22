import type { HealthAgentEventHandler } from "../harness/events";
import { runHealthAgent } from "../harness/runHealthAgent";
import { updateMemoryAfterApprove } from "./memory";
import { loadModulePrompt } from "./modulePrompt";
import { getOSModule } from "./modules";
import { classifyIntent } from "./router";

export const INTENT_CONFIDENCE_THRESHOLD = 0.65;

export type RunOSOptions = {
  onEvent?: HealthAgentEventHandler;
  updateMemory?: boolean;
};

export async function runOS(task: string, maxRounds = 3, options: RunOSOptions = {}) {
  const cleanTask = task.trim();
  if (!cleanTask) throw new Error("Передай непустую задачу");

  const classification = await classifyIntent(cleanTask);
  const selectedModule =
    classification.module !== "general" && classification.confidence >= INTENT_CONFIDENCE_THRESHOLD
      ? getOSModule(classification.module)
      : undefined;
  const moduleName = selectedModule?.name ?? "general";

  await options.onEvent?.({
    type: "module",
    id: "module-selection",
    module: moduleName,
    confidence: classification.confidence,
  });

  const modulePrompt = selectedModule ? await loadModulePrompt(selectedModule) : undefined;
  return runHealthAgent(cleanTask, maxRounds, {
    onEvent: options.onEvent,
    module: moduleName,
    intentConfidence: classification.confidence,
    specialization:
      selectedModule && modulePrompt
        ? { prompt: modulePrompt, tools: selectedModule.tools }
        : undefined,
    onApproved:
      options.updateMemory === false
        ? undefined
        : async (context) => {
            try {
              await updateMemoryAfterApprove(context);
            } catch (error) {
              throw new Error(
                `План сохранен, но обновление памяти не завершено: ${error instanceof Error ? error.message : String(error)}`,
              );
            }
          },
  });
}
