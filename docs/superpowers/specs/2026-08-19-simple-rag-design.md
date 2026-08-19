# Simple RAG Design

## Цель

Добавить Health Coach простую базу знаний с embeddings в Supabase pgvector и одним retrieval-tool. Личная память пользователя (`profile.md` и `log.md`) остаётся в markdown/MCP, а в Supabase хранится только неперсональная база знаний из `knowledge/`.

## Ограничения

- Не использовать LangChain, LlamaIndex и другие RAG-фреймворки.
- Не добавлять reranking, hybrid search, query rewriting или дополнительные поисковые стадии.
- На пользовательский запрос выполнять один embedding-запрос и один cosine similarity RPC-запрос.
- Не переносить profile/log в Supabase.
- Не добавлять тестовый фреймворк и не писать автоматические тесты.
- Все SQL-файлы хранить только в `docs/` и нумеровать по порядку выполнения.
- Использовать embedding размерности 1536 и проверять размер ответа во время ingest и retrieval.

## База знаний

Каталог `knowledge/` содержит пять markdown-файлов:

- `recipes.md` — 12 коротких рецептов и вариантов приёмов пищи;
- `nutrition_rules.md` — 12 бытовых правил сбалансированного питания;
- `training_templates.md` — 12 безопасных шаблонов активности;
- `recovery_rules.md` — 12 правил сна и восстановления;
- `personal_preferences.md` — 12 учебных предпочтений, ограничений и удобных форматов.

Каждый файл состоит из секций с заголовками второго уровня. Одна `##`-секция вместе с текстом до следующего такого заголовка является одним chunk. Chunk получает метаданные `file` и `heading`; вводный текст до первого `##` не индексируется.

## Конфигурация

Серверные процессы используют следующие переменные окружения:

- `EMBEDDING_BASE_URL` — корневой URL OpenAI-compatible API;
- `EMBEDDING_API_KEY` — ключ API embeddings;
- `EMBEDDING_MODEL` — имя embedding-модели;
- `EMBEDDING_DIMENSIONS=1536` — ожидаемая и фиксированная размерность;
- `SUPABASE_URL` — URL проекта Supabase;
- `SUPABASE_SERVICE_ROLE_KEY` — серверный ключ для ingest и RPC.

Ключи не передаются в UI и не используют префикс `NEXT_PUBLIC_`. Общая функция загрузки `.env` остаётся источником локальной конфигурации для CLI, ingest и Next.js server runtime.

## Схема Supabase

Файл `docs/001_create_knowledge_chunks_table.sql`:

1. включает расширение `vector` в схеме `extensions`;
2. создаёт таблицу `knowledge_chunks` с полями `id`, `file`, `heading`, `content` и `embedding extensions.vector(1536)`;
3. создаёт HNSW-индекс с `vector_cosine_ops`;
4. создаёт stable SQL-функцию `match_knowledge_chunks(query_embedding, match_count)`, которая возвращает `file`, `heading`, `content` и `1 - cosine_distance` как `similarity`;
5. ограничивает `match_count` безопасным диапазоном внутри функции.

SQL выполняется пользователем в Supabase до первого ingest. Приложение не пытается автоматически менять схему базы данных.

## Embeddings

`src/rag/embeddings.ts` отвечает только за OpenAI-compatible embeddings. Функция принимает строку или массив строк, вызывает `POST {EMBEDDING_BASE_URL}/embeddings` с `model`, `input` и `encoding_format: "float"`, восстанавливает порядок по `data[].index` и проверяет число результатов и длину каждого вектора. HTTP-ошибки, некорректный JSON, пустые embeddings и размерность не 1536 превращаются в понятные исключения без вывода ключей.

## Ingest

`scripts/ingest.ts` читает пять ожидаемых файлов в фиксированном порядке, режет их по `##`-секциям и отклоняет файл без chunks. Сначала скрипт получает embeddings для всего нового набора, поэтому ошибка embedding API не удаляет существующие данные. После успешной подготовки он через Supabase REST удаляет все строки `knowledge_chunks`, затем одной или несколькими пакетными вставками загружает новый набор и печатает число файлов и chunks.

