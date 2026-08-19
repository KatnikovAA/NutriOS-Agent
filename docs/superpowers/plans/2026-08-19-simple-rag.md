# Simple RAG Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Добавить Health Coach простую Supabase pgvector-базу знаний, идемпотентный ingest и наблюдаемый retrieval-tool.

**Architecture:** Markdown-секции индексируются отдельным CLI-скриптом через OpenAI-compatible embeddings API и Supabase REST. Во время запуска агента локальный tool делает один query embedding и один Supabase RPC cosine search; structured retrieval metadata проходит через result, trace, replay, eval и UI.

**Tech Stack:** TypeScript 5.9, Node.js fetch, Next.js 16, OpenAI Agents SDK 0.16, Zod 4, Supabase PostgREST, PostgreSQL pgvector.

**Spec:** `docs/superpowers/specs/2026-08-19-simple-rag-design.md`

## Global Constraints

- Не использовать RAG-фреймворки, Supabase SDK, reranking, hybrid search, query rewriting или дополнительные поисковые стадии.
- Один пользовательский retrieval = один embedding-запрос и один RPC similarity-запрос.
- `profile.md` и `log.md` остаются в markdown/MCP и никогда не индексируются.
- Embedding dimension фиксирован как 1536 и проверяется в коде.
- Все SQL-файлы находятся только в `docs/` и имеют числовой префикс.
- Не писать тесты и не добавлять тестовый фреймворк; проверять через build, ingest, eval, CLI, trace и UI.
- Safety Reviewer остаётся без tools и побочных эффектов.
- Не коммитить `.env`, runtime markdown, `.next/`, `node_modules/` или новые trace-файлы.

---

## Карта файлов

**Создать:**

- `knowledge/recipes.md` — 12 секций с рецептами.
- `knowledge/nutrition_rules.md` — 12 секций с правилами питания.
- `knowledge/training_templates.md` — 12 секций с тренировочными шаблонами.
- `knowledge/recovery_rules.md` — 12 секций с правилами восстановления.
- `knowledge/personal_preferences.md` — 12 секций с учебными предпочтениями.
- `docs/001_create_knowledge_chunks_table.sql` — pgvector-схема, индекс и RPC.
- `src/rag/embeddings.ts` — OpenAI-compatible embedding client.
- `src/rag/supabaseRest.ts` — server-only Supabase REST helpers.
- `src/rag/types.ts` — общие типы chunks и retrieval trace.
- `src/rag/retriever.ts` — публичный `searchKnowledge`.
- `src/skills/knowledge.ts` — Agents SDK tool factory.
- `scripts/ingest.ts` — chunking и полная перезагрузка таблицы.
- `prompts/healthCoach.v4.md` — prompt с knowledge-first правилами.
- `evals/cases/knowledge-based-recipe.json` — шестой eval-кейс.

**Изменить:**

- `package.json` — добавить `npm run ingest`.
- `src/harness/runHealthAgent.ts` — подключить tool и вернуть retrieval metadata.
- `src/harness/traceRun.ts` — записывать retrieval query и headings.
- `src/harness/promptVersions.ts` — активировать coach v4.
- `scripts/eval.ts` — поддержать `requiredToolCalls`.
- `scripts/replay.ts` — сравнивать retrieval metadata.
- `app/page.tsx` — показать knowledge action.
- `README.md` — setup RAG и «Memory vs RAG».

---

### Task 1: Knowledge corpus and database contract

**Files:**

- Create: `knowledge/recipes.md`
- Create: `knowledge/nutrition_rules.md`
- Create: `knowledge/training_templates.md`
- Create: `knowledge/recovery_rules.md`
- Create: `knowledge/personal_preferences.md`
- Create: `docs/001_create_knowledge_chunks_table.sql`

**Interfaces:**

- Produces: ровно 60 chunks, каждый начинается с `##` и имеет `file`, `heading`, `content` после parsing.
- Produces: RPC `match_knowledge_chunks(query_embedding extensions.vector(1536), match_count integer default 5)`.

- [ ] **Step 1: Создать пять knowledge-файлов по 12 секций**

Использовать эти точные heading-наборы:

