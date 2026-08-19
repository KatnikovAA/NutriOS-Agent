import { tool } from "@openai/agents-core";
import { z } from "zod";
import { searchKnowledge } from "../rag/retriever";
import type { KnowledgeRetrievalTrace } from "../rag/types";

export function createSearchKnowledgeTool(onCall?: (event: KnowledgeRetrievalTrace) => void) {
  return tool({
    name: "searchKnowledge",
    description: "Ищи в базе знаний рецепты, правила питания, шаблоны тренировок, правила восстановления.",
    parameters: z.object({
      query: z.string().min(1).describe("Короткий поисковый запрос к wellness-базе знаний."),
      topK: z.number().int().min(1).max(20).optional().describe("Количество chunks, по умолчанию 5."),
    }),
    async execute({ query, topK }) {
      const cleanQuery = query.trim();
      const chunks = await searchKnowledge(cleanQuery, topK);
      onCall?.({
        query: cleanQuery,
        chunks: chunks.map(({ file, heading, similarity }) => ({ file, heading, similarity })),
      });
      return chunks;
    },
  });
}
