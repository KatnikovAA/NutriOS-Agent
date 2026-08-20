# Streaming Chat Design

## Goal

Replace the single-task form with one in-memory chat that shows live harness progress, tool calls, and safety review state before streaming the final approved plan. Preserve all existing non-streaming callers and never expose an unreviewed draft.

## Scope

- Add a Vercel AI SDK chat client and a streaming `POST /api/chat` route.
- Keep one chat in React state only. Refreshing the page clears it.
- Treat every submitted message as an independent `runHealthAgent` task. Previous messages remain visible but are not included in later harness input.
- Add an optional event callback to the existing harness without changing its orchestration or result shape.
- Render live stages, tool calls, the final review, and either an approved plan or a professional-referral card.
- Keep `/api/agent/run`, CLI, replay, tracing, and eval callers compatible.

Out of scope: persistent history, multiple conversations, authentication, database changes, direct streaming of the Health Coach draft, and new automated tests.

## Chosen Approach

Use Vercel AI SDK 6 UI message streams. The chat route converts harness events into typed `data-*` message parts. After the harness returns an approved result, the route writes the already-reviewed plan as text deltas. This provides token-like progressive rendering while ensuring that no draft reaches the browser before safety approval.

Direct model-output streaming is rejected because it would expose the initial or revised draft before Safety Reviewer approval and would require restructuring the harness. A custom SSE protocol is rejected because it would duplicate message and transport behavior already provided by the AI SDK.

## Architecture

### Harness event contract

Create `src/harness/events.ts` as the shared, framework-independent event contract. `runHealthAgent` accepts an optional callback while retaining existing positional calls:

```ts
type HealthAgentEventHandler = (event: HealthAgentEvent) => void | Promise<void>;

runHealthAgent(
  task: string,
  maxRounds?: number,
  options?: { onEvent?: HealthAgentEventHandler },
): Promise<HealthAgentResult>;
```

Events use a discriminated union and contain only serializable data:

- `stage`: a stable stage key, status (`active` or `completed`), optional round, query, verdict, score, and issues.
- `tool_call`: formatted tool name, raw name, normalized source, and optional search query.
- `result`: final metadata needed by the UI: review, rounds, final score, improvement flag, prompt versions, duration, tool calls, and retrieval traces. The plan does not need to be duplicated in this event because it is sent as a text part only after approval.

The callback is awaited through a small `emit` helper so event order is deterministic and transport backpressure is respected. Runner lifecycle listeners enqueue their emissions, and `runText` flushes that queue after `runner.run` completes because the SDK event emitter itself does not await listeners. With no callback, emission is a no-op.

### Stage lifecycle

The harness emits stages around the existing operations without changing their control flow:

1. `reading_profile` becomes active before the initial Health Coach run and completes when that run finishes. Profile and log tool calls remain separately visible; this stage represents context preparation, not a guarantee that a specific profile tool was invoked.
2. `generating_plan` becomes active before the first Health Coach run and completes when the draft is ready.
3. `searching_knowledge` is emitted only when `searchKnowledge` is called. It carries the actual query and is completed after retrieval returns.
4. `reviewing_safety` becomes active before each reviewer invocation and completes with that round's verdict, score, and issues.
5. `revising` is emitted only after a `revise` verdict, before generating the next draft. Its `round` is the next review round number, and it completes when the revised draft is ready.
6. `final_approved_plan` is emitted only after `approve` and the existing approved-plan save succeeds.

The UI orders stage entries by the canonical workflow sequence (`reading_profile`, optional `searching_knowledge`, `generating_plan`, `reviewing_safety`, optional `revising`, `final_approved_plan`) even when a tool event arrives while generation is active. Tool rows retain their arrival order. Repeated review and revision events are distinguished by stable IDs containing their round. A stage start and completion share an ID, allowing the stream processor to reconcile them into one timeline row.

### Tool-call visibility

Use the Agents SDK `Runner` lifecycle hooks to emit tool calls at `agent_tool_start`, before the tool finishes. This covers local function tools and MCP tools through one path. Existing result collection remains unchanged and continues to deduplicate tool names from run items.

Tool sources are normalized for display:

- `rag` for `searchKnowledge`;
- `local` for direct function tools;
- `mcp` for tools found in the configured MCP source map, while retaining the concrete server name in the event for diagnostics.

