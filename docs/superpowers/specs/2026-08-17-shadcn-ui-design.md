# Shadcn UI Integration Design

## Goal

Integrate shadcn/ui into the existing Next.js App Router application and redesign the single-page wellness agent interface as a focused working panel.

## Current State

The app currently uses inline styles in `app/layout.tsx` and `app/page.tsx`. There is no Tailwind CSS, no shared UI component layer, and no global theme. The API route and agent harness are already separated and must remain unchanged.

## Chosen Approach

Use a conservative shadcn/ui setup:

- Add Tailwind CSS v4 global styling and shadcn-compatible CSS variables.
- Add `components.json` and `src/lib/utils.ts` with the `cn()` helper.
- Add local shadcn-style primitives only where needed: button, card, textarea, badge, alert, and separator.
- Redesign `app/page.tsx` as an operational dashboard instead of a landing page.

## UI Design

The first viewport should show the actual agent tool: a task textarea, launch button, and concise operational context. Results appear below in clear sections:

- Final plan output in a readable preformatted panel.
- Safety review with verdict, score, rounds, and issue list.
- Medical boundary requests as an inline destructive alert.
- Running state as a composed skeleton-like status area.
- Errors as inline alerts, not browser dialogs.

The visual language should be restrained and informative: neutral surfaces, green wellness accent, tight card radius, readable Russian copy, and accessible focus states.

## Scope

In scope:

- Styling infrastructure.
- Local UI primitives.
- Single-page UI redesign.
- Documentation update in `AGENTS.md`.

Out of scope:

- Changes to agent orchestration.
- Authentication, database, streaming, tools/function calling, or persistent user history.
- Automated tests, per repository instruction.

## Verification

Run `npm run build`. If the environment has valid API credentials and local data files, optionally run `npm run cli -- "составь план питания на завтра"` or verify the UI manually through `npm run dev`.
