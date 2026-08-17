import { runHealthAgent } from "./src/harness/runHealthAgent";

async function main() {
  const task = process.argv.slice(2).join(" ").trim();
  if (!task) {
    throw new Error('Передай задачу: npx tsx index.ts "составь план питания на завтра"');
  }

  const result = await runHealthAgent(task);
  if (result.review.verdict === "needs_human_professional") {
    console.log("Запрос требует консультации профильного специалиста. План не сохранен.");
    return;
  }
  console.log(`Approved. score=${result.review.score}. План сохранен в data/output.md`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
