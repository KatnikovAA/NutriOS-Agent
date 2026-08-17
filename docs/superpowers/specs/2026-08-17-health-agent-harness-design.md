# Health Agent Harness Design

## Goal

Turn `runHealthAgent` from a single script-style loop into a harness layer that controls prompt versions, review validation, round history, score metadata, timing, and final persistence while preserving the public `runHealthAgent` entry point.

## Architecture

`src/harness/runHealthAgent.ts` remains the orchestrator. It loads environment and context, builds agents with file-backed prompts, runs coach/reviewer cycles, records round state, computes final score metadata, and writes only the approved final plan to `data/output.md`.

Focused modules own one concern each:

- `promptVersions.ts` exposes `ACTIVE_PROMPTS` and loads `prompts/<agent>.<version>.md`.
- `validateReview.ts` owns the Zod review schema and reviewer JSON safe-parse retry.
- `rounds.ts` owns `RoundState` and append-only round history.
- `score.ts` owns `finalScore` and `improved` calculation.

## Data Contract

`runHealthAgent(task, maxRounds = 3)` returns:

```ts
{
  plan: string | null;
  review: Review;
  rounds: RoundState[];
  finalScore: number;
  improved: boolean;
  promptVersions: typeof ACTIVE_PROMPTS;
  durationMs: number;
}
```

`plan` stays `null` when the safety boundary requires a human professional. The old numeric `rounds` field is replaced by full round history because the API/UI now needs per-round metadata.

## Constraints

- Prompt text is moved without behavioral edits.
- No new trace persistence, database, evals, replay, external service, or test framework.
- Only approved final plans are written to `data/output.md`.
- UI shows duration, active prompt versions, final score, improved flag, and collapsed round summaries.
