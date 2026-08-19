import { embedTexts } from "./embeddings";
import { supabaseRequest } from "./supabaseRest";
import type { KnowledgeChunk } from "./types";

function isKnowledgeChunk(value: unknown): value is KnowledgeChunk {
  if (!value || typeof value !== "object") return false;
  const chunk = value as Partial<KnowledgeChunk>;
  return (
    typeof chunk.file === "string" &&
    typeof chunk.heading === "string" &&
    typeof chunk.content === "string" &&
    typeof chunk.similarity === "number" &&
    Number.isFinite(chunk.similarity)
  );
}

export async function searchKnowledge(query: string, topK = 5): Promise<KnowledgeChunk[]> {
  const cleanQuery = query.trim();
  if (!cleanQuery) throw new Error("Knowledge query должен содержать непустой текст");
  if (!Number.isInteger(topK) || topK < 1 || topK > 20) {
    throw new Error("Knowledge topK должен быть целым числом от 1 до 20");
  }

  const [embedding] = await embedTexts(cleanQuery);
  const response = await supabaseRequest("rpc/match_knowledge_chunks", {
    method: "POST",
    body: JSON.stringify({
      query_embedding: embedding,
      match_count: topK,
    }),
  });

  if (!response.ok) {
    const details = (await response.text()).slice(0, 500);
    throw new Error(`Knowledge retrieval: Supabase HTTP ${response.status}: ${details || response.statusText}`);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error("Knowledge retrieval: Supabase вернул некорректный JSON");
  }
  if (!Array.isArray(payload) || !payload.every(isKnowledgeChunk)) {
    throw new Error("Knowledge retrieval: Supabase вернул некорректные chunks");
  }

  return payload;
}