```text
recipes.md:
Индейка с гречкой и овощами; Тунец с фасолью и зеленью; Курица с киноа в одной миске;
Тёплый салат с чечевицей и яйцом; Тофу с рисом и брокколи; Рыба с картофелем и салатом;
Омлет с овощами и хлебом; Нут с индейкой в томатном соусе; Гречневая лапша с курицей;
Высокобелковый ужин без молочки; Быстрый завтрак с яйцами и авокадо; Перекус из хумуса и овощей.

nutrition_rules.md:
Белок в основном приёме пищи; Метод тарелки; Углеводы под активность; Овощи без усложнения;
Регулярность вместо идеального режима; План для позднего ужина; Сладкое после основной еды;
Вода в течение дня; Бытовые ориентиры порций; Сытный перекус; Мягкое снижение калорийности;
Питание в день тренировки.

training_templates.md:
Силовая тренировка всего тела; Домашняя тренировка без прыжков; Короткая тренировка с эспандером;
Восстановительная прогулка; Мобилити для рабочего дня; Кардио разговорного темпа;
Тренировка при низкой энергии; Силовая тренировка без работы до отказа; Разминка перед нагрузкой;
Заминка после нагрузки; Активность в поездке; Недельный ритм активности.

recovery_rules.md:
Стабильное время подъёма; Вечернее снижение стимуляции; Восстановление после плохого сна;
Лёгкая активность в день усталости; Паузы в рабочем дне; Дыхание без обещаний лечения;
Кофеин и сон; Поздняя еда и сон; Свет утром; Мягкая растяжка; Признаки перегруза;
Когда остановить тренировку.

personal_preferences.md:
Без молочных продуктов; Быстрые будние ужины; Доступные источники белка; Любимые крупы;
Овощи без сложной готовки; Домашний инвентарь; Комфортная интенсивность; Формат короткого плана;
Покупки на несколько блюд; Замены ингредиентов; Еда в дорогу; Нейтральный тон рекомендаций.
```

Каждая секция должна содержать 2–5 коротких абзацев или список: ингредиенты/ориентиры, простой способ применения и безопасную замену. Рецепт «Высокобелковый ужин без молочки» должен явно предлагать индейку или тофу, бобовые/крупу и овощи без сыра, сливок и йогурта. Не добавлять лечение, дозировки, БАДы или медицинские обещания.

- [ ] **Step 2: Создать SQL-схему и RPC**

`docs/001_create_knowledge_chunks_table.sql` должен реализовать следующий контракт:

```sql
create extension if not exists vector with schema extensions;

create table if not exists public.knowledge_chunks (
  id bigint generated always as identity primary key,
  file text not null,
  heading text not null,
  content text not null,
  embedding extensions.vector(1536) not null
);

alter table public.knowledge_chunks enable row level security;

create index if not exists knowledge_chunks_embedding_hnsw_idx
  on public.knowledge_chunks
  using hnsw (embedding extensions.vector_cosine_ops);

create or replace function public.match_knowledge_chunks(
  query_embedding extensions.vector(1536),
  match_count integer default 5
)
returns table(file text, heading text, content text, similarity double precision)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  select
    knowledge_chunks.file,
    knowledge_chunks.heading,
    knowledge_chunks.content,
    1 - (knowledge_chunks.embedding <=> query_embedding) as similarity
  from public.knowledge_chunks
  order by knowledge_chunks.embedding <=> query_embedding
  limit greatest(1, least(coalesce(match_count, 5), 20));
$$;

revoke all on function public.match_knowledge_chunks(extensions.vector, integer) from public, anon, authenticated;
grant execute on function public.match_knowledge_chunks(extensions.vector, integer) to service_role;
```

- [ ] **Step 3: Проверить корпус и SQL статически**

Run:

```powershell
rg -c '^## ' knowledge/*.md
rg -n 'vector\(1536\)|vector_cosine_ops|match_knowledge_chunks' docs/001_create_knowledge_chunks_table.sql
git diff --check
```

Expected: каждый knowledge-файл показывает `12`; SQL содержит dimension, cosine index и RPC; `git diff --check` не сообщает ошибок.

- [ ] **Step 4: Commit**

```powershell
git add -- knowledge docs/001_create_knowledge_chunks_table.sql
git commit -m "Add RAG knowledge corpus and schema"
```

---

### Task 2: Embedding client and idempotent ingest

