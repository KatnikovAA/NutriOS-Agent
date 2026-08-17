# Shadcn UI Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add shadcn/ui styling infrastructure and redesign the NutriOS Agent page into a polished operational dashboard.

**Architecture:** Keep API and harness code unchanged. Add a local UI component layer under `components/ui`, a shared class merge helper in `src/lib/utils.ts`, and global theme styling in `app/globals.css`.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS v4, shadcn/ui component patterns.

## Global Constraints

- Do not change `src/harness/runHealthAgent.ts`, `src/agents/*`, or `app/api/agent/run/route.ts`.
- Do not add tests or use TDD; verify with `npm run build`.
- Keep files focused and respect separation of concerns.
- Store secrets only in `.env`; do not touch runtime `data/*.md` files.
- Use Russian UI copy where it describes the local app workflow.

---

### Task 1: Styling Infrastructure

**Files:**
- Create: `components.json`
- Create: `app/globals.css`
- Create: `src/lib/utils.ts`
- Modify: `app/layout.tsx`
- Modify: `package.json`

**Interfaces:**
- Produces: `cn(...inputs: ClassValue[]): string` from `@/src/lib/utils`.
- Produces: Tailwind theme tokens such as `bg-background`, `text-foreground`, `border-border`, and `text-muted-foreground`.

- [ ] Add Tailwind/shadcn dependencies to `package.json`.
- [ ] Add `components.json` with aliases for `@/components`, `@/src/lib/utils`, and `@/components/ui`.
- [ ] Add `app/globals.css` with Tailwind imports, shadcn theme variables, and body base styling.
- [ ] Import `./globals.css` from `app/layout.tsx` and remove body inline styles.
- [ ] Run `npm install` to update `package-lock.json`.
- [ ] Run `npm run build`.

### Task 2: UI Primitives

**Files:**
- Create: `components/ui/button.tsx`
- Create: `components/ui/card.tsx`
- Create: `components/ui/textarea.tsx`
- Create: `components/ui/badge.tsx`
- Create: `components/ui/alert.tsx`
- Create: `components/ui/separator.tsx`

**Interfaces:**
- Consumes: `cn()` from `@/src/lib/utils`.
- Produces: reusable shadcn-style React components for `app/page.tsx`.

- [ ] Add Button with variants `default`, `outline`, `secondary`, `ghost`, and `destructive`.
- [ ] Add Card primitives: `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter`.
- [ ] Add Textarea, Badge, Alert, AlertTitle, AlertDescription, and Separator.
- [ ] Keep components small and dependency-light.
- [ ] Run `npm run build`.

### Task 3: Page Redesign

**Files:**
- Modify: `app/page.tsx`

**Interfaces:**
- Consumes: UI primitives from `components/ui`.
- Preserves: existing `POST /api/agent/run` request body `{ task }` and result handling.

- [ ] Replace inline styles with semantic Tailwind layout.
- [ ] Use a two-column responsive dashboard layout on desktop and single-column on mobile.
- [ ] Add clear idle, running, error, result, and professional-review states.
- [ ] Render plan output in a readable `pre` block with wrapping.
- [ ] Render safety review metadata with badges and compact cards.
- [ ] Run `npm run build`.

### Task 4: Repository Guidance

**Files:**
- Modify: `AGENTS.md`

**Interfaces:**
- Produces: updated contributor guidance for the shadcn/Tailwind styling layer.

- [ ] Add a section describing the new shadcn/ui and Tailwind CSS styling conventions.
- [ ] Mention where UI primitives live and how new UI should be added.
- [ ] Run `npm run build`.
