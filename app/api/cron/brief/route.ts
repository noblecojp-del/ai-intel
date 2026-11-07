// 毎朝のBEST5生成（Vercel Cron / GitHub Actions から呼ばれる）。公開済みならスキップするので、再実行（リトライ）にも使える
import { NextResponse } from "next/server";
import { runBrief } from "@/lib/brief";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const result = await runBrief("cron");
  return NextResponse.json(result, { status: result.status === "failed" ? 500 : 200 });
}
