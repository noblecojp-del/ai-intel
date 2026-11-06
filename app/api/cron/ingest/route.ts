// 定期実行エンドポイント（Vercel Cron / GitHub Actions から呼ばれる）
import { NextResponse } from "next/server";
import { runIngest } from "@/lib/ingest";
import { runSummarize } from "@/lib/ai";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const ingest = await runIngest("cron");
  const summarize = await runSummarize("cron");
  return NextResponse.json({ ingest: ingest.stats, summarize: summarize.stats });
}
