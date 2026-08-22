import { runOS } from "./src/os/runOS";

async function main() {
  const task = process.argv.slice(2).join(" ").trim();
  if (!task) {
    throw new Error('Передай задачу: npx tsx index.ts "составь план питания на завтра"');
  }

  const result = await runOS(task);
  if (result.review.verdict === "needs_human_professional") {
    console.log(
      `Запрос требует консультации профильного специалиста. module=${result.module}. confidence=${result.intentConfidence.toFixed(2)}. score=${result.finalScore}. План не сохранен.`,
    );
    return;
  }
  console.log(
    `Approved. module=${result.module}. confidence=${result.intentConfidence.toFixed(2)}. score=${result.finalScore}. rounds=${result.rounds.length}. tools=${result.toolCalls.join(",") || "-"}. durationMs=${result.durationMs}. План сохранен в data/output.md`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
