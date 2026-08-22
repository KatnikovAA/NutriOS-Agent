import type { OSModule } from "./types";

export const recoveryModule: OSModule = {
  name: "recovery",
  description: "Сон, стресс, бытовое восстановление и мягкая активность без медицинского лечения.",
  promptFile: "prompts/modules/recovery.md",
  tools: ["searchKnowledge", "read_profile", "read_recent_logs", "suggestWorkoutTemplate"],
};
