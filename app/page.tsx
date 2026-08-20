"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";

import type { ChatMessage } from "../src/chat/types";
import type {
  HealthAgentResultEvent,
  HealthAgentStageEvent,
  HealthAgentToolCallEvent,
} from "../src/harness/events";

const transport = new DefaultChatTransport<ChatMessage>({
  api: "/api/chat",
  prepareSendMessagesRequest({ messages }) {
    return { body: { message: messages.at(-1) } };
  },
});

const exampleTasks = [
  "план питания на завтра с учетом моего лога",
  "спланируй тренировку на завтра с учётом погоды",
  "составь список покупок к плану",
  "сделай мягкий план восстановления после позднего ужина",
];

const verdictLabels = {
  approve: "Одобрено",
  revise: "Нужна доработка",
  needs_human_professional: "Нужен специалист",
} as const;

const stageLabels = {
  reading_profile: "Reading profile",
  searching_knowledge: "Searching knowledge",
  generating_plan: "Generating plan",
  reviewing_safety: "Reviewing safety",
  revising: "Revising",
  final_approved_plan: "Final approved plan",
} as const;

function getMessageText(message: ChatMessage) {
  return message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("");
}

function getStageRank(event: HealthAgentStageEvent) {
  if (event.stage === "reading_profile") return 0;
  if (event.stage === "searching_knowledge") return 10;
  if (event.stage === "generating_plan") return 20;
  if (event.stage === "reviewing_safety") return 30 + ((event.round ?? 1) - 1) * 2;
  if (event.stage === "revising") return 29 + ((event.round ?? 2) - 1) * 2;
  return 100;
}

function getAssistantData(message: ChatMessage) {
  const stages = message.parts
    .filter((part) => part.type === "data-stage")
    .map((part) => part.data)
    .sort((left, right) => getStageRank(left) - getStageRank(right));
  const tools = message.parts.filter((part) => part.type === "data-toolCall").map((part) => part.data);
  const result = message.parts
    .filter((part) => part.type === "data-result")
    .map((part) => part.data)
    .at(-1);
  return { stages, tools, result };
}

function StatusMark({ active }: { active: boolean }) {
  return active ? (
    <span className="mt-0.5 size-4 shrink-0 animate-spin rounded-full border-2 border-primary/25 border-t-primary" />
  ) : (
    <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
      ✓
    </span>
  );
}

function StageRow({ event }: { event: HealthAgentStageEvent }) {
  const label =
    event.stage === "revising" ? `${stageLabels[event.stage]} (round ${event.round ?? 2})` : stageLabels[event.stage];
  const reviewDetail =
    event.stage === "reviewing_safety" && event.status === "completed" && event.verdict
      ? `${verdictLabels[event.verdict]} · ${event.score ?? 0}/10`
      : undefined;

  return (
    <li className="flex gap-3 py-2">
      <StatusMark active={event.status === "active"} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <span className="text-sm font-medium">{label}</span>
          {reviewDetail ? <span className="text-xs tabular-nums text-muted-foreground">{reviewDetail}</span> : null}
        </div>
        {event.stage === "searching_knowledge" && event.query ? (
          <p className="mt-1 truncate font-mono text-xs text-muted-foreground">“{event.query}”</p>
        ) : null}
      </div>
    </li>
  );
}

function ToolRow({ event }: { event: HealthAgentToolCallEvent }) {
  return (
    <li className="flex min-w-0 items-center gap-2 rounded-md bg-muted/70 px-2.5 py-2 text-xs">
      <span className="shrink-0 font-mono font-semibold text-primary">[{event.source}]</span>
      <span className="truncate font-mono text-foreground/80">{event.name}</span>
      {event.query ? <span className="ml-auto max-w-[50%] truncate text-muted-foreground">{event.query}</span> : null}
    </li>
  );
}

function formatDuration(durationMs: number) {
  return durationMs < 1000 ? `${durationMs} мс` : `${(durationMs / 1000).toFixed(1)} с`;
}

