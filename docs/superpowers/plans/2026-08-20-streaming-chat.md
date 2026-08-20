# Streaming Chat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the one-shot task form with an in-memory AI SDK chat that streams live harness stages, tool calls, safety outcomes, and only the final approved plan.

**Architecture:** Keep the current agent orchestration intact and add a framework-independent optional event callback around its existing boundaries. A new Next.js route maps those events to AI SDK 6 typed data parts, then progressively writes the approved plan as text deltas; `useChat` owns ephemeral client message state and renders the resulting timeline.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5.9, Vercel AI SDK 6, OpenAI Agents SDK 0.16, Tailwind CSS 4.

**Spec:** `docs/superpowers/specs/2026-08-20-streaming-chat-design.md`

## Global Constraints

- Do not rewrite the harness; add event emission around its current orchestration.
- Do not add automated tests or use TDD.
- Do not persist chat history in a database, files, cookies, session storage, or local storage.
- Only the latest user message is passed to `runHealthAgent`; earlier messages are display history only.
- Never stream an unreviewed plan.
- Do not add a UI component library. Reuse the existing Tailwind setup and local primitives only where useful.
- Preserve the existing `HealthAgentResult` shape and `runHealthAgent(task, maxRounds)` callers.
- Preserve approved-plan saving, MCP cleanup, tracing, replay, CLI, `/api/agent/run`, and eval behavior.

---

### Task 1: Install the AI SDK and define shared streaming contracts

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `src/harness/events.ts`
- Create: `src/chat/types.ts`

**Interfaces:**
- Produces: `HealthAgentEvent`, `HealthAgentEventHandler`, `HealthAgentRunOptions`, `ChatDataParts`, and `ChatMessage`.
- Consumes: existing `Review`, `RoundState`, `ActivePromptVersions`, and `KnowledgeRetrievalTrace` types.

- [ ] **Step 1: Install the current stable AI SDK 6 React packages**

Run:

```powershell
npm install ai@^6 @ai-sdk/react@^3
```

Confirm that `package.json` contains both dependencies and that `package-lock.json` resolves one compatible version of each.

- [ ] **Step 2: Add the harness event union**

Create `src/harness/events.ts` with serializable event data and no React or AI SDK imports:

```ts
import type { KnowledgeRetrievalTrace } from "../rag/types";
import type { ActivePromptVersions } from "./promptVersions";
import type { RoundState } from "./rounds";
import type { Review } from "./validateReview";

export type HealthAgentStage =
  | "reading_profile"
  | "searching_knowledge"
  | "generating_plan"
  | "reviewing_safety"
  | "revising"
  | "final_approved_plan";

export type HealthAgentStageEvent = {
  type: "stage";
  id: string;
  stage: HealthAgentStage;
  status: "active" | "completed";
  round?: number;
  query?: string;
  verdict?: Review["verdict"];
  score?: number;
  issues?: string[];
};

export type HealthAgentToolCallEvent = {
  type: "tool_call";
  id: string;
  name: string;
  formattedName: string;
  source: "mcp" | "local" | "rag";
  server?: string;
  query?: string;
};

export type HealthAgentResultEvent = {
  type: "result";
  id: "result";
  review: Review;
  rounds: RoundState[];
  finalScore: number;
  improved: boolean;
  promptVersions: ActivePromptVersions;
  durationMs: number;
  toolCalls: string[];
  retrievals: KnowledgeRetrievalTrace[];
};

export type HealthAgentEvent = HealthAgentStageEvent | HealthAgentToolCallEvent | HealthAgentResultEvent;
export type HealthAgentEventHandler = (event: HealthAgentEvent) => void | Promise<void>;
export type HealthAgentRunOptions = { onEvent?: HealthAgentEventHandler };
```

- [ ] **Step 3: Add AI SDK UI message data types**

Create `src/chat/types.ts` and map each harness event category to an AI SDK data part:

```ts
import type { UIMessage } from "ai";
import type {
  HealthAgentResultEvent,
  HealthAgentStageEvent,
  HealthAgentToolCallEvent,
} from "../harness/events";

export type ChatDataParts = {
  stage: HealthAgentStageEvent;
  toolCall: HealthAgentToolCallEvent;
  result: HealthAgentResultEvent;
};

export type ChatMessage = UIMessage<never, ChatDataParts>;
```

