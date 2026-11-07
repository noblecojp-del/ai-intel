// ローカル実行: npm run ingest（収集→要約）
import { runIngest } from "../lib/ingest";
import { runSummarize } from "../lib/ai";
(async () => {
  console.log("収集:", (await runIngest("cli")).stats);
  console.log("要約:", (await runSummarize("cli")).stats);
  console.log("企業の紐付け:", await (await import("../lib/tagging")).runTagging("cli"));
  process.exit(0);
})();
