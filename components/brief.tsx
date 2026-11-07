import Link from "next/link";
import type { Brief, BriefItem } from "@/lib/brief-queries";
import { SCORE_CRITERIA } from "@/lib/brief-logic";
import { DemoBadge, fmtDateTime, VerifyBadge } from "./ui";

export function fmtBriefDate(d: string) {
  const [y, m, day] = d.split("-").map(Number);
  const w = "日月火水木金土"[new Date(Date.UTC(y, m - 1, day)).getUTCDay()];
  return `${y}年${m}月${day}日（${w}）`;
}

const CONF: Record<string, { label: string; cls: string }> = {
  high: { label: "確度 高", cls: "bg-emerald-50 text-emerald-800 ring-emerald-200" },
  medium: { label: "確度 中", cls: "bg-sky-50 text-sky-800 ring-sky-200" },
  low: { label: "確度 低", cls: "bg-orange-50 text-orange-800 ring-orange-200" },
};

export function ConfidenceBadge({ value }: { value: string | null }) {
  const c = CONF[value ?? ""] ?? CONF.medium;
  return <span className={`badge ${c.cls}`}>{c.label}</span>;
}

export function KindTag({ kind }: { kind: "fact" | "analysis" | "forecast" }) {
  const m = {
    fact: ["確認済みの事実", "bg-emerald-50 text-emerald-800 ring-emerald-200"],
    analysis: ["AIによる分析", "bg-slate-50 text-slate-700 ring-slate-300"],
    forecast: ["AIによる予測", "bg-amber-50 text-amber-800 ring-amber-200"],
  }[kind];
  return <span className={`badge ${m[1]}`}>{m[0]}</span>;
}

export function ScoreNumber({ value, size = "md" }: { value: number; size?: "md" | "lg" }) {
  return (
    <div className="text-right leading-none">
      <span className={`font-bold tabular-nums ${size === "lg" ? "text-3xl" : "text-2xl"}`}>{value}</span>
      <span className="text-xs text-ink-faint"> /100</span>
    </div>
  );
}

export function ScoreBreakdown({ scores }: { scores: BriefItem["scores"] }) {
  return (
    <ul className="space-y-1.5">
      {SCORE_CRITERIA.map((c) => {
        const v = scores?.[c.key] ?? 0;
        return (
          <li key={c.key} className="grid grid-cols-[1fr_auto] items-center gap-x-3 text-xs">
            <span className="text-ink-soft">{c.label}</span>
            <span className="tabular-nums text-ink-soft">{v}<span className="text-ink-faint">/{c.max}</span></span>
            <span className="col-span-2 h-1.5 rounded-full bg-slate-100"><span className="block h-1.5 rounded-full bg-ink/70" style={{ width: `${(v / c.max) * 100}%` }} /></span>
          </li>
        );
      })}
    </ul>
  );
}

/** トップページの「本日のAI重要ニュース TOP5」 */
export function TopFive({ today, todayBrief, brief, items }: { today: string; todayBrief: Brief | null; brief: Brief | null; items: BriefItem[] }) {
  const isToday = brief?.brief_date === today;
  const stale = !isToday;
  return (
    <section className="rounded-lg border border-ink/80 bg-white">
      <header className="flex flex-wrap items-end justify-between gap-2 border-b border-line px-4 py-3 sm:px-5">
        <div>
          <h2 className="text-lg font-bold tracking-tight sm:text-xl">本日のAI重要ニュース TOP5</h2>
          <p className="mt-0.5 text-xs text-ink-faint">
            {brief ? <>{fmtBriefDate(brief.brief_date)}版・最終更新 {fmtDateTime(brief.published_at ?? brief.generated_at)}</> : "まだ生成されていません"}
            ・毎朝9時までに更新
          </p>
        </div>
        {brief && <Link href={`/briefs/${brief.brief_date}`} className="text-sm text-accent hover:underline">詳細分析を読む →</Link>}
      </header>

      {stale && (
        <div className="border-b border-orange-200 bg-orange-50 px-4 py-2.5 text-sm text-orange-900 sm:px-5">
          {todayBrief?.status === "failed"
            ? "本日分の生成に失敗したため未更新です。"
            : todayBrief?.status === "running"
              ? "本日分を生成中です。"
              : "本日分はまだ更新されていません。"}
          {brief && <>以下は{fmtBriefDate(brief.brief_date)}版です。</>}
        </div>
      )}
      {brief?.is_demo && <div className="border-b border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900 sm:px-5"><DemoBadge /> 画面確認用のデモです。実在のニュースではありません。</div>}

      {brief && brief.status === "empty" && (
        <p className="px-4 py-6 text-sm text-ink-soft sm:px-5">{brief.note ?? "基準を満たす重要ニュースはありませんでした。"}（件数を埋めるための掲載はしていません）</p>
      )}

      <ol>
        {items.map((it) => (
          <li key={it.id} className="relative grid grid-cols-[2.25rem_1fr] gap-x-3 border-b border-line px-4 py-4 last:border-b-0 sm:grid-cols-[2.75rem_1fr_auto] sm:px-5">
            <span className="pt-0.5 text-2xl font-bold tabular-nums text-ink/80 sm:text-3xl">{it.rank}</span>
            <div className="min-w-0">
              <div className="mb-1 flex flex-wrap items-center gap-1.5 text-xs">
                {it.verification && <VerifyBadge value={it.verification} />}
                <ConfidenceBadge value={it.confidence} />
                {it.companies.map((c) => <span key={c.slug} className="font-medium text-ink-soft">{c.name}</span>)}
              </div>
              <h3 className="text-base font-bold leading-snug sm:text-lg">
                <Link href={`/briefs/${brief!.brief_date}#rank-${it.rank}`} className="hover:text-accent after:absolute after:inset-0">{it.headline}</Link>
              </h3>
              {it.analysis?.overview && <p className="mt-1.5 line-clamp-3 text-sm leading-relaxed text-ink-soft sm:line-clamp-2">{it.analysis.overview}</p>}
              {it.score_reason && (
                <p className="mt-2 text-xs leading-relaxed text-ink-faint"><span className="font-semibold text-ink-soft">重要な理由：</span>{it.score_reason}</p>
              )}
              <div className="mt-2 sm:hidden"><span className="text-xs text-ink-faint">重要度 </span><span className="font-bold tabular-nums">{it.total_score}</span><span className="text-xs text-ink-faint">/100</span></div>
            </div>
            <div className="hidden w-20 sm:block">
              <ScoreNumber value={it.total_score} />
              <div className="mt-1 text-right text-[10px] text-ink-faint">AI評価</div>
            </div>
          </li>
        ))}
      </ol>
      {items.length > 0 && (
        <p className="border-t border-line px-4 py-2.5 text-[11px] leading-relaxed text-ink-faint sm:px-5">
          重要度スコアはAI（{items[0].model}）による評価です。業界影響25・革新性20・ビジネス20・競合15・日本企業10・話題性10の100点満点。
        </p>
      )}
    </section>
  );
}