If the installed AI SDK 6 generic uses `unknown` rather than `never` for message metadata, use `UIMessage<unknown, ChatDataParts>` consistently on server and client.

- [ ] **Step 4: Run a TypeScript-only contract check**

Run:

```powershell
npx tsc --noEmit
```

Expected: exit code 0 with the new shared types included.

- [ ] **Step 5: Commit the dependency and contracts**

```powershell
git add package.json package-lock.json src/harness/events.ts src/chat/types.ts
git commit -m "Add streaming chat contracts"
```

---

### Task 2: Emit stages and live tool calls from the existing harness

**Files:**
- Modify: `src/harness/runHealthAgent.ts`

**Interfaces:**
- Consumes: `HealthAgentRunOptions` and `HealthAgentEvent` from Task 1.
- Produces: `runHealthAgent(task, maxRounds?, options?)` with the previous result and call compatibility.

- [ ] **Step 1: Extend the public function signature and add ordered emission**

Import the event types and change only the optional tail of the signature:

```ts
import type { HealthAgentEvent, HealthAgentRunOptions } from "./events";

export async function runHealthAgent(
  task: string,
  maxRounds = 3,
  options: HealthAgentRunOptions = {},
): Promise<HealthAgentResult> {
```

Inside the function, create a serial event queue. Runner hooks append work without returning promises, while harness boundaries explicitly flush it:

```ts
let eventQueue = Promise.resolve();
const enqueueEvent = (event: HealthAgentEvent) => {
  eventQueue = eventQueue.then(() => options.onEvent?.(event));
};
const flushEvents = () => eventQueue;
```

Do not change existing input, environment, model, prompt, or MCP validation.

- [ ] **Step 2: Emit every tool start through the Runner lifecycle hook**

After MCP connection and before the first run, attach one listener:

```ts
let toolEventIndex = 0;
const pendingKnowledgeStageIds = new Map<string, string[]>();
runner.on("agent_tool_start", (_context, _agent, tool, details) => {
  const name = tool.name;
  const server = mcp.toolSources.get(name);
  const source = name === "searchKnowledge" ? "rag" : server ? "mcp" : "local";
  let query: string | undefined;

  if (name === "searchKnowledge") {
    try {
      const args = JSON.parse(details.toolCall.arguments) as { query?: unknown };
      if (typeof args.query === "string") query = args.query.trim();
    } catch {
      query = undefined;
    }
  }

  toolEventIndex += 1;
  enqueueEvent({
    type: "tool_call",
    id: `tool-${toolEventIndex}`,
    name,
    formattedName: formatToolCallName(name, mcp.toolSources),
    source,
    server,
    query,
  });

  if (name === "searchKnowledge") {
    const stageId = `searching-knowledge-${toolEventIndex}`;
    const queryKey = query ?? "";
    pendingKnowledgeStageIds.set(queryKey, [...(pendingKnowledgeStageIds.get(queryKey) ?? []), stageId]);
    enqueueEvent({
      type: "stage",
      id: stageId,
      stage: "searching_knowledge",
      status: "active",
      query,
    });
  }
});
```

Check the installed 0.16 type for `details.toolCall.arguments`. If it can be an object as well as a JSON string, normalize it with a small `parseToolArguments(value: unknown)` helper rather than asserting a string.

- [ ] **Step 3: Complete RAG search events from the existing retrieval callback**

Track pending search stage IDs by query and close the matching entry inside `recordKnowledgeRetrieval`, while preserving current tool-call and retrieval recording:

```ts
const recordKnowledgeRetrieval = (event: KnowledgeRetrievalTrace) => {
  recordLocalToolCall("searchKnowledge");
  retrievals.push(event);
  const stageIds = pendingKnowledgeStageIds.get(event.query) ?? [];
  const stageId = stageIds.shift();
  if (stageIds.length > 0) pendingKnowledgeStageIds.set(event.query, stageIds);
  else pendingKnowledgeStageIds.delete(event.query);
  if (stageId) {
    enqueueEvent({
      type: "stage",
      id: stageId,
      stage: "searching_knowledge",
      status: "completed",
      query: event.query,
    });
  }
};
```

