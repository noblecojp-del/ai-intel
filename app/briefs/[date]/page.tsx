import Link from "next/link";
import { notFound } from "next/navigation";
import { getBriefByDate, getItemSources, type BriefItem } from "@/lib/brief-queries";
import { ConfidenceBadge, fmtBriefDate, KindTag, ScoreBreakdown, ScoreNumber } from "@/components/brief";
import { DemoBadge, fmtDateTime, VerifyBadge } from "@/components/ui";

export const dynamic = "force-dynamic";

type P = Promise<{ date: string }>;

export async function generateMetadata({ params }: { params: P }) {
  const { date } = await params;
  return { title: /^\d{4}-\d{2}-\d{2}$/.test(date) ? `${fmtBriefDate(date)} AI重要ニュースTOP5` : "TOP5" };
}

export default async function BriefPage({ params }: { params: P }) {
  const { date } = await params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) notFound();
  const data = await getBriefByDate(date);
  if (!data) notFound();
  const { brief, items } = data;
  const sources = await Promise.all(items.map((it) => (it.story_id ? getItemSources(it.story_id) : Promise.resolve([]))));

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/briefs" className="text-sm text-accent">← アーカイブ</Link>
      <h1 className="mt-2 text-2xl font-bold leading-snug sm:text-3xl">{fmtBriefDate(brief.brief_date)}<br className="sm:hidden" /> AI重要ニュース TOP5</h1>
      <p className="mt-2 text-xs leading-relaxed text-ink-faint">
        対象期間 {fmtDateTime(brief.window_start)} 〜 {fmtDateTime(brief.window_end)}・候補 {brief.candidate_count}件から選定・
        {brief.published_at ? `公開 ${fmtDateTime(brief.published_at)}` : `生成 ${fmtDateTime(brief.generated_at)}`}・分析モデル {brief.model}
      </p>
      {brief.is_demo && <p className="mt-3 rounded bg-amber-50 px-3 py-2 text-sm text-amber-900"><DemoBadge /> 画面確認用のデモです。実在のニュースではありません。</p>}
      {brief.status === "failed" && <p className="mt-3 rounded bg-red-50 px-3 py-2 text-sm text-red-800">この日の生成は失敗しました（未更新）。{brief.note}</p>}
      {brief.status === "empty" && <p className="mt-3 rounded bg-slate-50 px-3 py-2 text-sm text-ink-soft">{brief.note ?? "基準を満たす重要ニュースはありませんでした。"}</p>}
      {brief.status === "published" && brief.note && <p className="mt-3 rounded bg-orange-50 px-3 py-2 text-sm text-orange-900">{brief.note}</p>}

      {items.length > 1 && (
        <nav className="mt-6 rounded-lg border border-line bg-white p-4">
          <ol className="space-y-1.5 text-sm">
            {items.map((it) => (
              <li key={it.id} className="flex gap-2"><span className="w-4 font-bold tabular-nums">{it.rank}</span><a href={`#rank-${it.rank}`} className="hover:text-accent">{it.headline}</a><span className="ml-auto shrink-0 tabular-nums text-ink-faint">{it.total_score}点</span></li>
            ))}
          </ol>
        </nav>
      )}

      {brief.status === "empty" && brief.score_summary?.items?.length ? (
        <section className="mt-6">
          <h2 className="text-sm font-bold">参考：基準点（{brief.score_summary.min_score}点）に届かなかった上位の候補<span className="ml-2 font-normal text-ink-faint">AIによる評価</span></h2>
          <ul className="mt-2 divide-y divide-line rounded-lg border border-line bg-white">
            {brief.score_summary.items.slice(0, 5).map((c) => (
              <li key={c.story_id} className="flex gap-3 px-4 py-3 text-sm">
                <span className="w-10 shrink-0 text-right font-bold tabular-nums">{c.total}<span className="text-[10px] font-normal text-ink-faint">点</span></span>
                <div className="min-w-0">
                  <Link href={`/news/${c.story_id}`} className="font-medium hover:text-accent">{c.title}</Link>
                  <p className="mt-0.5 text-xs text-ink-faint">{c.reason}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="mt-8 space-y-14">
        {items.map((it, i) => <Item key={it.id} it={it} sources={sources[i]} />)}
      </div>

      <p className="mt-12 border-t border-line pt-4 text-xs leading-relaxed text-ink-faint">
        「確認済みの事実」は取得できた記事のタイトル・抜粋に基づきます（記事本文は保存していません）。「AIによる分析」「AIによる予測」はAIの推論であり、
        事実を保証するものではありません。重要な判断の前には必ず原文をご確認ください。
      </p>
    </div>
  );
}

function Section({ title, kind, children }: { title: string; kind: "fact" | "analysis" | "forecast"; children: React.ReactNode }) {
  return (
    <section className="border-t border-line pt-4">
      <h3 className="mb-2 flex flex-wrap items-center gap-2 text-sm font-bold">{title}<KindTag kind={kind} /></h3>
      <div className="text-[15px] leading-[1.9]">{children}</div>
    </section>
  );
}

function Item({ it, sources }: { it: BriefItem; sources: any[] }) {
  const a = it.analysis;
  return (
    <article id={`rank-${it.rank}`} className="scroll-mt-20">
      <div className="flex items-start gap-3">
        <span className="text-4xl font-bold tabular-nums text-ink/80">{it.rank}</span>
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex flex-wrap items-center gap-1.5 text-xs">
            {it.verification && <VerifyBadge value={it.verification} />}
            <ConfidenceBadge value={it.confidence} />
            {it.companies.map((c) => <Link key={c.slug} href={`/companies/${c.slug}`} className="font-medium text-accent hover:underline">{c.name}</Link>)}
          </div>
          <h2 className="text-xl font-bold leading-snug">{it.headline}</h2>
        </div>
      </div>

      <div className="mt-4 grid gap-4 rounded-lg border border-line bg-white p-4 sm:grid-cols-[1fr_200px]">
        <div>
          <div className="text-xs font-bold text-ink-soft">重要な理由<span className="ml-2 font-normal text-ink-faint">（AIによる評価）</span></div>
          <p className="mt-1 text-sm leading-relaxed">{it.score_reason}</p>
        </div>
        <div>
          <ScoreNumber value={it.total_score} size="lg" />
          <div className="mt-3"><ScoreBreakdown scores={it.scores} /></div>
        </div>
      </div>

      {a ? (
        <div className="mt-6 space-y-5">
          <Section title="1. ニュース概要" kind="fact">
            <p>{a.overview}</p>
            {a.key_facts?.length > 0 && (
              <ul className="mt-2 space-y-1 text-sm">
                {a.key_facts.map((f, i) => <li key={i} className="flex gap-2"><span className="text-ink-faint">•</span><span>{f.text}<sup className="ml-0.5 text-[10px] text-accent">[{f.source}]</sup></span></li>)}
              </ul>
            )}
          </Section>
          <Section title="2. なぜ重要なのか" kind="analysis"><p>{a.why_important}</p></Section>
          <Section title="3. 今回何が変化したのか" kind="fact"><p>{a.what_changed}</p></Section>
          <Section title="4. 過去の発表との違い" kind="fact"><p>{a.vs_past}</p><p className="mt-1 text-xs text-ink-faint">当サイトが直近90日に収集したニュースとの比較です。</p></Section>
          <Section title="5. 競合企業への影響" kind="analysis"><p>{a.competitors}</p></Section>
          <Section title="6. AI業界全体への影響" kind="analysis"><p>{a.industry}</p></Section>
          <Section title="7. 日本企業への影響" kind="analysis"><p>{a.japan}</p></Section>
          <Section title="8. 経営者が注目すべきポイント" kind="analysis">
            <ul className="space-y-1">{a.exec_points?.map((p, i) => <li key={i} className="flex gap-2"><span className="text-ink-faint">•</span><span>{p}</span></li>)}</ul>
          </Section>
          <Section title="9. 実際のビジネス活用方法" kind="analysis">
            <ul className="space-y-1">{a.business_use?.map((p, i) => <li key={i} className="flex gap-2"><span className="text-ink-faint">•</span><span>{p}</span></li>)}</ul>
          </Section>
          <Section title="10. 短期・中期・長期の展開予測" kind="forecast">
            <dl className="space-y-2">
              {[["短期（〜3か月）", a.outlook?.short], ["中期（〜1年）", a.outlook?.mid], ["長期（1年超）", a.outlook?.long]].map(([k, v]) => (
                <div key={k} className="sm:grid sm:grid-cols-[8rem_1fr] sm:gap-3"><dt className="text-sm font-semibold text-ink-soft">{k}</dt><dd>{v}</dd></div>
              ))}
            </dl>
          </Section>
          <section className="border-t border-line pt-4">
            <h3 className="mb-2 text-sm font-bold">11. 情報源・公式リンク</h3>
            <ol className="space-y-2 text-sm">
              {sources.map((s, i) => (
                <li key={s.url} className="flex gap-2">
                  <span className="text-xs text-accent">[{i + 1}]</span>
                  <div>
                    <a href={s.url} target="_blank" rel="noopener noreferrer" className="font-medium text-accent hover:underline">{s.title} ↗</a>
                    <div className="text-xs text-ink-faint">{s.source_name ?? "—"}（{s.source_type === "official" ? "公式" : "報道"}）・発表 {fmtDateTime(s.published_at)}・取得 {fmtDateTime(s.fetched_at)}</div>
                  </div>
                </li>
              ))}
            </ol>
            {it.story_id && <Link href={`/news/${it.story_id}`} className="mt-2 inline-block text-xs text-accent">このニュースの要約ページ →</Link>}
          </section>
          <section className="border-t border-line pt-4">
            <h3 className="mb-2 flex items-center gap-2 text-sm font-bold">12. 情報の確度<ConfidenceBadge value={it.confidence} /></h3>
            <p className="text-sm leading-relaxed">{it.confidence_note}</p>
            {a.missing_info?.length > 0 && (
              <div className="mt-2 text-sm"><span className="text-xs font-semibold text-ink-soft">情報不足で判断できなかった点：</span>
                <ul className="mt-1 space-y-0.5 text-ink-soft">{a.missing_info.map((m, i) => <li key={i}>・{m}</li>)}</ul>
              </div>
            )}
            <p className="mt-2 text-xs text-ink-faint">
              自動検証：{it.check_status === "ok" ? "問題なし（出典番号・数値の整合性）" : `要確認 — ${it.check_note ?? ""}`}・分析 {it.model}・{fmtDateTime(it.created_at)}
            </p>
          </section>
        </div>
      ) : <p className="mt-4 text-sm text-ink-soft">深掘り分析はありません。</p>}
    </article>
  );
}
