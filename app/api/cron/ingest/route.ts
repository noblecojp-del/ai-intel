// 定期実行エンドポイント（Vercel Cron / GitHub Actions から呼ばれる）
import { NextResponse } from "next/server";
import { runIngest } from "@/lib/ingest";
import { runSummarize } from "@/lib/ai";
import { runTagging } from "@/lib/tagging";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const ingest = await runIngest("cron");
  const summarize = await runSummarize("cron");
  // 要約の後に企業の紐付けをAIで判定（要約がある方が精度が高い）
  const tagging = await runTagging("cron", 100);
  return NextResponse.json({ ingest: ingest.stats, summarize: summarize.stats, tagging });
}
