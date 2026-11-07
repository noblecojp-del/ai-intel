import Link from "next/link";
import { notFound } from "next/navigation";
import { getPerson, statementsByIds, type PersonAnalysis } from "@/lib/people";
import { KindTag } from "@/components/brief";
import { fmtDateTime, fmtDay } from "@/components/ui";

export const dynamic = "force-dynamic";

type P = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: P }) {
  const d = await getPerson((await params).slug);
  return { title: d ? `${d.person.name}の発言分析` : "人物" };
}

function KindBadge({ kind }: { kind: string }) {
  return kind === "direct_quote"
    ? <span className="badge bg-emerald-50 text-emerald-800 ring-emerald-200" title="記事の原文に本人の言葉として載っていることを照合済み">直接引用</span>
    : <span className="badge bg-white text-ink-soft ring-line" title="記者による要約・言い換え。本人の正確な言葉とは限りません">報道</span>;
}

export default async function PersonPage({ params }: { params: P }) {
  const d = await getPerson((await params).slug);
  if (!d) notFound();
  const { person: p, statements, analysis, topics } = d;
  const a: PersonAnalysis | null = analysis?.payload ?? null;
  const refs = await statementsByIds(a ? [...a.recent_summary, ...a.vs_others].flatMap((x) => x.statement_ids) : []);
  const Refs = ({ ids }: { ids: number[] }) => (
    <>{ids.map((id) => refs.get(id) && (
      <Link key={id} href={`/news/${refs.get(id).story_id}`} title={`${refs.get(id).person_name}：${refs.get(id).summary_ja}`} className="ml-1 text-[11px] text-accent hover:underline">
        [{refs.get(id).slug === p.slug ? "発言" : refs.get(id).person_name}]
      </Link>
    ))}</>
  );

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header className="border-b border-line pb-5">
        <Link href="/people" className="text-sm text-accent">← 人物一覧</Link>
        <h1 className="mt-2 text-2xl font-bold sm:text-3xl">{p.name}<span className="ml-3 text-base font-normal text-ink-faint">{p.name_ja}</span></h1>
        <p className="mt-1 text-sm text-ink-soft">
          {p.role}{p.company_slug && <> ・ <Link href={`/companies/${p.company_slug}`} className="text-accent hover:underline">{p.company_name ?? p.company_slug}</Link></>}
        </p>
        {p.role_checked_on && <p className="mt-0.5 text-[11px] text-ink-faint">役職の確認日：{fmtDay(p.role_checked_on)}</p>}
        {topics.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">{topics.map((t: any) => <span key={t.topic} className="badge bg-slate-50 text-slate-700 ring-slate-200">{t.topic} {t.n}</span>)}</div>
        )}
      </header>

      <section>
        <h2 className="text-lg font-bold">発言の分析</h2>
        {a ? (
          <div className="mt-3 space-y-5 rounded-lg border border-line bg-white p-4 text-[15px] leading-[1.9] sm:p-6">
            <p className="text-xs text-ink-faint">生成 {fmtDateTime(analysis.generated_at)}・{analysis.model}・新しい発言があった週に更新</p>
            <Block title="最近の発言の要点" kind="fact">
              <ul className="space-y-1">{a.recent_summary.map((r, i) => <li key={i} className="flex gap-2"><span className="text-ink-faint">•</span><span>{r.text}<Refs ids={r.statement_ids} /></span></li>)}</ul>
            </Block>
            <Block title="発言の背景" kind="analysis"><p>{a.background}</p></Block>
            <Block title="過去の発言との比較" kind="fact"><p>{a.vs_past}</p></Block>
            {a.vs_others.length > 0 && (
              <Block title="他社・他の人物の見解との違い" kind="analysis">
                <ul className="space-y-1">{a.vs_others.map((r, i) => <li key={i} className="flex gap-2"><span className="text-ink-faint">•</span><span>{r.text}<Refs ids={r.statement_ids} /></span></li>)}</ul>
              </Block>
            )}
            <Block title="今後のAI業界に与える可能性のある影響" kind="forecast"><p>{a.industry_impact}</p></Block>
            {a.missing_info.length > 0 && <p className="text-xs text-ink-faint">情報不足で判断できなかった点：{a.missing_info.join("／")}</p>}
            {analysis.check_note && <p className="text-xs text-ink-faint">自動検証：{analysis.check_note}</p>}
          </div>
        ) : (
          <p className="mt-3 rounded-lg border border-dashed border-line bg-white p-5 text-sm text-ink-soft">
            {statements.length ? "分析はまだ生成されていません。新しい発言があった週の月曜に自動で生成されます。" : "まだ発言が収集されていないため、分析はありません。"}
          </p>
        )}
      </section>

      <section>
        <h2 className="text-lg font-bold">発言一覧<span className="ml-2 text-sm font-normal text-ink-faint">{statements.length}件</span></h2>
        <ol className="mt-3 space-y-0 border-l-2 border-line pl-4">
          {statements.map((s: any) => (
            <li key={s.id} className="relative pb-5">
              <span className="absolute -left-[1.4rem] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-ink/60" aria-hidden />
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                <KindBadge kind={s.kind} />
                <span className="text-ink-soft">{s.topic}</span>
                <span className="text-ink-faint">· 記事の日付 {fmtDateTime(s.said_at)}</span>
              </div>
              <p className="mt-1 text-[15px] leading-relaxed">{s.summary_ja}</p>
              {s.quote && <blockquote className="mt-1.5 border-l-2 border-emerald-300 pl-3 text-sm italic text-ink-soft">“{s.quote}”</blockquote>}
              <div className="mt-1 text-xs text-ink-faint">
                出典：{s.url ? <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">{s.source_name ?? "原文"} ↗</a> : "—"}
                ・<Link href={`/news/${s.story_id}`} className="text-accent hover:underline">{s.story_title}</Link>
              </div>
            </li>
          ))}
          {!statements.length && <li className="text-sm text-ink-faint">まだ発言は収集されていません。</li>}
        </ol>
        <p className="mt-2 text-[11px] text-ink-faint">日付は発言が載った記事の発表日時で、発言した日とは異なる場合があります。</p>
      </section>
    </div>
  );
}

function Block({ title, kind, children }: { title: string; kind: "fact" | "analysis" | "forecast"; children: React.ReactNode }) {
  return (
    <section className="border-t border-line pt-4 first:border-t-0 first:pt-0">
      <h3 className="mb-2 flex flex-wrap items-center gap-2 text-sm font-bold">{title}<KindTag kind={kind} /></h3>
      {children}
    </section>
  );
}