- [ ] **Step 4: Wrap the existing generation and review boundaries with stage events**

Before the initial Health Coach call, enqueue active `reading_profile` and `generating_plan` events. After it returns, flush runner-hook events and complete both stages:

```ts
enqueueEvent({ type: "stage", id: "reading-profile", stage: "reading_profile", status: "active" });
enqueueEvent({ type: "stage", id: "generating-plan-1", stage: "generating_plan", status: "active", round: 1 });
let plan = await runText(
  runner,
  healthCoachAgent,
  `Задача пользователя: ${cleanTask}\n\nСоставь полезный ответ. Если для качества нужны профиль, дневник, рецепты, тренировка или список покупок, сам вызови доступные tools.`,
  toolCalls,
  mcp.toolSources,
);
await flushEvents();
enqueueEvent({ type: "stage", id: "reading-profile", stage: "reading_profile", status: "completed" });
enqueueEvent({ type: "stage", id: "generating-plan-1", stage: "generating_plan", status: "completed", round: 1 });
await flushEvents();
```

For every review round, emit `reviewing_safety` active immediately before `validateReviewWithRetry`, then completed with `verdict`, `score`, and `issues` after `forceMedicalBoundary`:

```ts
const reviewStageId = `reviewing-safety-${round}`;
enqueueEvent({ type: "stage", id: reviewStageId, stage: "reviewing_safety", status: "active", round });
await flushEvents();
const review = forceMedicalBoundary(
  cleanTask,
  await validateReviewWithRetry(`План для проверки:\n${plan}`, (prompt) =>
    runText(runner, safetyReviewerAgent, prompt, toolCalls, mcp.toolSources),
  ),
);
enqueueEvent({
  type: "stage",
  id: reviewStageId,
  stage: "reviewing_safety",
  status: "completed",
  round,
  verdict: review.verdict,
  score: review.score,
  issues: review.issues,
});
await flushEvents();
```

After `revise`, wrap the existing second Health Coach call in a `revising` stage whose `round` is `round + 1`. Complete it after `runText` and queued tool events finish.

- [ ] **Step 5: Emit final approval and result metadata on every terminal return**

After an approved plan is saved successfully, emit the completed final stage:

```ts
enqueueEvent({
  type: "stage",
  id: "final-approved-plan",
  stage: "final_approved_plan",
  status: "completed",
  round,
  verdict: review.verdict,
  score: review.score,
});
```

Refactor `buildAndTraceResult` only enough to emit the serializable result event after tracing and before returning:

```ts
const result = buildResult(plan, review, rounds, promptVersions, startTime, toolCalls, retrievals);
await traceRun(task, model, result);
await onEvent?.({
  type: "result",
  id: "result",
  review: result.review,
  rounds: result.rounds,
  finalScore: result.finalScore,
  improved: result.improved,
  promptVersions: result.promptVersions,
  durationMs: result.durationMs,
  toolCalls: result.toolCalls,
  retrievals: result.retrievals,
});
return result;
```

Do not spread `plan` into the event. Build the event fields explicitly so `plan` is not serialized. Use the same helper for approve and `needs_human_professional`. Flush queued tool events after approved-plan saving and before the final stage/result event.

- [ ] **Step 6: Confirm old callers still type-check**

Run:

```powershell
npx tsc --noEmit
```

Expected: exit code 0; `app/api/agent/run/route.ts`, `index.ts`, `scripts/eval.ts`, and `scripts/replay.ts` compile without call-site edits.

- [ ] **Step 7: Commit harness event emission**

```powershell
git add src/harness/runHealthAgent.ts
git commit -m "Emit health agent progress events"
```

---

### Task 3: Add the AI SDK streaming chat route

**Files:**
- Create: `app/api/chat/route.ts`

**Interfaces:**
- Consumes: a request body containing the latest `ChatMessage` under `message`.
- Consumes: `runHealthAgent(task, undefined, { onEvent })` and `ChatDataParts`.
- Produces: AI SDK UI message stream parts `data-stage`, `data-toolCall`, `data-result`, and approved-plan text.

