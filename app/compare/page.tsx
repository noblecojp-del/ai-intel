import Link from "next/link";
import { companyComparison, companyTimeline, latestAnalysis, listModels, storiesByIds, type ModelRow } from "@/lib/compare";
import type { Landscape } from "@/lib/landscape";
import { KindTag } from "@/components/brief";
import { fmtDateTime } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "企業・モデル比較" };

const fmtNum = (n: number) => n.toLocaleString("ja-JP");

function Delta({ now, prev }: { now: number; prev: number }) {
  const d = now - prev;
  if (prev === 0 && now === 0) return <span className="text-ink-faint">—</span>;
  const cls = d > 0 ? "text-emerald-700" : d < 0 ? "text-red-700" : "text-ink-faint";
  return <span className={`text-xs tabular-nums ${cls}`}>{d > 0 ? `▲${d}` : d < 0 ? `▼${-d}` : "±0"}</span>;
}

export default async function ComparePage() {
  const [companies, timeline, models, analysis] = await Promise.all([companyComparison(), companyTimeline(90), listModels(), latestAnalysis()]);
  const land: Landscape | null = analysis?.payload ?? null;
  const refIds = land ? [...land.company_moves.flatMap((c) => c.moves.flatMap((m) => m.story_ids)), ...land.japan_use_cases.flatMap((u) => u.story_ids)] : [];
  const refs = await storiesByIds([...new Set(refIds)]);
  const now = Date.now();
  const span = 90 * 864e5;

  return (
    <div className="space-y-12">
      <header>
        <h1 className="border-b-2 border-ink pb-2 text-xl font-bold sm:text-2xl">企業・モデル比較</h1>
        <nav className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {[["#landscape", "競争状況（AI分析）"], ["#companies", "企業比較"], ["#timeline", "タイムライン"], ["#models", "モデル比較"]].map(([h, l]) => (
            <a key={h} href={h} className="text-accent hover:underline">{l}</a>
          ))}
        </nav>
      </header>

      {/* 1. 競争状況（AI分析） */}
      <section id="landscape" className="scroll-mt-20">
        <h2 className="text-lg font-bold">今週の競争状況</h2>
        {land ? (
          <div className="mt-3 rounded-lg border border-line bg-white p-4 sm:p-6">
            <p className="text-xs text-ink-faint">
              対象 {fmtDateTime(analysis.period_start)} 〜 {fmtDateTime(analysis.period_end)}・生成 {fmtDateTime(analysis.generated_at)}・{analysis.model}・毎週月曜に更新
            </p>
            <h3 className="mt-2 text-xl font-bold leading-snug">{land.headline}</h3>
            <div className="mt-5 space-y-6 text-[15px] leading-[1.9]">
              <Block title="今週の動き" kind="fact"><p>{land.overview}</p></Block>
              {land.company_moves.length > 0 && (
                <Block title="企業別の主な動き" kind="fact">
                  <dl className="space-y-3">
                    {land.company_moves.map((c) => (
                      <div key={c.company}>
                        <dt className="text-sm font-bold">{c.company}</dt>
                        <dd>
                          <ul className="mt-1 space-y-1">
                            {c.moves.map((m, i) => (
                              <li key={i} className="flex gap-2 text-sm">
                                <span className="text-ink-faint">•</span>
                                <span>{m.text}{m.story_ids.map((id) => refs.get(id) && <Link key={id} href={`/news/${id}`} title={refs.get(id)!.title} className="ml-1 text-[11px] text-accent hover:underline">[記事]</Link>)}</span>
                              </li>
                            ))}
                          </ul>
                        </dd>
                      </div>
                    ))}
                  </dl>
                </Block>
              )}
              <Block title="競争状況" kind="analysis"><p>{land.competitive_dynamics}</p></Block>
              <Block title="新技術が市場に与える影響" kind="analysis"><p>{land.tech_impact}</p></Block>
              <Block title="前週からの変化" kind="analysis"><p>{land.changes_vs_last_week}</p></Block>
              {land.japan_use_cases.length > 0 && (
                <Block title="日本企業が検討できるAI活用" kind="analysis">
                  <ul className="grid gap-3 sm:grid-cols-2">
                    {land.japan_use_cases.map((u, i) => (
                      <li key={i} className="rounded-md border border-line p-3 text-sm">
                        <div className="font-bold">{u.title}</div>
                        <p className="mt-1 leading-relaxed text-ink-soft">{u.description}</p>
                        <div className="mt-1">{u.story_ids.map((id) => refs.get(id) && <Link key={id} href={`/news/${id}`} className="mr-2 text-[11px] text-accent hover:underline">根拠：{refs.get(id)!.title.slice(0, 24)}…</Link>)}</div>
                      </li>
                    ))}
                  </ul>
                </Block>
              )}
              <Block title="今後1〜3か月の注目点" kind="forecast">
                <ul className="space-y-1">{land.watch_next.map((w, i) => <li key={i} className="flex gap-2"><span className="text-ink-faint">•</span><span>{w}</span></li>)}</ul>
              </Block>
              {land.missing_info.length > 0 && <p className="text-xs text-ink-faint">情報不足で判断できなかった点：{land.missing_info.join("／")}</p>}
              {analysis.check_note && <p className="text-xs text-ink-faint">自動検証：{analysis.check_note}</p>}
            </div>
          </div>
        ) : (
          <p className="mt-3 rounded-lg border border-dashed border-line bg-white p-5 text-sm text-ink-soft">競争状況の分析はまだ生成されていません。毎週月曜の朝に自動で生成されます。</p>
        )}
      </section>

      {/* 2. 企業比較 */}
      <section id="companies" className="scroll-mt-20">
        <h2 className="text-lg font-bold">企業比較</h2>
        <p className="mt-1 text-xs text-ink-faint">当サイトが収集したニュースの件数です（{fmtDateTime(new Date())} 時点）。各社の情報源の数や発信頻度の違いを含むため、企業の評価やランキングではありません。</p>
        <div className="mt-3 overflow-x-auto rounded-lg border border-line bg-white">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr>
                <th className="th">企業</th>
                <th className="th text-right">7日間<br /><span className="font-normal">（前週比）</span></th>
                <th className="th text-right">30日間<br /><span className="font-normal">（前月比）</span></th>
                <th className="th text-right">うち公式</th>
                <th className="th">主な分野（30日）</th>
                <th className="th">直近の主な発表</th>
              </tr>
            </thead>
            <tbody>
              {companies.map((c) => (
                <tr key={c.id}>
                  <td className="td whitespace-nowrap"><Link href={`/companies/${c.slug}`} className="font-bold hover:text-accent">{c.name}</Link><div className="text-[11px] text-ink-faint">{c.is_listed ? "上場" : "非上場"}</div></td>
                  <td className="td text-right tabular-nums"><div className="font-bold">{c.n7}</div><Delta now={c.n7} prev={c.prev7} /></td>
                  <td className="td text-right tabular-nums"><div className="font-bold">{c.n30}</div><Delta now={c.n30} prev={c.prev30} /></td>
                  <td className="td text-right tabular-nums">{c.official30}</td>
                  <td className="td">
                    <div className="flex flex-wrap gap-1">
                      {c.categories.slice(0, 3).map((k) => <span key={k.category} className="badge bg-slate-50 text-slate-700 ring-slate-200">{k.category} {k.n}</span>)}
                      {!c.categories.length && <span className="text-ink-faint">—</span>}
                    </div>
                  </td>
                  <td className="td">{c.latest ? <Link href={`/news/${c.latest.id}`} className="line-clamp-2 hover:text-accent">{c.latest.title}</Link> : <span className="text-ink-faint">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 3. タイムライン */}
      <section id="timeline" className="scroll-mt-20">
        <h2 className="text-lg font-bold">企業別タイムライン（直近90日）</h2>
        <p className="mt-1 text-xs text-ink-faint">重要度「注目」以上、または公式発表のニュースを表示。点にマウスを合わせると見出しを表示します。</p>
        <div className="mt-3 rounded-lg border border-line bg-white p-4">
          <div className="mb-2 grid grid-cols-[7rem_1fr] text-[10px] text-ink-faint sm:grid-cols-[9rem_1fr]">
            <span />
            <div className="flex justify-between"><span>90日前</span><span>60日前</span><span>30日前</span><span>今日</span></div>
          </div>
          <ul className="space-y-1.5">
            {companies.map((c) => {
              const ev = timeline.filter((t) => t.company_id === c.id);
              return (
                <li key={c.id} className="grid grid-cols-[7rem_1fr] items-center sm:grid-cols-[9rem_1fr]">
                  <Link href={`/companies/${c.slug}`} className="truncate pr-2 text-xs font-medium hover:text-accent">{c.name}<span className="ml-1 text-ink-faint">{ev.length}</span></Link>
                  <svg viewBox="0 0 1000 20" preserveAspectRatio="none" className="h-5 w-full" role="img" aria-label={`${c.name}の発表 ${ev.length}件`}>
                    <line x1="0" y1="10" x2="1000" y2="10" stroke="#e4e6ea" strokeWidth="2" />
                    {[333, 667].map((x) => <line key={x} x1={x} y1="4" x2={x} y2="16" stroke="#e4e6ea" strokeWidth="2" />)}
                    {ev.map((e) => {
                      const x = Math.max(4, Math.min(996, 1000 - ((now - new Date(e.at).getTime()) / span) * 1000));
                      const color = (e.importance ?? 0) >= 3 ? "#dc2626" : (e.importance ?? 0) >= 2 ? "#f59e0b" : "#64748b";
                      return (
                        <a key={e.id} href={`/news/${e.id}`}>
                          <circle cx={x} cy="10" r="6" fill={color} stroke="#fff" strokeWidth="1.5" vectorEffect="non-scaling-stroke"><title>{`${new Date(e.at).toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo" })} ${e.title}`}</title></circle>
                        </a>
                      );
                    })}
                  </svg>
                </li>
              );
            })}
          </ul>
          <div className="mt-3 flex flex-wrap gap-4 text-[11px] text-ink-faint">
            <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-red-600" />重要</span>
            <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-amber-500" />注目</span>
            <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-slate-500" />公式発表（参考）</span>
          </div>
        </div>
      </section>

      {/* 4. モデル比較 */}
      <ModelsSection models={models} />
    </div>
  );
}

function Block({ title, kind, children }: { title: string; kind: "fact" | "analysis" | "forecast"; children: React.ReactNode }) {
  return (
    <section className="border-t border-line pt-4">
      <h4 className="mb-2 flex flex-wrap items-center gap-2 text-sm font-bold">{title}<KindTag kind={kind} /></h4>
      {children}
    </section>
  );
}

function ModelsSection({ models }: { models: ModelRow[] }) {
  // 出典を番号付きで一覧化
  const sources = new Map<string, { n: number; title: string; checked: string }>();
  // 子コンポーネントは後で描画されるため、番号は先にまとめて振っておく
  for (const m of models) for (const f of m.facts) {
    if (!sources.has(f.source_url)) sources.set(f.source_url, { n: sources.size + 1, title: f.source_title ?? f.source_url, checked: f.checked_on });
  }
  const srcNo = (url: string, _t?: string | null, _c?: string) => sources.get(url)?.n ?? 0;
  const pick = (m: ModelRow, field: string) => m.facts.filter((f) => f.field === field);
  const fmtVal = (f: ModelRow["facts"][number]) =>
    f.value_num != null ? (f.field.startsWith("price") ? `$${f.value_num}` : fmtNum(f.value_num)) : f.value_text ?? "—";

  const Cell = ({ m, field }: { m: ModelRow; field: string }) => {
    const fs = pick(m, field);
    if (!fs.length) return <td className="td text-right text-ink-faint">未確認</td>;
    return (
      <td className="td text-right">
        {fs.map((f) => (
          <div key={f.id} className="tabular-nums">
            {fmtVal(f)}
            <a href={f.source_url} target="_blank" rel="noopener noreferrer" className="ml-0.5 align-super text-[10px] text-accent">[{srcNo(f.source_url, f.source_title, f.checked_on)}]</a>
            {f.condition && <div className="text-[10px] leading-tight text-ink-faint">{f.condition}</div>}
          </div>
        ))}
      </td>
    );
  };

  // 出力価格のグラフ（標準＝最初の値）
  const priced = models.map((m) => ({ m, v: pick(m, "price_out")[0]?.value_num })).filter((x): x is { m: ModelRow; v: number } => x.v != null).sort((a, b) => b.v - a.v);
  const max = Math.max(1, ...priced.map((p) => p.v));
  const benchmarks = models.flatMap((m) => pick(m, "benchmark").map((f) => ({ m, f })));
  const table = (
    <div className="mt-3 overflow-x-auto rounded-lg border border-line bg-white">
      <table className="w-full min-w-[720px] text-sm">
        <thead>
          <tr>
            <th className="th">モデル</th>
            <th className="th text-right">入力価格<br /><span className="font-normal">USD/100万トークン</span></th>
            <th className="th text-right">出力価格<br /><span className="font-normal">USD/100万トークン</span></th>
            <th className="th text-right">コンテキスト長<br /><span className="font-normal">トークン</span></th>
            <th className="th text-right">最大出力<br /><span className="font-normal">トークン</span></th>
          </tr>
        </thead>
        <tbody>
          {models.map((m) => (
            <tr key={m.id}>
              <td className="td whitespace-nowrap"><div className="font-bold">{m.name}</div><div className="text-[11px] text-ink-faint">{m.company_name ?? m.company_slug}・<code>{m.model_key}</code></div></td>
              <Cell m={m} field="price_in" />
              <Cell m={m} field="price_out" />
              <Cell m={m} field="context" />
              <Cell m={m} field="max_output" />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <section id="models" className="scroll-mt-20">
      <h2 className="text-lg font-bold">モデル比較</h2>
      <p className="mt-1 text-xs leading-relaxed text-ink-faint">
        各社の公式ページで確認できた値のみを掲載しています（標準料金。バッチ・キャッシュ割引などは含みません）。「未確認」は公式ページで確認できなかった項目です。
        AIによる独自のランキングやスコアは作成していません。
      </p>
      {models.length ? table : <p className="mt-3 text-sm text-ink-faint">登録されたモデルはありません。</p>}

      {priced.length > 0 && (
        <div className="mt-6 rounded-lg border border-line bg-white p-4">
          <h3 className="text-sm font-bold">出力価格の比較<span className="ml-2 font-normal text-ink-faint">USD / 100万トークン・標準料金</span></h3>
          <ul className="mt-3 space-y-1.5">
            {priced.map(({ m, v }) => (
              <li key={m.id} className="grid grid-cols-[8.5rem_1fr_3.5rem] items-center gap-2 text-xs sm:grid-cols-[11rem_1fr_4rem]">
                <span className="truncate">{m.name}</span>
                <span className="h-3 rounded-sm bg-slate-100"><span className="block h-3 rounded-sm bg-ink/70" style={{ width: `${Math.max(1, (v / max) * 100)}%` }} /></span>
                <span className="text-right tabular-nums">${v}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {benchmarks.length > 0 && (
        <div className="mt-6 overflow-x-auto rounded-lg border border-line bg-white">
          <table className="w-full min-w-[640px] text-sm">
            <thead><tr><th className="th">ベンチマーク</th><th className="th">モデル</th><th className="th text-right">スコア</th><th className="th">測定条件</th></tr></thead>
            <tbody>
              {benchmarks.map(({ m, f }) => (
                <tr key={f.id}>
                  <td className="td">{f.label}</td><td className="td">{m.name}</td>
                  <td className="td text-right tabular-nums">{fmtVal(f)}{f.unit ?? ""}<a href={f.source_url} target="_blank" rel="noopener noreferrer" className="ml-0.5 align-super text-[10px] text-accent">[{srcNo(f.source_url, f.source_title, f.checked_on)}]</a></td>
                  <td className="td text-xs text-ink-soft">{f.condition ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="px-3 py-2 text-[11px] text-ink-faint">各社の自己申告値を含みます。測定条件が異なる値は単純に比較できません。</p>
        </div>
      )}

      {sources.size > 0 && (
        <div className="mt-4 text-xs text-ink-soft">
          <div className="font-bold">出典</div>
          <ol className="mt-1 space-y-0.5">
            {[...sources.entries()].map(([url, s]) => (
              <li key={url}>[{s.n}] <a href={url} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">{s.title}</a>（取得日 {s.checked}）</li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}
