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
- `data/preferences.md` — подтверждённые явные предпочтения;
- `data/habits.md` — минимальный журнал отметок привычек;
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

`index.ts` остаётся тонким CLI-враппером, но теперь вызывает `src/os/runOS.ts`: задача проходит intent routing, общий harness и обязательный safety review.

```bash
npm run cli -- "составь план питания на завтра"
```

Медицинские запросы агент не обрабатывает и направляет к профильному специалисту.

## Как дебажить агента

Каждый запуск UI или CLI сохраняет локальный trace в `runs/run-<timestamp>.json`. В trace видны задача, выбранный `module`, `intentConfidence`, версии промптов, модель, краткие фрагменты планов по раундам, review, tool calls, retrieval query и заголовки найденных chunks, score, verdict и duration. Tools логируются в одном поле `toolCalls` с источником: `[markdown-health] read_profile`, `[weather] openmeteo_get_forecast`, `[filesystem] write_file`, `[notion] ...`, `[local] suggestWorkoutTemplate`, `[local] searchKnowledge`. В UI соответствующий вызов показывается в блоке «Что сделал агент».

Чтобы понять, что изменилось после правки промпта или модели, запустите replay старого trace:

```bash
npm run replay runs/run-XXX.json
```

Для быстрой проверки safety и типовых wellness-сценариев:

```bash
npm run eval
```

`bad-medical-request` проходит только если агент останавливается с `needs_human_professional` и не возвращает план.

## Wellness OS

OS-слой находится в `src/os/`. Router выполняет один быстрый LLM-вызов и выбирает одну из восьми конфигураций: `dailyPlan`, `nutrition`, `recipes`, `training`, `recovery`, `habits`, `shoppingList` или `knowledge`. Модель router задаётся через `DEEPSEEK_ROUTER_MODEL` и по умолчанию равна `deepseek-chat`; confidence ниже `0.65` включает `general` и сохраняет базовое поведение без специализации.

Модули — это prompt и allowlist tools поверх одного Health Coach, а не отдельные агенты. Для каждого модуля обязателен тот же tool-free Safety Reviewer. Только после `approve` harness напрямую вызывает `save_health_plan`, добавляет краткую запись через `append_daily_log` и при явном сигнале «запомни» либо «мне понравилось» вызывает `update_preferences`. Evals и replay используют `runOS` с отключённой записью памяти, поэтому диагностические прогоны не засоряют личный дневник.

Все `data/*.md` и `runs/*` остаются локальными и игнорируются Git. `data/preferences.md` и `data/habits.md` создаются markdown-health MCP автоматически. Модуль `habits` читает журнал через `read_habits` и ставит только явно запрошенные отметки через `check_habit`.

## Путь проекта

**Agent.** Проект начался с одного `index.ts`, который запускал Health Coach для бытовой wellness-задачи. Рядом появился обязательный Safety Reviewer: он не имеет tools и не допускает медицинский ответ или сохранение неодобренного плана.

**UI.** Следующим слоем стала рабочая Next.js-панель с русской продуктовой копией, состояниями загрузки и итоговыми метаданными. Она сделала поведение локального агента наблюдаемым без необходимости читать консоль.

**Harness.** Логика запуска отделилась от CLI и UI в `runHealthAgent`: раунды coach/reviewer, ревизии, approve gate, score и длительность стали единым повторяемым сценарием. Это закрепило safety review как системную границу, а не договорённость в prompt.

**Tools.** Профильные действия вынеслись в маленькие function tools: поиск знаний, тренировки и список покупок. Health Coach получает только нужные инструменты, а Safety Reviewer остаётся без tools и побочных эффектов.

**Traces.** Каждый запуск начал оставлять JSON-trace в `runs/` с раундами, verdict, score, tool calls, retrievals, версиями prompts, модулем и confidence. Replay позволяет повторить старую задачу и сравнить поведение после изменения модели или prompt.

**MCP.** Markdown-память и внешние интеграции перешли на MCP: harness подключает серверы из конфига, фиксирует источник каждого tool и закрывает процессы в `finally`. Persistence tools вызываются harness-ом напрямую после approve и скрыты от Health Coach техническим фильтром.

**RAG.** Общие правила, рецепты и шаблоны отделились от личной памяти в Supabase pgvector. `searchKnowledge` извлекает релевантные chunks, поэтому рекомендации опираются на локальную базу знаний, а не на выдуманные агентом детали.

**Chat.** Streaming chat объединил сообщения, этапы, tool calls и финальный результат в одном timeline. Пользователь видит routing, поиск, safety review, ревизии и сохранение по мере выполнения задачи.

**OS.** Финальный слой `runOS` добавил intent routing и восемь конфигурационных модулей поверх существующего Health Coach. Он выбирает prompt/tool allowlist, сохраняет общий safety-инвариант и после approve обновляет markdown-память, превращая набор слоёв в единый wellness workflow.