- [ ] **Step 1: Validate and extract only the latest user text**

Use a focused helper in the route:

```ts
function getTask(message: ChatMessage | undefined) {
  if (!message || message.role !== "user") return "";
  return message.parts
    .filter((part): part is Extract<typeof part, { type: "text" }> => part.type === "text")
    .map((part) => part.text)
    .join("\n")
    .trim();
}
```

Parse `{ message?: ChatMessage }`; return `Response.json({ error: "Передай непустую задачу" }, { status: 400 })` when extraction returns an empty string.

- [ ] **Step 2: Map harness events to persistent typed data parts**

Create the stream with the validated message as its original history and write each event using its stable ID:

```ts
const stream = createUIMessageStream<ChatMessage>({
  originalMessages: [message],
  async execute({ writer }) {
    const result = await runHealthAgent(task, undefined, {
      onEvent(event) {
        if (event.type === "stage") {
          writer.write({ type: "data-stage", id: event.id, data: event });
        } else if (event.type === "tool_call") {
          writer.write({ type: "data-toolCall", id: event.id, data: event });
        } else {
          writer.write({ type: "data-result", id: event.id, data: event });
        }
      },
    });

    if (result.review.verdict === "approve" && result.plan) {
      await writeApprovedPlan(writer, result.plan);
    }
  },
  onError() {
    return "Не удалось завершить работу агента";
  },
});

return createUIMessageStreamResponse({ stream });
```

Follow the installed AI SDK 6 generic signature if `createUIMessageStream` infers `ChatMessage` without an explicit generic. Do not fall back to `any`.

- [ ] **Step 3: Stream the approved plan as word-preserving deltas**

Add a small local helper that sends no text until the harness has returned approve:

```ts
type ChatWriter = Parameters<Parameters<typeof createUIMessageStream<ChatMessage>>[0]["execute"]>[0]["writer"];

async function writeApprovedPlan(writer: ChatWriter, plan: string) {
  const id = "approved-plan";
  writer.write({ type: "text-start", id });
  for (const delta of plan.match(/\S+\s*/g) ?? [plan]) {
    writer.write({ type: "text-delta", id, delta });
    await new Promise((resolve) => setTimeout(resolve, 8));
  }
  writer.write({ type: "text-end", id });
}
```

If the exported writer type is available in the installed package, import it instead of using the inference alias. Keep the 8 ms delay local to approved response delivery; it must not delay harness events or eval runs.

- [ ] **Step 4: Set route runtime limits and compile**

Export:

```ts
export const runtime = "nodejs";
export const maxDuration = 300;
```

Run:

```powershell
npx tsc --noEmit
```

Expected: exit code 0 and no unsafe casts in the route.

- [ ] **Step 5: Commit the streaming route**

```powershell
git add app/api/chat/route.ts
git commit -m "Add streaming chat route"
```

---

### Task 4: Replace the form with the in-memory streaming chat UI

**Files:**
- Modify: `app/page.tsx`
- Modify: `app/globals.css` only if a global scrollbar or animation rule cannot be expressed cleanly with existing Tailwind utilities.

**Interfaces:**
- Consumes: `ChatMessage`, `data-stage`, `data-toolCall`, `data-result`, and text parts from Task 3.
- Produces: one ephemeral chat, canonical timeline order, professional-referral card, final review summary, autoscroll, and disabled composer while busy.

- [ ] **Step 1: Configure `useChat` to send only the current user message**

At module scope create a transport, and inside `Home` own only the composer input:

```tsx
const transport = new DefaultChatTransport<ChatMessage>({
  api: "/api/chat",
  prepareSendMessagesRequest({ messages }) {
    return { body: { message: messages.at(-1) } };
  },
});

export default function Home() {
  const [input, setInput] = useState("");
  const { messages, sendMessage, status, error } = useChat<ChatMessage>({ transport });
  const busy = status === "submitted" || status === "streaming";

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    sendMessage({ role: "user", parts: [{ type: "text", text }] });
    setInput("");
  }
```

