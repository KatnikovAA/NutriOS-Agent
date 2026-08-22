import type { ApprovedRunContext } from "../harness/events";

const EXPLICIT_PREFERENCE_PATTERN =
  /запомни|мне\s+понравил(?:ось|ась|ись|ся)|мне\s+нрав(?:ится|ятся)|я\s+предпочитаю|не\s+люблю/iu;

function localIsoDate() {
  const now = new Date();
  const localTime = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return localTime.toISOString().slice(0, 10);
}

function collapseMarkdown(value: string) {
  return value
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[#>*_`~\[\]()]/g, " ")
    .replace(/^\s*[-+]\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

function limit(value: string, maxLength: number) {
  const clean = collapseMarkdown(value);
  return clean.length <= maxLength ? clean : `${clean.slice(0, maxLength - 1).trimEnd()}…`;
}

function buildDailyLogEntry(context: ApprovedRunContext) {
  return [
    `## ${localIsoDate()}`,
    "",
    `- Тип запроса: ${context.module}`,
    `- Задача: ${limit(context.task, 160)}`,
    `- Результат: ${limit(context.plan, 280)}`,
  ].join("\n");
}

export function hasExplicitPreferenceSignal(task: string) {
  return EXPLICIT_PREFERENCE_PATTERN.test(task);
}

export async function updateMemoryAfterApprove(context: ApprovedRunContext) {
  await context.callMcpTool("append_daily_log", { entry: buildDailyLogEntry(context) });
  if (hasExplicitPreferenceSignal(context.task)) {
    await context.callMcpTool("update_preferences", { preference: limit(context.task, 280) });
  }
}
