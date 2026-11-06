import Link from "next/link";
import { notFound } from "next/navigation";
import { getStory, relatedStories } from "@/lib/queries";
import { DemoBadge, fmtDateTime, ImportanceBadge, SectionTitle, StoryCard, VerifyBadge } from "@/components/ui";

export const dynamic = "force-dynamic";

type P = Promise<{ id: string }>;

export async function generateMetadata({ params }: { params: P }) {
  const d = await getStory(Number((await params).id));
  return { title: d ? d.story.title_ja || d.story.representative_title : "ニュース" };
}

export default async function StoryPage({ params }: { params: P }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const data = await getStory(id);
  if (!data) notFound();
  const { story: s, articles, versions } = data;
  const related = await relatedStories(id);
  const points: string[] = Array.isArray(s.key_points) ? s.key_points : [];

  return (
    <div className="grid gap-10 lg:grid-cols-3">
      <article className="lg:col-span-2">
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          {s.is_demo && <DemoBadge />}
          <ImportanceBadge value={s.importance} />
          <VerifyBadge value={s.verification} />
          {s.category && <Link href={`/news?category=${encodeURIComponent(s.category)}`} className="text-xs text-ink-soft hover:text-accent">{s.category}</Link>}
        </div>
        <h1 className="text-2xl font-bold leading-snug sm:text-[28px]">{s.title_ja || s.representative_title}</h1>
        {s.title_ja && s.title_ja !== s.representative_title && <p className="mt-2 text-sm text-ink-faint">原題: {s.representative_title}</p>}
        <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-xs text-ink-soft">
          <div><dt className="inline text-ink-faint">発表日時 </dt><dd className="inline">{fmtDateTime(s.first_published_at)}</dd></div>
          <div><dt className="inline text-ink-faint">取得日時 </dt><dd className="inline">{fmtDateTime(articles[0]?.fetched_at)}</dd></div>
          {s.companies.length > 0 && (
            <div><dt className="inline text-ink-faint">関連企業 </dt><dd className="inline space-x-2">
              {s.companies.map((c: any) => <Link key={c.slug} href={`/companies/${c.slug}`} className="font-medium text-accent hover:underline">{c.name}</Link>)}
            </dd></div>
          )}
        </dl>

        {s.summary_status === "done" ? (
          <>
            <section className="mt-6 rounded-lg border border-line bg-white p-5">
              <h2 className="text-sm font-bold text-ink-soft">要約</h2>
              <p className="mt-2 leading-[1.9]">{s.summary_ja}</p>
              {points.length > 0 && (
                <ul className="mt-4 space-y-1.5 border-t border-line pt-4 text-[15px]">
                  {points.map((p, i) => <li key={i} className="flex gap-2"><span className="text-ink-faint">•</span><span>{p}</span></li>)}
                </ul>
              )}
            </section>
            {s.why_it_matters && (
              <section className="mt-4 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-5">
                <h2 className="flex items-center gap-2 text-sm font-bold text-ink-soft">なぜ重要か<span className="badge bg-white text-slate-600 ring-slate-300">AIによる分析</span></h2>
                <p className="mt-2 leading-[1.9]">{s.why_it_matters}</p>
                {s.importance_reason && <p className="mt-3 text-xs text-ink-faint">重要度の判断根拠: {s.importance_reason}</p>}
              </section>
            )}
            <p className="mt-3 text-xs text-ink-faint">
              AI要約 v{s.summary_version}・{s.summary_model}・{fmtDateTime(s.summary_generated_at)}生成
              {s.manually_edited && "・編集者が修正済み"}
              {s.consistency === "warn" && <span className="ml-1 text-orange-700">・要確認: {s.consistency_note}</span>}
            </p>
          </>
        ) : (
          <div className="mt-6 rounded-lg border border-line bg-white p-5 text-sm text-ink-soft">
            AI要約はまだ生成されていません。下記の原文をご確認ください。
          </div>
        )}

        <section className="mt-8">
          <SectionTitle>情報源（{articles.length}件）</SectionTitle>
          <ul className="divide-y divide-line">
            {articles.map((a: any) => (
              <li key={a.id} className="py-3">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className={`badge ${a.source_type === "official" ? "bg-emerald-50 text-emerald-800 ring-emerald-200" : "bg-white text-ink-soft ring-line"}`}>
                    {a.source_type === "official" ? "公式" : a.is_demo ? "デモ" : "報道"}
                  </span>
                  <span className="font-medium text-ink-soft">{a.source_name ?? "デモ"}</span>
                  <span className="text-ink-faint">発表 {fmtDateTime(a.published_at)} / 取得 {fmtDateTime(a.fetched_at)}</span>
                </div>
                <a href={a.url} target="_blank" rel="noopener noreferrer" className="mt-1 block font-medium text-accent hover:underline">{a.title} ↗</a>
              </li>
            ))}
          </ul>
        </section>

        {versions.length > 1 && (
          <details className="mt-6 text-xs text-ink-faint">
            <summary className="cursor-pointer">要約の更新履歴（{versions.length}件）</summary>
            <ul className="mt-2 space-y-1">
              {versions.map((v: any) => <li key={v.version}>v{v.version}・{v.author === "admin" ? "編集者" : v.model}・{fmtDateTime(v.created_at)}</li>)}
            </ul>
          </details>
        )}
      </article>

      <aside>
        <SectionTitle>関連ニュース</SectionTitle>
        {related.length ? related.map((r) => <StoryCard key={r.id} s={r} compact />) : <p className="py-3 text-sm text-ink-faint">関連ニュースはありません</p>}
      </aside>
    </div>
  );
}