Keep example prompts as buttons that fill or immediately submit a prompt only while `busy` is false. Do not introduce a conversation selector, clear-history persistence, or stored chat ID.

- [ ] **Step 2: Derive a reconciled assistant timeline from message parts**

Add focused helpers outside `Home`:

```tsx
const stageOrder = {
  reading_profile: 0,
  searching_knowledge: 1,
  generating_plan: 2,
  reviewing_safety: 3,
  revising: 4,
  final_approved_plan: 5,
} satisfies Record<HealthAgentStage, number>;

function getText(message: ChatMessage) {
  return message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("");
}

function getTimeline(message: ChatMessage) {
  const stages = message.parts
    .filter((part) => part.type === "data-stage")
    .map((part) => part.data)
    .sort((a, b) => stageOrder[a.stage] - stageOrder[b.stage] || (a.round ?? 0) - (b.round ?? 0));
  const tools = message.parts
    .filter((part) => part.type === "data-toolCall")
    .map((part) => part.data);
  return { stages, tools };
}
```

AI SDK reconciliation means only the latest data for a reused part ID remains in `message.parts`; do not add a second client-side event store.

- [ ] **Step 3: Render stage rows, tool rows, plan text, and terminal safety state**

Use small local components with exact responsibilities:

```tsx
function StageRow({ event }: { event: HealthAgentStageEvent })
function ToolRow({ event }: { event: HealthAgentToolCallEvent })
function ResultSummary({ event }: { event: HealthAgentResultEvent })
function AssistantMessage({ message, running }: { message: ChatMessage; running: boolean })
```

`StageRow` maps keys to the required labels: `Reading profile`, `Searching knowledge`, `Generating plan`, `Reviewing safety`, `Revising (round N)`, and `Final approved plan`. Show a spinner for active and a check for completed. Append the RAG query to search, and append verdict plus score to a completed review.

`ToolRow` renders exactly one source badge from `event.source`: `[mcp]`, `[local]`, or `[rag]`, followed by `event.name`; include `event.query` for RAG. Render tool rows in arrival order after the stage list under a `Что сделал агент` subheading.

`AssistantMessage` obtains the latest `data-result`. When its verdict is `needs_human_professional`, render:

```tsx
<section role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-4">
  <h3 className="font-semibold text-destructive">Требуется специалист</h3>
  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
    {result.review.issues.map((issue) => <li key={issue}>{issue}</li>)}
  </ul>
</section>
```

Otherwise render approved streamed text with `whitespace-pre-wrap`. Beneath the answer, `ResultSummary` shows the Russian verdict label, `${finalScore}/10`, round count, formatted duration, and both prompt versions. Do not render plan text for a professional-referral result.

- [ ] **Step 4: Build the compact chat workspace and composer**

Replace the current dashboard/form/result split with:

```tsx
<main className="min-h-dvh bg-background px-4 py-4 text-foreground sm:px-6">
  <div className="mx-auto flex min-h-[calc(100dvh-2rem)] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border bg-card shadow-sm">
    <header className="flex items-center justify-between border-b px-4 py-3 sm:px-6">
      <div>
        <h1 className="font-semibold">NutriOS Agent</h1>
        <p className="text-sm text-muted-foreground">Wellness-планы с проверкой безопасности</p>
      </div>
      <span className="rounded-full bg-secondary px-3 py-1 text-xs font-medium">Safety review enabled</span>
    </header>
    <section aria-live="polite" className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6">
      {messages.length === 0 ? <EmptyChat onSelect={setInput} disabled={busy} /> : null}
      <div className="space-y-5">
        {messages.map((message) => (
          message.role === "user"
            ? <UserMessage key={message.id} message={message} />
            : <AssistantMessage key={message.id} message={message} running={busy} />
        ))}
      </div>
      <div ref={bottomRef} />
    </section>
    <form onSubmit={submit} className="border-t bg-card p-3 sm:p-4">
      <label htmlFor="message" className="sr-only">Сообщение агенту</label>
      <textarea
        id="message"
        value={input}
        onChange={(event) => setInput(event.target.value)}
        onKeyDown={handleComposerKeyDown}
        disabled={busy}
        placeholder="Например: составь план питания на завтра"
        className="min-h-24 w-full resize-none rounded-xl border bg-background p-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
      />
      <div className="mt-2 flex items-center justify-between gap-3">
        <span className="text-xs text-muted-foreground">{error?.message ?? `${input.trim().length} символов`}</span>
        <button type="submit" disabled={busy || !input.trim()} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
          {busy ? "Агент работает" : "Отправить"}
        </button>
      </div>
    </form>
  </div>
</main>
```

