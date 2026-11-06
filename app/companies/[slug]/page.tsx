import Link from "next/link";
import { notFound } from "next/navigation";
import { getCompany, listCompanies, listStories } from "@/lib/queries";
import { Empty, SectionTitle, StoryCard } from "@/components/ui";

export const dynamic = "force-dynamic";

type P = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: P }) {
  const d = await getCompany((await params).slug);
  return { title: d?.company.name ?? "企業" };
}

export default async function CompanyPage({ params }: { params: P }) {
  const { slug } = await params;
  const data = await getCompany(slug);
  if (!data) notFound();
  const { company: c, categories, sources } = data;
  const [latest, products, research, business, all] = await Promise.all([
    listStories({ company: slug, limit: 8 }),
    listStories({ company: slug, category: "モデル・製品発表", limit: 5 }),
    listStories({ company: slug, category: "研究・技術", limit: 5 }),
    listStories({ company: slug, category: "経営・資金調達", limit: 5 }),
    listCompanies(),
  ]);
  const peers = all.filter((p) => p.slug !== slug).sort((a, b) => b.story_count_30d - a.story_count_30d).slice(0, 6);
  const self = all.find((p) => p.slug === slug);

  return (
    <div className="space-y-8">
      <header className="border-b border-line pb-6">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold sm:text-3xl">{c.name}</h1>
          <span className="badge bg-slate-50 text-slate-700 ring-slate-200">{c.is_listed ? `上場 ${c.ticker ?? ""}` : "非上場"}</span>
        </div>
        <p className="mt-2 max-w-3xl text-ink-soft">{c.description}</p>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {c.website && <a href={c.website} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">公式サイト ↗</a>}
          {c.is_listed && c.ir_url && <a href={c.ir_url} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">投資家向け情報 ↗</a>}
        </div>
      </header>

      <div className="grid gap-8 lg:grid-cols-3">
        <div className="space-y-8 lg:col-span-2">
          <section>
            <SectionTitle href={`/news?company=${slug}`}>最新ニュース</SectionTitle>
            {latest.length ? latest.map((s) => <StoryCard key={s.id} s={s} />) : <div className="mt-3"><Empty>この企業に関するニュースはまだ収集されていません。</Empty></div>}
          </section>
          {[["新製品・モデル発表", products, "モデル・製品発表"], ["研究・技術動向", research, "研究・技術"], ["経営・資金調達", business, "経営・資金調達"]].map(([title, list, cat]) =>
            (list as typeof latest).length ? (
              <section key={title as string}>
                <SectionTitle href={`/news?company=${slug}&category=${encodeURIComponent(cat as string)}`}>{title as string}</SectionTitle>
                {(list as typeof latest).map((s) => <StoryCard key={s.id} s={s} compact />)}
              </section>
            ) : null,
          )}
        </div>

        <aside className="space-y-8">
          <section>
            <SectionTitle>決算・投資家向け情報</SectionTitle>
            <p className="mt-3 text-sm text-ink-soft">
              {c.is_listed
                ? c.ir_url ? "公式の投資家向けページへのリンクを掲載しています。決算の自動取り込みは今後対応予定です。" : "上場企業ですが、投資家向けページは未登録です（管理画面で設定できます）。"
                : "非上場企業のため、公開されている決算情報はありません。"}
            </p>
          </section>

          <section>
            <SectionTitle>過去90日のトピック</SectionTitle>
            <ul className="mt-2 divide-y divide-line text-sm">
              {categories.map((k) => <li key={k.category} className="flex justify-between py-2"><span>{k.category}</span><span className="tabular-nums text-ink-faint">{k.n}件</span></li>)}
              {!categories.length && <li className="py-2 text-ink-faint">データなし</li>}
            </ul>
          </section>

          <section>
            <SectionTitle>他社との比較（30日の記事数）</SectionTitle>
            <table className="mt-2 w-full text-sm">
              <tbody>
                <tr className="font-bold"><td className="py-1.5">{c.name}</td><td className="text-right tabular-nums">{self?.story_count_30d ?? 0}</td></tr>
                {peers.map((p) => (
                  <tr key={p.slug} className="border-t border-line"><td className="py-1.5"><Link href={`/companies/${p.slug}`} className="hover:text-accent">{p.name}</Link></td><td className="text-right tabular-nums text-ink-soft">{p.story_count_30d}</td></tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-ink-faint">情報源の数・更新頻度の差を含むため、企業の勢いを示す指標ではありません。詳細な比較分析は第2段階で追加予定です。</p>
          </section>

          <section>
            <SectionTitle>この企業の情報源</SectionTitle>
            <ul className="mt-2 space-y-1.5 text-sm">
              {sources.map((s: any) => <li key={s.feed_url}><a href={s.site_url ?? s.feed_url} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">{s.name} ↗</a></li>)}
              {!sources.length && <li className="text-ink-faint">公式フィードは未登録です。報道記事のキーワード一致で紐付けています。</li>}
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}
