import type { OSModule } from "./types";

export const trainingModule: OSModule = {
  name: "training",
  description: "Тренировки, физическая активность, нагрузка и адаптация занятия под условия.",
  promptFile: "prompts/modules/training.md",
  tools: [
    "searchKnowledge",
    "read_profile",
    "read_recent_logs",
    "suggestWorkoutTemplate",
    "weather:*",
  ],
};
