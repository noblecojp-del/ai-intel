import Link from "next/link";
import { dashboardStats, listCompanies, listStories, topStories } from "@/lib/queries";
import { Empty, fmtDateTime, SectionTitle, StoryCard } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const [top, latest, stats, companies] = await Promise.all([
    topStories(7, 5),
    listStories({ limit: 12 }),
    dashboardStats(),
    listCompanies(),
  ]);
  const active = companies.filter((c) => c.story_count_30d > 0).sort((a, b) => b.story_count_30d - a.story_count_30d);
  const maxCat = Math.max(1, ...stats.byCategory.map((c: any) => c.n));

  return (
    <div className="space-y-8">
      {stats.demo_count > 0 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          画面確認用の<strong>デモデータ（{stats.demo_count}件）</strong>が含まれています。実在の発表ではありません。管理画面から削除できます。
        </div>
      )}

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["過去24時間", `${stats.stories_24h}件`],
          ["過去7日", `${stats.stories_7d}件`],
          ["うち公式発表", `${stats.official_7d}件`],
          ["最終収集", stats.last_ingest ? fmtDateTime(stats.last_ingest) : "未実行"],
        ].map(([k, v]) => (
          <div key={k} className="card px-4 py-3">
            <div className="text-xs text-ink-faint">{k}</div>
            <div className="mt-1 text-lg font-bold tabular-nums sm:text-xl">{v}</div>
          </div>
        ))}
      </section>

      <div className="grid gap-8 lg:grid-cols-3">
        <div className="space-y-8 lg:col-span-2">
          <section>
            <SectionTitle>今週の重要ニュース</SectionTitle>
            {top.length ? top.map((s) => <StoryCard key={s.id} s={s} />) : (
              <Empty>まだニュースがありません。管理画面から「今すぐ収集」を実行してください。</Empty>
            )}
          </section>
          <section>
            <SectionTitle href="/news">最新ニュース</SectionTitle>
            {latest.map((s) => <StoryCard key={s.id} s={s} compact />)}
          </section>
        </div>

        <aside className="space-y-8">
          <section>
            <SectionTitle>今週のトピック分布</SectionTitle>
            <ul className="mt-3 space-y-2.5">
              {stats.byCategory.map((c: any) => (
                <li key={c.category}>
                  <Link href={c.category === "未分類" ? "/news" : `/news?category=${encodeURIComponent(c.category)}`} className="group block">
                    <div className="flex justify-between text-sm"><span className="group-hover:text-accent">{c.category}</span><span className="tabular-nums text-ink-faint">{c.n}</span></div>
                    <div className="mt-1 h-1.5 rounded-full bg-slate-100"><div className="h-1.5 rounded-full bg-ink/70" style={{ width: `${(c.n / maxCat) * 100}%` }} /></div>
                  </Link>
                </li>
              ))}
              {!stats.byCategory.length && <li className="text-sm text-ink-faint">データなし</li>}
            </ul>
            <p className="mt-3 text-xs text-ink-faint">件数は収集できた記事の数であり、各分野の重要性を示すものではありません。</p>
          </section>

          <section>
            <SectionTitle href="/companies" more="全企業">動きのあった企業（30日）</SectionTitle>
            <ul className="divide-y divide-line">
              {active.slice(0, 8).map((c) => (
                <li key={c.slug}>
                  <Link href={`/companies/${c.slug}`} className="flex items-center justify-between py-2.5 text-sm hover:text-accent">
                    <span className="font-medium">{c.name}</span>
                    <span className="tabular-nums text-ink-faint">{c.story_count_30d}件</span>
                  </Link>
                </li>
              ))}
              {!active.length && <li className="py-3 text-sm text-ink-faint">データなし</li>}
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}