function ResultSummary({ event }: { event: HealthAgentResultEvent }) {
  return (
    <div className="mt-5 border-t pt-4">
      <details className="rounded-lg bg-card/65 px-3 py-2">
        <summary className="cursor-pointer text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          История раундов · {event.rounds.length}
        </summary>
        <ol className="mt-2 space-y-2">
          {event.rounds.map((round) => (
            <li key={round.round} className="rounded-md bg-muted/70 px-2.5 py-2 text-xs">
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium">Раунд {round.round}</span>
                <span className="tabular-nums text-muted-foreground">
                  {verdictLabels[round.review.verdict]} · {round.review.score}/10
                </span>
              </div>
              {round.review.issues.length > 0 ? (
                <ul className="mt-1.5 list-disc space-y-1 pl-4 text-muted-foreground">
                  {round.review.issues.map((issue, index) => <li key={`${round.round}-${index}`}>{issue}</li>)}
                </ul>
              ) : null}
            </li>
          ))}
        </ol>
      </details>
      <footer className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
        <span className="font-semibold text-foreground">{verdictLabels[event.review.verdict]}</span>
        <span className="tabular-nums">Score {event.finalScore}/10</span>
        <span>Improved: {event.improved ? "да" : "нет"}</span>
        <span className="tabular-nums">{formatDuration(event.durationMs)}</span>
        <span className="ml-auto font-mono">{event.promptVersions.coach} · {event.promptVersions.reviewer}</span>
      </footer>
    </div>
  );
}

function ProfessionalCard({ result }: { result: HealthAgentResultEvent }) {
  return (
    <section role="alert" className="mt-4 rounded-xl border border-destructive/30 bg-destructive/5 p-4">
      <p className="text-xs font-semibold tracking-wide text-destructive">SAFETY STOP</p>
      <h3 className="mt-1 text-base font-semibold">Требуется специалист</h3>
      <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm leading-6 text-foreground/80">
        {result.review.issues.map((issue, index) => (
          <li key={`${index}-${issue}`}>{issue}</li>
        ))}
      </ul>
    </section>
  );
}

function AssistantMessage({ message, running }: { message: ChatMessage; running: boolean }) {
  const text = getMessageText(message);
  const { stages, tools, result } = getAssistantData(message);
  const needsProfessional = result?.review.verdict === "needs_human_professional";

  return (
    <article className="max-w-3xl rounded-2xl rounded-tl-sm bg-secondary/55 px-4 py-4 sm:px-5">
      <header className="mb-3 flex items-center gap-2">
        <span className="flex size-7 items-center justify-center rounded-md bg-primary font-mono text-xs font-bold text-primary-foreground">
          N
        </span>
        <div>
          <p className="text-sm font-semibold">NutriOS</p>
          <p className="text-xs text-muted-foreground">Health Coach + Safety Reviewer</p>
        </div>
      </header>

      {stages.length > 0 || tools.length > 0 ? (
        <details open={running || !result} className="group rounded-xl border bg-card/80 px-3 py-2.5">
          <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <span>Ход выполнения</span>
            <span className="text-xs tabular-nums text-muted-foreground">{stages.length + tools.length}</span>
            <span className="ml-auto text-muted-foreground transition-transform group-open:rotate-180">⌄</span>
          </summary>
          {stages.length > 0 ? (
            <ol className="mt-2 divide-y">
              {stages.map((stage) => <StageRow key={stage.id} event={stage} />)}
            </ol>
          ) : null}
          {tools.length > 0 ? (
            <div className="mt-3 border-t pt-3">
              <p className="mb-2 text-xs font-medium text-muted-foreground">Что сделал агент</p>
              <ol className="space-y-1.5">
                {tools.map((tool) => <ToolRow key={tool.id} event={tool} />)}
              </ol>
            </div>
          ) : null}
        </details>
      ) : (
        <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
          <StatusMark active />
          Подготавливаю запуск
        </div>
      )}

      {needsProfessional && result ? <ProfessionalCard result={result} /> : null}
      {!needsProfessional && text ? (
        <div className="mt-4 whitespace-pre-wrap text-sm leading-7 text-foreground/90">{text}</div>
      ) : null}
      {result ? <ResultSummary event={result} /> : null}
    </article>
  );
}

function UserMessage({ message }: { message: ChatMessage }) {
  return (
    <article className="ml-auto max-w-2xl rounded-2xl rounded-tr-sm bg-primary px-4 py-3 text-sm leading-6 text-primary-foreground">
      {getMessageText(message)}
    </article>
  );
}

