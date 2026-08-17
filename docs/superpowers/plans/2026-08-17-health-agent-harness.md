# Health Agent Harness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the health-agent loop into focused harness modules and expose richer execution metadata to API, UI, and CLI.

**Architecture:** Keep `runHealthAgent.ts` as the only public orchestrator while extracting prompt loading, review validation, round history, and score calculation into files with one responsibility. Preserve current agent behavior by moving prompt text verbatim into markdown files.

**Tech Stack:** Next.js App Router, React, TypeScript, Zod, OpenAI Agents SDK, shadcn-style local UI primitives, Tailwind CSS.

## Global Constraints

- Do not change agent behavior or prompt text beyond moving it to files.
- Do not persist traces or round history to disk.
- Do not add tests or use TDD.
- `runHealthAgent(task, maxRounds = 3)` must remain the public entry point.
- `data/output.md` remains the only disk write from runtime execution.

---

### Task 1: Prompt Files And Loader

**Files:**
- Create: `prompts/healthCoach.v1.md`
- Create: `prompts/safetyReviewer.v1.md`
- Create: `src/harness/promptVersions.ts`
- Modify: `src/agents/healthCoach.ts`
- Modify: `src/agents/safetyReviewer.ts`

**Steps:**
- [ ] Move prompt strings verbatim into markdown files.
- [ ] Add `ACTIVE_PROMPTS = { coach: "v1", reviewer: "v1" }`.
- [ ] Add file loader that reads `prompts/<promptName>.<version>.md`.
- [ ] Change agent factories to accept prompt text as an argument.

### Task 2: Review Validation And Rounds

**Files:**
- Create: `src/harness/validateReview.ts`
- Create: `src/harness/rounds.ts`
- Create: `src/harness/score.ts`
- Modify: `src/harness/runHealthAgent.ts`

**Steps:**
- [ ] Move Zod schema and `Review` type to `validateReview.ts`.
- [ ] Implement JSON parse plus Zod `safeParse` with one retry prompt.
- [ ] Add `RoundState { round, plan, review }` and append helper.
- [ ] Add final score and improved calculation.

### Task 3: Orchestrator Contract

**Files:**
- Modify: `src/harness/runHealthAgent.ts`
- Modify: `index.ts`

**Steps:**
- [ ] Change `runHealthAgent` signature to `runHealthAgent(task: string, maxRounds = 3)`.
- [ ] Return `{ plan, review, rounds, finalScore, improved, promptVersions, durationMs }`.
- [ ] Preserve output write only on approved final plan.
- [ ] Update CLI output for new `rounds` array and final score.

### Task 4: API And UI Metadata

**Files:**
- Modify: `app/api/agent/run/route.ts`
- Modify: `app/page.tsx`
- Modify: `AGENTS.md`

**Steps:**
- [ ] Keep route handler shape and return the richer result payload.
- [ ] Update UI result type.
- [ ] Show `durationMs`, active prompt versions, `finalScore`, `improved`, and collapsed round summaries.
- [ ] Document prompt and harness module structure in `AGENTS.md`.

### Task 5: Verification

**Steps:**
- [ ] Run `npm run build`.
- [ ] Run one manual CLI or UI invocation if the required local `.env` and data files are available.