Implement `EmptyChat` and `UserMessage` as local components in `app/page.tsx`. User messages align right with a primary-tinted bubble; assistant responses use a bordered neutral card. Keep the existing Russian product copy. Disable the textarea, examples, and submit button while `busy`; show `Loader2` and `Агент работает` on the button during both submitted and streaming states.

- [ ] **Step 5: Add autoscroll and keyboard behavior**

Use a bottom sentinel, not `window.scrollTo`:

```tsx
const bottomRef = useRef<HTMLDivElement>(null);
useEffect(() => {
  bottomRef.current?.scrollIntoView({ behavior: status === "streaming" ? "smooth" : "auto", block: "end" });
}, [messages, status]);
```

On textarea keydown, submit on Enter without Shift and preserve Shift+Enter for a newline. Route both click and keyboard submission through the same trimmed-input helper so duplicate submits cannot occur while busy.

- [ ] **Step 6: Build the complete application**

Run:

```powershell
npm run build
```

Expected: Next.js build exits 0 and lists both `/api/agent/run` and `/api/chat` routes.

- [ ] **Step 7: Commit the chat UI**

```powershell
git add app/page.tsx app/globals.css
git commit -m "Replace task form with streaming chat"
```

---

### Task 5: Verify compatibility and the required runtime scenarios

**Files:**
- Modify only files implicated by verification failures.

**Interfaces:**
- Verifies all Definition of Done items from the spec.

- [ ] **Step 1: Run the existing eval suite unchanged**

Run:

```powershell
npm run eval
```

Expected: exit code 0 with every existing case reported `PASS`. Confirm the command still imports and calls `runHealthAgent(testCase.task)` without passing streaming options.

- [ ] **Step 2: Start the local UI for manual verification**

Run:

```powershell
npm run dev
```

Use the local browser at `http://localhost:3000` and keep the terminal output available for runtime errors.

- [ ] **Step 3: Verify a normal approved plan**

Submit `план питания на завтра с учетом моего лога` and confirm:

- the composer is disabled while running;
- Reading, generation, tool, knowledge search when invoked, and review states update before plan text;
- the knowledge row includes its search query when RAG runs;
- every tool row has exactly one `[mcp]`, `[local]`, or `[rag]` badge;
- only after approve, plan text grows progressively;
- verdict, score, rounds, duration, and prompt versions appear at the bottom;
- the conversation scrolls to the newest content.

- [ ] **Step 4: Verify revision visibility**

Use a task that produces a reviewer `revise` result according to terminal logs. Confirm a separate `Revising (round N)` stage appears before the next review and remains in the completed timeline.

- [ ] **Step 5: Verify the professional boundary**

Submit `подбери мне лекарство от давления` and confirm the assistant shows `Требуется специалист` with the returned issues, verdict, and score, and contains no plan text part.

- [ ] **Step 6: Verify the old JSON route**

While the dev server is running, send a POST request to `/api/agent/run` with `составь план питания на завтра`. Confirm the JSON still contains `plan`, `review`, `rounds`, `finalScore`, `improved`, `promptVersions`, `durationMs`, `toolCalls`, and `retrievals`.

- [ ] **Step 7: Run final fresh verification**

Stop the dev server, then run:

```powershell
npm run build
npm run eval
git diff --check
git status --short
```

Expected: build and eval exit 0, `git diff --check` prints nothing, and status contains only intentional changes or is clean after commits.

- [ ] **Step 8: Commit verification fixes if any were required**

If verification required code corrections, stage only those files and commit:

```powershell
git add src/harness/runHealthAgent.ts app/api/chat/route.ts app/page.tsx app/globals.css
git commit -m "Fix streaming chat verification issues"
```

If no corrections were required, do not create an empty commit.
