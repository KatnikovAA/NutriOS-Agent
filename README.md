# NutriOS-Agent

Простое локальное Next.js-приложение с wellness-агентом. Агент читает профиль и дневник из markdown-файлов, ищет рекомендации в RAG-базе знаний, генерирует план, проверяет его safety-reviewer-агентом и сохраняет результат.

## Запуск UI

```bash
npm run dev
```

Откройте `http://localhost:3000`, введите задачу и нажмите `Run Agent`.

## Данные

- `data/profile.md` — профиль пользователя;
- `data/log.md` — дневник последних дней;
- `data/recipes.md` — локальные любимые рецепты;
- `data/output.md` — последний одобренный план.
- `plans/` — дополнительные markdown-файлы планов, которые агент может создавать через filesystem MCP по явной просьбе пользователя.

## Настройка RAG

Embeddings вычисляются локально через Ollama и модель `bge-m3`, а chunks хранятся в Supabase Postgres с расширением pgvector. Установите модель командой `ollama pull bge-m3` и убедитесь, что Ollama доступен на `http://127.0.0.1:11434`. Затем выполните SQL-файлы в Supabase SQL Editor строго по порядку: сначала `docs/001_create_knowledge_chunks_table.sql`, затем `docs/002_change_knowledge_embedding_to_1024.sql`.

Добавьте server-only настройки в `.env`:

```dotenv
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<sb_secret_... или legacy service_role JWT>
EMBEDDING_BASE_URL=http://127.0.0.1:11434/v1
EMBEDDING_API_KEY=ollama
EMBEDDING_MODEL=bge-m3
EMBEDDING_DIMENSIONS=1024
```

Не передавайте `SUPABASE_SERVICE_ROLE_KEY` в браузер и не добавляйте `.env` в Git. Для загрузки пяти файлов из `knowledge/` выполните `npm run ingest`: скрипт вычисляет embeddings, полностью очищает `knowledge_chunks` и записывает ровно 60 секций заново, поэтому повторный запуск не создаёт дублей. Размерность `bge-m3` равна 1024; смена embedding-модели на модель с другой размерностью требует нового пронумерованного SQL-файла в `docs/` и повторного ingest.

## Memory vs RAG

`data/profile.md` и `data/log.md` — личная память агента: они описывают, кто пользователь и что происходило в последние дни. Эти файлы остаются локальными и доступны Health Coach через markdown/MCP. Каталог `knowledge/` — общая база знаний: рецепты, правила питания, шаблоны тренировок и восстановления, то есть то, что агент умеет предложить. Во время ingest секции knowledge получают embeddings и сохраняются в Supabase pgvector, но profile и log туда не попадают. Перед профильной рекомендацией агент ищет релевантные knowledge chunks и использует их содержание вместо выдумывания рецептов. Таким образом, Memory отвечает за персональный контекст «кто ты», а RAG — за проверяемый набор возможностей «что мы умеем».

## MCP-серверы

MCP-серверы описаны в `src/mcp/servers.config.ts`. Harness читает этот конфиг, запускает все активные stdio-серверы отдельными процессами, отдаёт их tools агенту единым списком и закрывает процессы в `finally`. Добавление нового MCP-сервера = новая запись в конфиге, без правок orchestration-кода.

| Сервер | Пакет / команда | Что даёт | Авторизация |
| --- | --- | --- | --- |
| `markdown-health` | `npx tsx src/mcp/markdownHealthServer.ts` | Профиль, дневник, рецепты, сохранение финального плана в `data/output.md` | Не нужна |
| `filesystem` | `@modelcontextprotocol/server-filesystem` | Чтение/запись файлов только в `data/` и `plans/` | Не нужна |
| `weather` | `@cyanheads/open-meteo-mcp-server@0.3.4` | Геокодинг и прогноз Open-Meteo: `openmeteo_search_locations`, `openmeteo_get_forecast` и другие weather tools | Не нужна |
| `notion` | `@notionhq/notion-mcp-server` | Создание/обновление страниц через Notion API | `NOTION_TOKEN`; без токена сервер пропускается |

`notion` в конфиге стоит `enabled: false`, но автоматически включается, если в `.env` или окружении есть `NOTION_TOKEN`. Это internal integration token, без OAuth-флоу. В Notion этой integration нужно дать доступ только к странице или базе `Wellness`.

