// 週次の競争状況分析（毎週月曜の朝）
import { NextResponse } from "next/server";
import { runLandscape } from "@/lib/landscape";
import { runPersonAnalyses } from "@/lib/people";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const r = await runLandscape("cron");
  const people = await runPersonAnalyses("cron");
  return NextResponse.json({ landscape: r, people }, { status: r.status === "failed" ? 500 : 200 });
}