function EmptyChat({ onSelect, disabled }: { onSelect: (task: string) => void; disabled: boolean }) {
  return (
    <section className="mx-auto flex max-w-2xl flex-col items-start py-10 sm:py-16">
      <p className="font-mono text-xs font-semibold tracking-[0.16em] text-primary">WELLNESS WORKSPACE</p>
      <h2 className="mt-3 max-w-xl text-3xl font-semibold leading-tight tracking-tight text-balance sm:text-4xl">
        План, который проходит проверку до того, как вы его увидите
      </h2>
      <p className="mt-4 max-w-xl text-sm leading-6 text-muted-foreground text-pretty">
        Опишите задачу. Агент прочитает доступный контекст, вызовет нужные инструменты и покажет каждый этап проверки.
      </p>
      <div className="mt-7 grid w-full gap-2 sm:grid-cols-2">
        {exampleTasks.map((task) => (
          <button
            key={task}
            type="button"
            disabled={disabled}
            onClick={() => onSelect(task)}
            className="rounded-lg border bg-card px-3 py-3 text-left text-sm leading-5 transition-colors hover:border-primary/40 hover:bg-secondary/60 active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          >
            {task}
          </button>
        ))}
      </div>
    </section>
  );
}

export default function Home() {
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const { messages, sendMessage, status, error } = useChat<ChatMessage>({ transport });
  const busy = status === "submitted" || status === "streaming";
  const lastMessageIsUser = messages.at(-1)?.role === "user";

  useEffect(() => {
    bottomRef.current?.scrollIntoView({
      behavior: status === "streaming" ? "smooth" : "auto",
      block: "end",
    });
  }, [messages, status]);

  async function submitText() {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    await sendMessage({ role: "user", parts: [{ type: "text", text }] });
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submitText();
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.nativeEvent.isComposing || event.key !== "Enter" || event.shiftKey) return;
    event.preventDefault();
    void submitText();
  }

  return (
    <main className="min-h-dvh bg-background px-3 py-3 text-foreground sm:px-5 sm:py-5">
      <div className="mx-auto flex h-[calc(100dvh-1.5rem)] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border bg-card shadow-[0_18px_70px_-40px_color-mix(in_oklch,var(--primary)_45%,transparent)] sm:h-[calc(100dvh-2.5rem)]">
        <header className="flex shrink-0 items-center justify-between gap-4 border-b px-4 py-3 sm:px-6 sm:py-4">
          <div className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-lg bg-primary font-mono text-sm font-bold text-primary-foreground">
              N
            </span>
            <div>
              <h1 className="text-base font-semibold tracking-tight">NutriOS Agent</h1>
              <p className="text-xs text-muted-foreground">Локальный wellness-коуч</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="size-2 rounded-full bg-primary" />
            <span className="hidden sm:inline">Safety review enabled</span>
            <span className="sm:hidden">Safety on</span>
          </div>
        </header>

        <section aria-live="polite" className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6 sm:py-7">
          {messages.length === 0 ? <EmptyChat onSelect={setInput} disabled={busy} /> : null}
          <div className="space-y-5">
            {messages.map((message, index) =>
              message.role === "user" ? (
                <UserMessage key={message.id} message={message} />
              ) : message.role === "assistant" ? (
                <AssistantMessage key={message.id} message={message} running={busy && index === messages.length - 1} />
              ) : null,
            )}
            {busy && lastMessageIsUser ? (
              <article className="max-w-3xl rounded-2xl rounded-tl-sm bg-secondary/55 px-4 py-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <StatusMark active />
                  Подготавливаю запуск
                </div>
              </article>
            ) : null}
            {error ? (
              <section role="alert" className="max-w-3xl rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                {error.message || "Не удалось завершить работу агента"}
              </section>
            ) : null}
          </div>
          <div ref={bottomRef} />
        </section>

        <form onSubmit={submit} className="shrink-0 border-t bg-card px-3 pb-3 pt-3 sm:px-5 sm:pb-5">
          <label htmlFor="message" className="sr-only">Сообщение агенту</label>
          <div className="rounded-xl border bg-background p-2 transition-shadow focus-within:ring-2 focus-within:ring-ring/40">
            <textarea
              id="message"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={handleComposerKeyDown}
              disabled={busy}
              rows={3}
              placeholder="Например: составь план питания на завтра"
              className="block max-h-40 min-h-16 w-full resize-none bg-transparent px-2 py-1.5 text-sm leading-6 outline-none placeholder:text-muted-foreground disabled:opacity-60"
            />
            <div className="mt-1 flex items-center justify-between gap-3 border-t px-2 pt-2">
              <span className="text-xs text-muted-foreground">Enter — отправить · Shift+Enter — новая строка</span>
              <button
                type="submit"
                disabled={busy || !input.trim()}
                className="inline-flex min-w-28 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-[transform,opacity,background-color] hover:bg-primary/90 active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-45"
              >
                {busy ? (
                  <>
                    <span className="size-3.5 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground" />
                    Агент работает
                  </>
                ) : (
                  "Отправить"
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </main>
  );
}