**Files:**

- Create: `src/rag/embeddings.ts`
- Create: `src/rag/supabaseRest.ts`
- Create: `src/rag/types.ts`
- Create: `scripts/ingest.ts`
- Modify: `package.json`

**Interfaces:**

- Produces: `embedTexts(input: string | string[]): Promise<number[][]>`.
- Produces: `supabaseRequest(path: string, init?: RequestInit): Promise<Response>`.
- Produces: `KnowledgeChunk`, `KnowledgeRetrievalTrace` and `KnowledgeRetrievalChunkTrace` types.
- Consumes: table contract from Task 1.

- [ ] **Step 1: Добавить общие RAG-типы**

`src/rag/types.ts`:

```ts
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
```

- [ ] **Step 2: Реализовать embedding client**

В `src/rag/embeddings.ts` вызвать `loadEnv()`, потребовать четыре `EMBEDDING_*` переменные и проверить `EMBEDDING_DIMENSIONS` как положительное целое, равное 1536. Нормализовать base URL через удаление завершающих `/` и вызывать `${baseUrl}/embeddings`.

Request body:

```ts
{
  model,
  input: Array.isArray(input) ? input : [input],
  encoding_format: "float",
}
```

Response проверить как объект с `data: Array<{ index: number; embedding: number[] }>`; отсортировать по `index`, проверить количество и каждый вектор. Ошибка должна называться по этапу (`Embedding API`, HTTP status, response shape, dimension), но не включать ключ.

- [ ] **Step 3: Реализовать server-only Supabase REST helper**

В `src/rag/supabaseRest.ts` вызвать `loadEnv()`, потребовать `SUPABASE_URL` и `SUPABASE_SERVICE_ROLE_KEY`, затем добавлять заголовки:

```ts
{
  apikey: serviceRoleKey,
  Authorization: `Bearer ${serviceRoleKey}`,
  "Content-Type": "application/json",
  ...init.headers,
}
```

Экспортировать helper, который вызывает `${supabaseUrl}/rest/v1/${path}` и возвращает `Response`; разбор и сообщения предметной области остаются у ingest/retriever.

- [ ] **Step 4: Реализовать section chunking и ingest**

`scripts/ingest.ts` должен иметь фиксированный массив пяти knowledge-файлов, читать только их и делить по строкам, начинающимся с `## `. Для каждого chunk сформировать:

```ts
{
  file: "recipes.md",
  heading: "Высокобелковый ужин без молочки",
  content: "## Высокобелковый ужин без молочки\n\n...",
}
```

Сначала вызвать `embedTexts(chunks.map(({ content }) => content))`. Только после успешной проверки всех embeddings выполнить:

```text
DELETE knowledge_chunks?id=not.is.null
POST   knowledge_chunks
```

Для DELETE передать `Prefer: return=minimal`; для POST — `Prefer: return=minimal` и JSON-массив строк с embedding. Проверять `response.ok`, выводить `Indexed 60 chunks from 5 files`, а верхнеуровневую ошибку печатать в `console.error` с `process.exitCode = 1`.

- [ ] **Step 5: Добавить npm script**

В `package.json`:

```json
"ingest": "tsx scripts/ingest.ts"
```

- [ ] **Step 6: Проверить TypeScript/build до внешних вызовов**

Run: `npm run build`

Expected: Next.js build завершается успешно; импорт server-only RAG-модулей не попадает в client component.

- [ ] **Step 7: Применить SQL и проверить идемпотентный ingest**

Выполнить `docs/001_create_knowledge_chunks_table.sql` в Supabase SQL Editor, добавить шесть env-переменных, затем:

```powershell
npm run ingest
npm run ingest
```

Expected: оба запуска печатают `Indexed 60 chunks from 5 files`; в `knowledge_chunks` остаётся 60 строк.

- [ ] **Step 8: Commit**

```powershell
git add -- package.json src/rag scripts/ingest.ts
git commit -m "Add idempotent knowledge ingest"
```

---

### Task 3: Retriever tool, harness trace, and coach prompt

**Files:**

- Create: `src/rag/retriever.ts`
- Create: `src/skills/knowledge.ts`
- Create: `prompts/healthCoach.v4.md`
- Modify: `src/harness/runHealthAgent.ts`
- Modify: `src/harness/traceRun.ts`
- Modify: `src/harness/promptVersions.ts`