`npm run ingest` запускает скрипт через `tsx`. Повторный запуск сначала очищает таблицу, поэтому не создаёт дублей. Если вставка после очистки завершится ошибкой, команда завершается с ненулевым кодом и сообщает, что ingest не закончен; атомарная замена и staging-таблица не входят в scope.

## Retrieval

`src/rag/retriever.ts` экспортирует:

```ts
type KnowledgeChunk = {
  file: string;
  heading: string;
  content: string;
  similarity: number;
};

async function searchKnowledge(query: string, topK = 5): Promise<KnowledgeChunk[]>;
```

Функция отклоняет пустой запрос и нецелый `topK` вне диапазона 1–20, получает ровно один query embedding, затем вызывает Supabase REST RPC `match_knowledge_chunks` ровно один раз. Ответ RPC проверяется и нормализуется без reranking или дополнительной сортировки в приложении.

## Tool и интеграция с агентом

`src/skills/knowledge.ts` создаёт Agents SDK function tool `searchKnowledge` с параметрами `query` и необязательным `topK`. Описание инструмента: «ищи в базе знаний рецепты, правила питания, шаблоны тренировок, правила восстановления». Tool возвращает агенту chunks с полным `content` и передаёт harness callback с запросом и метаданными результатов.

`runHealthAgent.ts` подключает tool только к Health Coach; Safety Reviewer остаётся без tools и побочных эффектов. Новый `prompts/healthCoach.v4.md` требует сначала искать в knowledge для запросов о рецептах, питании, тренировках и восстановлении и запрещает выдумывать рецепты вне найденных chunks. Prompt сохраняет существующие правила MCP, safety boundary и post-approve сохранение плана.

## Trace и UI

В `HealthAgentResult` и `RunTrace` добавляется массив:

```ts
type KnowledgeRetrievalTrace = {
  query: string;
  chunks: Array<{
    file: string;
    heading: string;
    similarity: number;
  }>;
};
```

Полный `content` в trace не дублируется. При вызове tool harness сохраняет обычную строку `[local] searchKnowledge` в `toolCalls` и соответствующее structured retrieval-событие. Порядок retrieval-событий совпадает с порядком вызовов `searchKnowledge`.

UI получает `retrievals` вместе с существующим результатом. В блоке «Что сделал агент» строка `searchKnowledge` сопоставляется со следующим retrieval-событием и отображается как `🔍 knowledge: <query> → N chunks`; остальные действия сохраняют текущий вид. Счётчик действий продолжает использовать длину `toolCalls`, поэтому retrieval не учитывается дважды.

## Evals и replay

Eval-схема получает необязательное поле `expect.requiredToolCalls: string[]`. Проверка извлекает исходные имена из форматированных tool calls и считает кейс успешным, только если вызваны все обязательные инструменты.

Шестой кейс `evals/cases/knowledge-based-recipe.json` использует запрос «предложи ужин с высоким белком без молочки», ожидает `approve`, минимальную оценку 7 и обязательный вызов `searchKnowledge`. Контент `knowledge/recipes.md` содержит подходящий безмолочный белковый ужин, чтобы retrieved chunks могли стать основанием ответа. Replay продолжает сравнивать `toolCalls` и дополнительно показывает retrieval query и заголовки найденных chunks через trace.

## Ошибки и безопасность

Отсутствующая env-переменная, ошибка embeddings/Supabase, размерность не 1536 и неправильная форма RPC-ответа завершают соответствующий запуск с понятным сообщением. `SUPABASE_SERVICE_ROLE_KEY` используется только на сервере и не возвращается в API или trace. Ингест индексирует только фиксированный список файлов из `knowledge/`, не `data/`, поэтому личная память не может случайно попасть в Supabase.

## Документация и проверка

README получает инструкции по переменным окружения, применению `docs/001_create_knowledge_chunks_table.sql`, запуску ingest и раздел «Memory vs RAG» из 5–6 предложений. Проверка реализации состоит из `npm run build`, двух последовательных `npm run ingest`, `npm run eval`, CLI-запроса про белковый ужин без молочки, просмотра сохранённого trace и ручной проверки UI. Успешный trace содержит retrieval query и заголовки chunks из `knowledge/recipes.md`, а повторный ingest оставляет то же число строк без дублей.
