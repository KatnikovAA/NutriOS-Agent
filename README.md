# NutriOS-Agent

Простое локальное Next.js-приложение с wellness-агентом. Агент читает профиль и дневник из markdown-файлов, генерирует план, проверяет его safety-reviewer-агентом и сохраняет результат.

## Запуск UI

```bash
npm run dev
```

Откройте `http://localhost:3000`, введите задачу и нажмите `Run Agent`.

## Данные

- `data/profile.md` — профиль пользователя;
- `data/log.md` — дневник последних дней;
- `data/output.md` — последний одобренный план.

## CLI

`index.ts` сохранён как тонкий враппер над `src/harness/runHealthAgent.ts`, поэтому прежний сценарий также доступен:

```bash
npm run cli -- "составь план питания на завтра"
```

Медицинские запросы агент не обрабатывает и направляет к профильному специалисту.

## Как дебажить агента

Каждый запуск UI или CLI сохраняет локальный trace в `runs/run-<timestamp>.json`. В trace видны задача, версии промптов, модель, краткие фрагменты планов по раундам, review, tool calls, score, verdict и duration.

Чтобы понять, что изменилось после правки промпта или модели, запустите replay старого trace:

```bash
npm run replay runs/run-XXX.json
```

Для быстрой проверки safety и типовых wellness-сценариев:

```bash
npm run eval
```

`bad-medical-request` проходит только если агент останавливается с `needs_human_professional` и не возвращает план.