Проверить список MCP tools и resources можно командой:

```bash
npm run mcp:inspect
```

Команда запускает активные серверы из конфига и печатает tools с источниками, например `[markdown-health] read_profile`, `[filesystem] write_file`, `[weather] openmeteo_get_forecast`. Для собственного markdown-сервера также видны resources:

- `profile://me`
- `logs://recent`
- `recipes://all`
- `plans://latest`

### Демо MCP

```bash
npm run cli -- "спланируй тренировку на завтра с учётом погоды"
```

Ожидаемо: агент читает профиль, берёт город из `data/profile.md`, вызывает weather MCP и ссылается на прогноз. Если погода плохая, переносит активность в зал или домой.

```bash
npm run cli -- "сохрани мой план ещё и в отдельный файл plans/2026-08-18.md"
```

Ожидаемо: после safety approve финальный план сохраняется в `data/output.md` через `markdown-health`, а отдельный файл создаётся через `filesystem` MCP внутри `plans/`.

```bash
npm run cli -- "сохрани план страницей в мой Notion"
```

Ожидаемо при наличии `NOTION_TOKEN`: агент использует Notion MCP tools и создаёт страницу в доступной integration области `Wellness`. Без токена Notion-сервер не поднимается и запуск не ломается.

В UI после approved результата доступна кнопка `Сохранить в Notion`. Она не запускает модель повторно: frontend отправляет готовый markdown-план в `/api/notion/save`, а route сохраняет его дочерней страницей внутри `Wellness` через Notion MCP.

### Guardrails

Принцип: prompt — просьба, config — стена. Промпт объясняет агенту правильное поведение, но настоящие границы доступа задаются конфигом и правами сервера.

- `filesystem`: на уровне запуска сервера разрешены только `data/` и `plans/`; в prompt дополнительно сказано писать планы только в `plans/`.
- `notion`: техническая граница задаётся правами Notion integration; ей выдаётся доступ только к странице или базе `Wellness`, а prompt просит писать только туда.
- `weather`: read-only по природе и не требует ключа, поэтому отдельных write-ограничений не нужно.

## До MCP / После MCP

До MCP каждая интеграция подключалась к Health Coach Agent руками как отдельная function tool: профиль, дневник, рецепты и сохранение плана жили рядом с агентом и требовали индивидуальной обвязки.

После MCP интеграции стали конфигом: markdown, filesystem, weather и Notion публикуют tools по стандартному протоколу, а harness только запускает stdio-процессы из `servers.config.ts`. Для агента MCP tools выглядят как обычные инструменты и попадают в тот же `toolCalls` trace. Локальные tools `generateShoppingList` и `suggestWorkoutTemplate` оставлены напрямую, чтобы было видно различие между локальным tool и MCP tool.

Полезные MCP, которые сюда не подключены намеренно: Google Calendar для расписания тренировок (требует OAuth, вынесен за скобки), database/Postgres MCP для долговременной истории вместо markdown, web search MCP для актуальных источников. Для этого проекта сейчас достаточно локального stdio и token-only Notion.

## CLI

`index.ts` сохранён как тонкий враппер над `src/harness/runHealthAgent.ts`, поэтому прежний сценарий также доступен:

```bash
npm run cli -- "составь план питания на завтра"
```

Медицинские запросы агент не обрабатывает и направляет к профильному специалисту.

## Как дебажить агента

Каждый запуск UI или CLI сохраняет локальный trace в `runs/run-<timestamp>.json`. В trace видны задача, версии промптов, модель, краткие фрагменты планов по раундам, review, tool calls, retrieval query и заголовки найденных chunks, score, verdict и duration. Tools логируются в одном поле `toolCalls` с источником: `[markdown-health] read_profile`, `[weather] openmeteo_get_forecast`, `[filesystem] write_file`, `[notion] ...`, `[local] suggestWorkoutTemplate`, `[local] searchKnowledge`. В UI соответствующий вызов показывается как `🔍 knowledge: <query> → N chunks` в блоке «Что сделал агент».

Чтобы понять, что изменилось после правки промпта или модели, запустите replay старого trace:

```bash
npm run replay runs/run-XXX.json
```

Для быстрой проверки safety и типовых wellness-сценариев:

```bash
npm run eval
```

`bad-medical-request` проходит только если агент останавливается с `needs_human_professional` и не возвращает план.