**Interfaces:**

- Consumes: `embedTexts`, `supabaseRequest`, RAG types and RPC from Tasks 1–2.
- Produces: `searchKnowledge(query: string, topK?: number): Promise<KnowledgeChunk[]>`.
- Produces: `createSearchKnowledgeTool(onCall?)` and `HealthAgentResult.retrievals`.

- [ ] **Step 1: Реализовать retriever**

В `src/rag/retriever.ts` проверить непустой trimmed query и integer `topK` 1–20. Вызвать `embedTexts(cleanQuery)`, взять единственный vector и сделать один POST к `rpc/match_knowledge_chunks`:

```ts
{
  query_embedding: embedding,
  match_count: topK,
}
```

Проверить RPC response как массив объектов с string `file`, `heading`, `content` и finite number `similarity`. Вернуть значения в порядке Supabase без reranking.

- [ ] **Step 2: Обернуть retriever в Agents SDK tool**

`src/skills/knowledge.ts` экспортирует factory с Zod-параметрами `query: string.min(1)` и optional integer `topK` 1–20. Использовать точное описание:

```text
Ищи в базе знаний рецепты, правила питания, шаблоны тренировок, правила восстановления.
```

После `searchKnowledge` вызвать callback с `{ query: query.trim(), chunks: results.map(({ file, heading, similarity }) => ...) }`, затем вернуть полный массив results агенту.

- [ ] **Step 3: Добавить retrievals в harness**

В `HealthAgentResult` добавить `retrievals: KnowledgeRetrievalTrace[]` и протянуть массив через `buildResult` и `buildAndTraceResult`. Создать callback, который в одном месте выполняет:

```ts
recordLocalToolCall("searchKnowledge");
retrievals.push(event);
```

Добавить `createSearchKnowledgeTool(recordKnowledgeRetrieval)` третьим локальным tool Health Coach. Не добавлять tool Safety Reviewer или saving agent.

- [ ] **Step 4: Расширить trace**

В `RunTrace` добавить `retrievals: KnowledgeRetrievalTrace[]`; `traceRun` переносит `result.retrievals` без content. Существующий `toolCalls` остаётся без изменения формата.

- [ ] **Step 5: Создать coach prompt v4 и активировать его**

Скопировать v3 в новый файл, затем добавить раздел knowledge tool:

```text
- searchKnowledge — ищет в базе знаний рецепты, правила питания, шаблоны тренировок и правила восстановления.
- Для запросов о рецептах, питании, тренировках или восстановлении первым профильным действием вызови searchKnowledge.
- Строй рекомендации на найденных chunks. Не выдумывай рецепты из головы и не представляй отсутствующий в knowledge рецепт как найденный.
```

В `ACTIVE_PROMPTS` изменить `coach: "v4"`; reviewer оставить `v1`.

- [ ] **Step 6: Проверить build**

Run: `npm run build`

Expected: build успешен; API route сериализует новый result contract, а локальный клиентский type остаётся структурно совместимым до явного добавления `retrievals` в Task 4.

- [ ] **Step 7: Commit**

```powershell
git add -- src/rag/retriever.ts src/skills/knowledge.ts src/harness prompts/healthCoach.v4.md
git commit -m "Integrate knowledge retrieval with health coach"
```

---

### Task 4: UI, eval, and replay observability

**Files:**

- Modify: `app/page.tsx`
- Modify: `scripts/eval.ts`
- Modify: `scripts/replay.ts`
- Create: `evals/cases/knowledge-based-recipe.json`

**Interfaces:**

- Consumes: `HealthAgentResult.retrievals` and `[local] searchKnowledge` from Task 3.
- Produces: UI knowledge action, eval required-tool assertion, replay retrieval comparison.

- [ ] **Step 1: Показать structured knowledge action в UI**

Добавить `KnowledgeRetrievalTrace` к локальному `Result` type и передать `result.retrievals` в `ToolCallHistory`. Во время map по `toolCalls` вести счётчик retrieval index; для raw name `searchKnowledge` брать следующее событие и показывать:

```tsx
<span className="truncate">
  🔍 knowledge: {retrieval.query} → {retrieval.chunks.length} chunks
</span>
```

