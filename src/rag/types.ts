export type KnowledgeChunk = {
  file: string;
  heading: string;
  content: string;
  similarity: number;
};

export type KnowledgeRetrievalChunkTrace = Omit<KnowledgeChunk, "content">;

export type KnowledgeRetrievalTrace = {
  query: string;
  chunks: KnowledgeRetrievalChunkTrace[];
};
