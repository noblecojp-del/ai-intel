import Link from "next/link";
import type { StoryRow } from "@/lib/queries";

const TZ = "Asia/Tokyo";

export function fmtDateTime(v: string | Date | null | undefined) {
  if (!v) return "日時不明";
  const d = new Date(v);
  return d.toLocaleString("ja-JP", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function fmtRelative(v: string | Date | null | undefined) {
  if (!v) return "日時不明";
  const diff = (Date.now() - new Date(v).getTime()) / 60000;
  if (diff < 60) return `${Math.max(1, Math.round(diff))}分前`;
  if (diff < 1440) return `${Math.round(diff / 60)}時間前`;
  if (diff < 1440 * 7) return `${Math.round(diff / 1440)}日前`;
  return new Date(v).toLocaleDateString("ja-JP", { timeZone: TZ, month: "short", day: "numeric" });
}

const IMPORTANCE: Record<number, { label: string; bar: string; text: string }> = {
  3: { label: "重要", bar: "bg-red-600", text: "text-red-700 bg-red-50 ring-red-200" },
  2: { label: "注目", bar: "bg-amber-500", text: "text-amber-800 bg-amber-50 ring-amber-200" },
  1: { label: "参考", bar: "bg-slate-300", text: "text-slate-600 bg-slate-50 ring-slate-200" },
};

export function importanceBar(i: number | null) {
  return i ? IMPORTANCE[i]?.bar ?? "bg-slate-200" : "bg-slate-200";
}

export function ImportanceBadge({ value }: { value: number | null }) {
  if (!value) return <span className="badge text-slate-500 bg-white ring-line">重要度未判定</span>;
  const m = IMPORTANCE[value];
  return <span className={`badge ${m.text}`}>{m.label}</span>;
}

const VERIFY: Record<string, { label: string; cls: string; title: string }> = {
  official: { label: "公式発表", cls: "text-emerald-800 bg-emerald-50 ring-emerald-200", title: "企業の公式チャネルから取得した情報を含みます" },
  reported: { label: "複数報道", cls: "text-sky-800 bg-sky-50 ring-sky-200", title: "公式発表は未取得。複数のメディアが報じています" },
  unconfirmed: { label: "公式未確認", cls: "text-orange-800 bg-orange-50 ring-orange-200", title: "単一メディアの報道のみで、公式発表は確認できていません" },
};

export function VerifyBadge({ value }: { value: string }) {
  const m = VERIFY[value] ?? VERIFY.unconfirmed;
  return <span className={`badge ${m.cls}`} title={m.title}>{m.label}</span>;
}

export function DemoBadge() {
  return <span className="badge text-amber-900 bg-amber-100 ring-amber-300 font-bold">デモデータ</span>;
}

export function StoryCard({ s, compact = false }: { s: StoryRow; compact?: boolean }) {
  const title = s.title_ja || s.representative_title;
  return (
    <article className="relative flex gap-3 border-b border-line py-4 last:border-b-0">
      <span className={`mt-1 w-1 shrink-0 self-stretch rounded-full ${importanceBar(s.importance)}`} aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="mb-1.5 flex flex-wrap items-center gap-1.5 text-xs">
          {s.is_demo && <DemoBadge />}
          <ImportanceBadge value={s.importance} />
          <VerifyBadge value={s.verification} />
          {s.category && <span className="text-ink-soft">{s.category}</span>}
          <span className="text-ink-faint">· {fmtRelative(s.first_published_at)}</span>
        </div>
        <h3 className={`font-bold leading-snug text-ink ${compact ? "text-[15px]" : "text-base sm:text-[17px]"}`}>
          <Link href={`/news/${s.id}`} className="hover:text-accent after:absolute after:inset-0">{title}</Link>
        </h3>
        {!compact && s.summary_ja && <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-ink-soft">{s.summary_ja}</p>}
        {!compact && s.summary_status !== "done" && (
          <p className="mt-1.5 text-xs text-ink-faint">AI要約は未生成です（原文タイトルを表示中）</p>
        )}
        <div className="relative z-10 mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-faint">
          {s.companies.map((c) => (
            <Link key={c.slug} href={`/companies/${c.slug}`} className="font-medium text-ink-soft hover:text-accent">{c.name}</Link>
          ))}
          {s.article_count > 1 && <span>{s.article_count}件の記事を統合</span>}
        </div>
      </div>
    </article>
  );
}

export function SectionTitle({ children, href, more }: { children: React.ReactNode; href?: string; more?: string }) {
  return (
    <div className="mb-1 flex items-baseline justify-between border-b-2 border-ink pb-2">
      <h2 className="text-lg font-bold tracking-tight">{children}</h2>
      {href && <Link href={href} className="text-sm text-accent hover:underline">{more ?? "すべて見る"} →</Link>}
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="rounded-lg border border-dashed border-line bg-white p-6 text-sm text-ink-soft">{children}</div>;
}
