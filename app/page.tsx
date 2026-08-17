"use client";

import { FormEvent, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, ClipboardList, Loader2, ShieldCheck, Stethoscope } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";

type ReviewVerdict = "approve" | "revise" | "needs_human_professional";

type Result = {
  plan: string | null;
  review: { verdict: ReviewVerdict; score: number; issues: string[] };
  rounds: number;
};

const verdictLabels: Record<ReviewVerdict, string> = {
  approve: "Одобрено",
  revise: "Доработано",
  needs_human_professional: "Нужен специалист",
};

const exampleTasks = [
  "составь план питания на завтра",
  "помоги распределить воду и приемы пищи на рабочий день",
  "сделай мягкий план восстановления после позднего ужина",
];

export default function Home() {
  const [task, setTask] = useState("составь план питания на завтра");
  const [status, setStatus] = useState<"idle" | "running" | "result">("idle");
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");

  const canSubmit = status !== "running" && task.trim().length > 0;
  const review = result?.review;

  const verdictVariant = useMemo(() => {
    if (!review) return "secondary";
    return review.verdict === "needs_human_professional" ? "destructive" : "default";
  }, [review]);

  async function runAgent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("running");
    setError("");
    setResult(null);
    try {
      const response = await fetch("/api/agent/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task }),
      });
      const data = (await response.json()) as Result & { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Не удалось запустить агента");
      setResult(data);
      setStatus("result");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось запустить агента");
      setStatus("idle");
    }
  }

  return (
    <main className="min-h-dvh px-4 py-5 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <header className="flex flex-col gap-4 rounded-lg border bg-card px-5 py-4 shadow-xs sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="flex size-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
                <ShieldCheck className="size-4" aria-hidden="true" />
              </div>
              <h1 className="text-2xl font-semibold tracking-normal">NutriOS Agent</h1>
            </div>
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
              Локальный wellness-агент с отдельной проверкой безопасности перед сохранением плана.
            </p>
          </div>
          <Badge variant="secondary" className="h-7 self-start sm:self-center">
            Safety review enabled
          </Badge>
        </header>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(320px,0.95fr)]">
          <section className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ClipboardList className="size-4 text-primary" aria-hidden="true" />
                  Задача для агента
                </CardTitle>
                <CardDescription>Опишите wellness-запрос без медицинских назначений и подбора лекарств.</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={runAgent} className="space-y-4">
                  <div className="space-y-2">
                    <label htmlFor="task" className="text-sm font-medium">
                      Запрос
                    </label>
                    <Textarea
                      id="task"
                      value={task}
                      onChange={(event) => setTask(event.target.value)}
                      rows={6}
                      placeholder="Например: составь план питания на завтра"
                      disabled={status === "running"}
                    />
                  </div>

                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <Button type="submit" disabled={!canSubmit} className="sm:w-auto">
                      {status === "running" ? (
                        <>
                          <Loader2 className="animate-spin" aria-hidden="true" />
                          Агент работает
                        </>
                      ) : (
                        <>
                          <ShieldCheck aria-hidden="true" />
                          Запустить проверку
                        </>
                      )}
                    </Button>
                    <p className="text-sm text-muted-foreground">{task.trim().length} символов</p>
                  </div>
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Быстрые варианты</CardTitle>
                <CardDescription>Готовые формулировки для обычных wellness-сценариев.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-2">
                {exampleTasks.map((example) => (
                  <button
                    key={example}
                    type="button"
                    disabled={status === "running"}
                    onClick={() => setTask(example)}
                    className="rounded-md border bg-background px-3 py-2 text-left text-sm transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/35 disabled:pointer-events-none disabled:opacity-50"
                  >
                    {example}
                  </button>
                ))}
              </CardContent>
            </Card>
          </section>

          <aside className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Статус запуска</CardTitle>
                <CardDescription>Текущее состояние локальной оркестрации.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-3 gap-3">
                  <Metric label="Состояние" value={status === "running" ? "В работе" : status === "result" ? "Готово" : "Ожидает"} />
                  <Metric label="Раунды" value={result ? String(result.rounds) : "-"} />
                  <Metric label="Score" value={review ? `${review.score}/10` : "-"} />
                </div>

                <Separator />

                <div className="flex flex-wrap gap-2">
                  <Badge variant={verdictVariant}>{review ? verdictLabels[review.verdict] : "Нет результата"}</Badge>
                  <Badge variant="outline">Profile + log context</Badge>
                </div>
              </CardContent>
            </Card>

            {error && (
              <Alert variant="destructive">
                <AlertCircle className="mb-2 size-4" aria-hidden="true" />
                <AlertTitle>Запуск не выполнен</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {status === "running" && (
              <Card className="overflow-hidden">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Loader2 className="size-4 animate-spin text-primary" aria-hidden="true" />
                    Агент формирует план
                  </CardTitle>
                  <CardDescription>Health coach и safety reviewer выполняют цикл проверки.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="h-3 w-11/12 rounded bg-muted" />
                  <div className="h-3 w-9/12 rounded bg-muted" />
                  <div className="h-3 w-10/12 rounded bg-muted" />
                </CardContent>
              </Card>
            )}
          </aside>
        </div>

        {status === "result" && result && (
          <section className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(300px,0.9fr)]">
            {result.review.verdict === "needs_human_professional" ? (
              <Alert variant="destructive" className="lg:col-span-2">
                <Stethoscope className="mb-2 size-4" aria-hidden="true" />
                <AlertTitle>Этот запрос требует консультации специалиста</AlertTitle>
                <AlertDescription>
                  Агент не подбирает лекарства, добавки для лечения или медицинские назначения. Обратитесь к профильному специалисту.
                </AlertDescription>
              </Alert>
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CheckCircle2 className="size-4 text-primary" aria-hidden="true" />
                    Финальный план
                  </CardTitle>
                  <CardDescription>Одобренный результат сохранен в локальный output-файл harness.</CardDescription>
                </CardHeader>
                <CardContent>
                  <pre className="max-h-[560px] overflow-auto whitespace-pre-wrap rounded-md border bg-secondary/40 p-4 text-sm leading-6 text-foreground">
                    {result.plan}
                  </pre>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle>Safety review</CardTitle>
                <CardDescription>Итоговая оценка второго агента.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <Metric label="Verdict" value={verdictLabels[result.review.verdict]} />
                  <Metric label="Score" value={`${result.review.score}/10`} />
                </div>
                <Separator />
                <div className="space-y-2">
                  <h2 className="text-sm font-medium">Issues</h2>
                  {result.review.issues.length > 0 ? (
                    <ul className="space-y-2 text-sm text-muted-foreground">
                      {result.review.issues.map((issue, index) => (
                        <li key={`${index}-${issue}`} className="rounded-md bg-muted px-3 py-2">
                          {issue}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">Замечаний нет.</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </section>
        )}
      </div>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-background px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 truncate text-sm font-semibold tabular-nums">{value}</div>
    </div>
  );
}