For `searchKnowledge`, parse the tool call arguments and attach the query to both the tool row and search stage. If arguments are malformed, emit the tool row without a query rather than failing the run.

### Streaming route

Add `app/api/chat/route.ts` with Node.js runtime. It accepts AI SDK UI messages, validates that the last message is a non-empty user text message, and ignores all earlier messages when invoking the harness.

The route creates a typed `UIMessageStream` and starts `runHealthAgent` inside its execution callback. Harness events are written as persistent data parts with stable IDs. On completion:

- `approve`: write a text start, split the approved plan into small word-preserving chunks, write text deltas in order, then write text end and the final result data part;
- `needs_human_professional`: write the final result data part only; no text part is sent;
- failure: surface a sanitized error through the stream so the assistant message can render an error state.

The route does not call a model through AI SDK. AI SDK supplies the UI streaming protocol and React chat state; the existing Agents SDK/DeepSeek harness remains the only generation path.

## Client UI

Replace `app/page.tsx` with a single-page chat workspace using `useChat` and `DefaultChatTransport` pointed at `/api/chat`. Configure the transport to send the most recent message only, matching the independent-run decision.

The page owns only the input field; `useChat` owns the in-memory message list and request status. The layout contains:

- a compact product header with safety status;
- a scrollable conversation column;
- user message bubbles;
- assistant cards containing the live timeline, tool rows, streamed plan, and final verdict/score;
- an empty state with example prompts before the first message;
- a sticky composer at the bottom.

Data parts are rendered in message-part order. Timeline parts reconcile by stable ID so a stage changes from active to completed in place. Tool calls always create separate rows and show `[mcp]`, `[local]`, or `[rag]`. The final result renders verdict, score, duration, rounds, and prompt versions beneath the answer.

If the verdict is `needs_human_professional`, render a destructive card titled `Требуется специалист` with the review issues. Do not render an empty plan placeholder. If the stream fails, render a concise error in the current assistant response and re-enable the composer.

The composer is disabled while the request is submitted or streaming. A bottom sentinel is scrolled into view whenever messages or request status change, providing automatic chat scrolling without global page jumps.

No new component or styling library is added. Existing Tailwind CSS and local primitives may be reused, but the chat composition remains in app-owned code and uses the established design tokens.

## Compatibility

`runHealthAgent(task, maxRounds)` remains valid because the options argument is optional. `HealthAgentResult` is unchanged. The existing `/api/agent/run` route, CLI, eval script, replay tooling, and trace writer require no behavior changes.

Approved plans continue to be saved only after `approve`. Shopping-list and other tool side effects keep their existing behavior. MCP processes are still closed by the existing `finally` block.

## Error and Safety Behavior

- Reject missing or empty last-user text with HTTP 400 before starting the stream.
- Never send a draft plan as a text part.
- If no approval is reached within `maxRounds`, send an error rather than the last unapproved draft.
- On `needs_human_professional`, send issues and metadata but no plan text.
- Do not expose stack traces, environment values, prompts, or raw tool results to the browser.
- Client cancellation is not added to scope; the input stays disabled until the current request settles.

## Verification

No automated tests are added, per project requirements. Verification consists of:

1. `npm run build` to validate the Next.js route, client component, and TypeScript contracts.
2. `npm run eval` to confirm all existing eval cases still use the unchanged non-streaming harness path.
3. Manual UI run with a normal wellness task to verify stage updates, tool rows, incremental approved-plan text, autoscroll, disabled input, and final verdict/score.
4. Manual UI run that produces `revise` to verify a distinct `Revising (round N)` row.
5. Manual UI run with a medical or supplement request to verify `Требуется специалист`, issue rendering, and absence of plan text.
6. A request to the existing `/api/agent/run` route to confirm its response shape remains unchanged.

## Definition of Done

- A submitted chat message creates a live assistant response with stage updates before final text.
- Knowledge search shows its query when used.
- Every observed tool call appears as a source-tagged timeline row.
- Revision rounds are explicit and appear only after a `revise` verdict.
- Only an approved plan is progressively rendered as text.
- Professional-referral outcomes show issues instead of a plan.
- Final verdict and score appear below the response.
- Chat history exists only for the current page lifetime and is not passed into later harness runs.
- `npm run build` and `npm run eval` complete successfully.