Для missing event использовать текущую подпись `searchKnowledge`, не падать. Остальные строки, badges и общий счётчик действий сохранить.

- [ ] **Step 2: Расширить eval contract**

Добавить `requiredToolCalls?: string[]` в `expect`. Реализовать локальный extractor regex для строк вида `[source] name` и включить в `isPassing` проверку каждого обязательного raw name. В `formatExpected` вывести `tools=searchKnowledge`, чтобы причина ожидания была видна в таблице.

- [ ] **Step 3: Добавить шестой eval-кейс**

`evals/cases/knowledge-based-recipe.json`:

```json
{
  "name": "knowledge based recipe",
  "task": "Предложи ужин с высоким белком без молочки.",
  "expect": {
    "verdict": "approve",
    "minScore": 7,
    "requiredToolCalls": ["searchKnowledge"]
  }
}
```

- [ ] **Step 4: Расширить replay**

Добавить `retrievals` в `ComparableRun`, old/new mapping и comparison rows. Форматировать массив как компактный JSON, чтобы diff показывал query, file, heading и similarity без content.

- [ ] **Step 5: Проверить build и eval**

Run:

```powershell
npm run build
npm run eval
```

Expected: build успешен; все шесть eval rows имеют `PASS`; knowledge case показывает `searchKnowledge` в toolCalls.

- [ ] **Step 6: Commit**

```powershell
git add -- app/page.tsx scripts/eval.ts scripts/replay.ts evals/cases/knowledge-based-recipe.json
git commit -m "Expose knowledge retrieval in UI and evals"
```

---

### Task 5: Documentation and end-to-end verification

**Files:**

- Modify: `README.md`

**Interfaces:**

- Documents: SQL order, env contract, ingest workflow, Memory vs RAG and trace/UI evidence.

- [ ] **Step 1: Документировать настройку RAG**

Добавить раздел с env names без секретов, затем порядок:

1. выполнить `docs/001_create_knowledge_chunks_table.sql` в Supabase;
2. заполнить server-only env;
3. запустить `npm run ingest`;
4. использовать CLI или UI.

Указать dimension 1536 и что смена модели на другую размерность требует новой SQL-миграции с новым номером в `docs/`.

- [ ] **Step 2: Добавить «Memory vs RAG» ровно на 6 предложений**

Использовать этот текст:

```markdown
## Memory vs RAG

`data/profile.md` и `data/log.md` — личная память агента: они описывают, кто пользователь и что происходило в последние дни. Эти файлы остаются локальными и доступны Health Coach через markdown/MCP. Каталог `knowledge/` — общая база знаний: рецепты, правила питания, шаблоны тренировок и восстановления, то есть то, что агент умеет предложить. Во время ingest секции knowledge получают embeddings и сохраняются в Supabase pgvector, но profile и log туда не попадают. Перед профильной рекомендацией агент ищет релевантные knowledge chunks и использует их содержание вместо выдумывания рецептов. Таким образом, Memory отвечает за персональный контекст «кто ты», а RAG — за проверяемый набор возможностей «что мы умеем».
```

- [ ] **Step 3: Выполнить end-to-end сценарий дважды**

Run:

```powershell
npm run ingest
npm run ingest
npm run cli -- "предложи ужин с высоким белком без молочки"
```

Expected: оба ingest индексируют 60 chunks; CLI-план ссылается по смыслу на безмолочный белковый рецепт; новый `runs/run-*.json` содержит `[local] searchKnowledge`, query и headings, включая chunk из `recipes.md`.

- [ ] **Step 4: Проверить UI вручную**

Run: `npm run dev`

Открыть UI, отправить тот же запрос и проверить строку `🔍 knowledge: предложи ужин с высоким белком без молочки → N chunks` в «Что сделал агент». Остановить dev server после проверки.

- [ ] **Step 5: Финальная проверка**

Run:

```powershell
npm run build
npm run eval
git diff --check
git status --short
```

Expected: build и eval успешны, whitespace ошибок нет, status содержит только ожидаемые изменения и игнорируемые runtime traces не попадают в commit.

- [ ] **Step 6: Commit**

```powershell
git add -- README.md
git commit -m "Document RAG setup and memory boundaries"
```
