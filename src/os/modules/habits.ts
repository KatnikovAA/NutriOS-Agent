import type { OSModule } from "./types";

export const habitsModule: OSModule = {
  name: "habits",
  description: "Wellness-привычки, их текущее состояние и явная отметка выполнения.",
  promptFile: "prompts/modules/habits.md",
  tools: ["read_profile", "read_recent_logs", "read_habits", "check_habit"],
};
