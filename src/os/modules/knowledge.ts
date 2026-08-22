import type { OSModule } from "./types";

export const knowledgeModule: OSModule = {
  name: "knowledge",
  description: "Ответ на общий wellness-вопрос по локальной базе знаний без обязательного полного плана.",
  promptFile: "prompts/modules/knowledge.md",
  tools: ["searchKnowledge", "read_profile"],
};
