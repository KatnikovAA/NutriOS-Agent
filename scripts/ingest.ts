import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { embedTexts } from "../src/rag/embeddings";
import { supabaseRequest } from "../src/rag/supabaseRest";

const KNOWLEDGE_FILES = [
  "recipes.md",
  "nutrition_rules.md",
  "training_templates.md",
  "recovery_rules.md",
  "personal_preferences.md",
] as const;

type SourceChunk = {
  file: string;
  heading: string;
  content: string;
};

function splitByLevelTwoHeadings(file: string, markdown: string): SourceChunk[] {
  const headings = [...markdown.matchAll(/^##\s+(.+?)\s*$/gm)];
  return headings.map((match, index) => {
    const start = match.index;
    const end = headings[index + 1]?.index ?? markdown.length;
    return {
      file,
      heading: match[1].trim(),
      content: markdown.slice(start, end).trim(),
    };
  });
}

async function loadKnowledgeChunks() {
  const chunksByFile = await Promise.all(
    KNOWLEDGE_FILES.map(async (file) => {
      const markdown = await readFile(join(process.cwd(), "knowledge", file), "utf8");
      const chunks = splitByLevelTwoHeadings(file, markdown);
      if (chunks.length === 0) throw new Error(`В knowledge/${file} нет секций с ## заголовками`);
      return chunks;
    }),
  );
  return chunksByFile.flat();
}

async function requireSuccessfulResponse(response: Response, stage: string) {
  if (response.ok) return;
  const details = (await response.text()).slice(0, 500);
  throw new Error(`${stage}: Supabase HTTP ${response.status}: ${details || response.statusText}`);
}

async function replaceKnowledgeChunks(chunks: SourceChunk[], embeddings: number[][]) {
  const deleteResponse = await supabaseRequest("knowledge_chunks?id=not.is.null", {
    method: "DELETE",
    headers: { Prefer: "return=minimal" },
  });
  await requireSuccessfulResponse(deleteResponse, "Очистка knowledge_chunks");

  const rows = chunks.map((chunk, index) => ({ ...chunk, embedding: embeddings[index] }));
  const insertResponse = await supabaseRequest("knowledge_chunks", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify(rows),
  });
  await requireSuccessfulResponse(insertResponse, "Запись knowledge_chunks");
}

async function main() {
  const chunks = await loadKnowledgeChunks();
  const embeddings = await embedTexts(chunks.map((chunk) => chunk.content));
  await replaceKnowledgeChunks(chunks, embeddings);
  console.log(`Indexed ${chunks.length} chunks from ${KNOWLEDGE_FILES.length} files`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
