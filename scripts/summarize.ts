import { runSummarize } from "../lib/ai";
(async () => {
  console.log("要約:", (await runSummarize("cli")).stats);
  process.exit(0);
})();
