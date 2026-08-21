"use client";

import { Check, ExternalLink, LoaderCircle } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";

type SaveState =
  | { status: "idle" }
  | { status: "saving" }
  | { status: "saved"; url: string }
  | { status: "error"; message: string };

type NotionResponse = {
  ok?: boolean;
  url?: string;
  error?: string;
};

function getPlanTitle() {
  const date = new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date());

  return `План NutriOS · ${date}`;
}

function isSafeNotionUrl(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && (parsed.hostname === "notion.so" || parsed.hostname.endsWith(".notion.so"));
  } catch {
    return false;
  }
}

export function NotionSaveAction({ markdown }: { markdown: string }) {
  const [state, setState] = useState<SaveState>({ status: "idle" });

  async function save() {
    if (state.status === "saving" || state.status === "saved") return;

    setState({ status: "saving" });

    try {
      const response = await fetch("/api/notion/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markdown, title: getPlanTitle() }),
      });
      const data = (await response.json().catch(() => null)) as NotionResponse | null;

      if (!response.ok || !data?.ok) {
        throw new Error(data?.error || "Не удалось сохранить план в Notion");
      }
      if (!data.url || !isSafeNotionUrl(data.url)) {
        throw new Error("Notion не вернул безопасную ссылку на страницу");
      }

      setState({ status: "saved", url: data.url });
    } catch (error) {
      setState({
        status: "error",
        message: error instanceof Error ? error.message : "Не удалось сохранить план в Notion",
      });
    }
  }

  return (
    <div className="mt-5 border-t pt-4" aria-live="polite">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          size="sm"
          variant={state.status === "saved" ? "secondary" : "outline"}
          disabled={state.status === "saving" || state.status === "saved"}
          onClick={() => void save()}
          className="min-w-40"
        >
          {state.status === "saving" ? (
            <LoaderCircle className="animate-spin" aria-hidden="true" />
          ) : state.status === "saved" ? (
            <Check aria-hidden="true" />
          ) : (
            <span className="flex size-4 items-center justify-center rounded-sm border text-[10px] font-bold" aria-hidden="true">
              N
            </span>
          )}
          {state.status === "saving"
            ? "Сохраняю…"
            : state.status === "saved"
              ? "Сохранено в Notion"
              : state.status === "error"
                ? "Повторить сохранение"
              : "Сохранить в Notion"}
        </Button>

        {state.status === "saved" ? (
          <a
            href={state.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Открыть страницу
            <ExternalLink className="size-3.5" aria-hidden="true" />
          </a>
        ) : null}
      </div>

      {state.status === "error" ? (
        <p role="alert" className="mt-2 text-xs leading-5 text-destructive">
          {state.message} Если запрос успел выполниться частично, страница уже могла появиться — проверьте Wellness в Notion перед повтором.
        </p>
      ) : null}
    </div>
  );
}
