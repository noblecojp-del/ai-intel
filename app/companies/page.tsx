import Link from "next/link";
import { listCompanies } from "@/lib/queries";
import { fmtRelative } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "企業分析" };

export default async function CompaniesPage() {
  const companies = await listCompanies();
  return (
    <div>
      <h1 className="border-b-2 border-ink pb-2 text-xl font-bold">追跡中の企業<span className="ml-2 text-sm font-normal text-ink-faint">{companies.length}社</span></h1>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {companies.map((c) => (
          <Link key={c.slug} href={`/companies/${c.slug}`} className="card group p-4 hover:border-ink/30">
            <div className="flex items-start justify-between gap-2">
              <h2 className="font-bold group-hover:text-accent">{c.name}</h2>
              <span className={`badge ${c.is_listed ? "bg-slate-50 text-slate-700 ring-slate-200" : "bg-white text-ink-faint ring-line"}`}>
                {c.is_listed ? `上場 ${c.ticker ?? ""}` : "非上場"}
              </span>
            </div>
            <p className="mt-1.5 line-clamp-2 text-sm text-ink-soft">{c.description}</p>
            <div className="mt-3 flex justify-between text-xs text-ink-faint">
              <span>30日間 <strong className="tabular-nums text-ink">{c.story_count_30d}</strong>件</span>
              <span>最新 {c.last_story_at ? fmtRelative(c.last_story_at) : "なし"}</span>
            </div>
          </Link>
        ))}
      </div>
      <p className="mt-6 text-xs text-ink-faint">追跡対象は管理画面で最大20社まで変更できます。件数は収集できた記事数で、企業の評価やランキングではありません。</p>
    </div>
  );
}
