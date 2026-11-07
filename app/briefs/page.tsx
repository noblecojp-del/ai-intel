import Link from "next/link";
import { listBriefs } from "@/lib/brief-queries";
import { fmtBriefDate } from "@/components/brief";
import { DemoBadge, Empty } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "TOP5アーカイブ" };

const STATUS: Record<string, string> = { published: "公開", empty: "該当なし", failed: "生成失敗（未更新）", running: "生成中" };

export default async function BriefsPage() {
  const briefs = await listBriefs();
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="border-b-2 border-ink pb-2 text-xl font-bold">AI重要ニュース TOP5 アーカイブ</h1>
      {briefs.length ? (
        <ul className="divide-y divide-line">
          {briefs.map((b) => (
            <li key={b.id}>
              <Link href={`/briefs/${b.brief_date}`} className="block py-3.5 hover:text-accent">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-bold">{fmtBriefDate(b.brief_date)}</span>
                  {b.is_demo && <DemoBadge />}
                  <span className={`text-xs ${b.status === "failed" ? "text-red-700" : "text-ink-faint"}`}>{STATUS[b.status] ?? b.status}・{b.item_count}件</span>
                </div>
                {b.top_headline && <p className="mt-1 text-sm text-ink-soft">1位：{b.top_headline}</p>}
              </Link>
            </li>
          ))}
        </ul>
      ) : <div className="mt-4"><Empty>まだTOP5は生成されていません。毎朝9時までに自動で公開されます。</Empty></div>}
    </div>
  );
}
