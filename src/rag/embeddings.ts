import { loadEnv } from "../harness/env";

type EmbeddingResponseItem = {
  index: number;
  embedding: number[];
};

function requireEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Нет ${name} в .env или окружении`);
  return value;
}

function readEmbeddingConfig() {
  loadEnv();
  const dimensionsValue = requireEnv("EMBEDDING_DIMENSIONS");
  const dimensions = Number(dimensionsValue);
  if (!Number.isInteger(dimensions) || dimensions <= 0) {
    throw new Error("EMBEDDING_DIMENSIONS должен быть положительным целым числом");
  }
  return {
    apiKey: requireEnv("EMBEDDING_API_KEY"),
    baseUrl: requireEnv("EMBEDDING_BASE_URL").replace(/\/+$/, ""),
    model: requireEnv("EMBEDDING_MODEL"),
    dimensions,
  };
}

function isEmbeddingItem(value: unknown): value is EmbeddingResponseItem {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<EmbeddingResponseItem>;
  return (
    Number.isInteger(item.index) &&
    Array.isArray(item.embedding) &&
    item.embedding.every((entry) => typeof entry === "number" && Number.isFinite(entry))
  );
}

function parseEmbeddingResponse(payload: unknown, expectedCount: number, dimensions: number) {
  if (!payload || typeof payload !== "object" || !("data" in payload)) {
    throw new Error("Embedding API вернул ответ без data");
  }
  const data = (payload as { data?: unknown }).data;
  if (!Array.isArray(data) || !data.every(isEmbeddingItem)) {
    throw new Error("Embedding API вернул некорректную структуру data");
  }

  const ordered = [...data].sort((left, right) => left.index - right.index);
  if (ordered.length !== expectedCount) {
    throw new Error(`Embedding API вернул ${ordered.length} vectors вместо ${expectedCount}`);
  }
  for (let index = 0; index < ordered.length; index++) {
    if (ordered[index].index !== index) {
      throw new Error(`Embedding API не вернул vector с index=${index}`);
    }
    if (ordered[index].embedding.length !== dimensions) {
      throw new Error(
        `Embedding dimension должен быть ${dimensions}, получено ${ordered[index].embedding.length}`,
      );
    }
  }
  return ordered.map((item) => item.embedding);
}

export async function embedTexts(input: string | string[]) {
  const values = (Array.isArray(input) ? input : [input]).map((value) => value.trim());
  if (values.length === 0 || values.some((value) => !value)) {
    throw new Error("Embedding input должен содержать непустой текст");
  }

  const config = readEmbeddingConfig();
  const response = await fetch(`${config.baseUrl}/embeddings`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.model,
      input: values,
      encoding_format: "float",
    }),
  });

  if (!response.ok) {
    const details = (await response.text()).slice(0, 500);
    throw new Error(`Embedding API HTTP ${response.status}: ${details || response.statusText}`);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error("Embedding API вернул некорректный JSON");
  }
  return parseEmbeddingResponse(payload, values.length, config.dimensions);
}
