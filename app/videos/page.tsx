import Link from "next/link";
import { listVideos, VIDEO_THEMES } from "@/lib/youtube";
import { listCompanies } from "@/lib/queries";
import { Empty, fmtRelative } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "動画ライブラリ" };

type SP = Promise<Record<string, string | undefined>>;

export default async function VideosPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const [videos, companies] = await Promise.all([listVideos({ company: sp.company, theme: sp.theme, person: sp.person }), listCompanies()]);
  const chip = (label: string, params: Record<string, string | undefined>, active: boolean) => (
    <Link key={label} href={`/videos?${new URLSearchParams(Object.entries(params).filter(([, v]) => v) as [string, string][])}`}
      className={`badge px-2 py-1 text-xs ${active ? "bg-ink text-white ring-ink" : "bg-white text-ink-soft ring-line hover:ring-ink/40"}`}>{label}</Link>
  );
  return (
    <div>
      <h1 className="border-b-2 border-ink pb-2 text-xl font-bold sm:text-2xl">動画ライブラリ</h1>
      <p className="mt-2 text-xs leading-relaxed text-ink-faint">
        各社の公式YouTubeチャンネルと主要な対談番組の新着動画です。要約はタイトルと概要欄だけをもとにAIが作成したもので、動画の中身（字幕・音声）は使っていません。正確な内容は動画本編でご確認ください。
      </p>
      <div className="mt-4 space-y-2">
        <div className="flex flex-wrap gap-1.5">
          {chip("すべての企業", { theme: sp.theme }, !sp.company)}
          {companies.map((c) => chip(c.name, { company: c.slug, theme: sp.theme }, sp.company === c.slug))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {chip("すべてのテーマ", { company: sp.company }, !sp.theme)}
          {VIDEO_THEMES.map((t) => chip(t, { company: sp.company, theme: t }, sp.theme === t))}
        </div>
      </div>

      {videos.length ? (
        <form action="/videos/compare" method="get" className="mt-5">
          <div className="mb-3 flex items-center justify-between text-sm">
            <span className="text-ink-faint">{videos.length}件</span>
            <button className="btn text-xs" type="submit">選んだ動画を比較</button>
          </div>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {videos.map((v: any) => (
              <li key={v.id} className="card relative overflow-hidden">
                <label className="absolute right-2 top-2 z-10 flex items-center gap-1 rounded bg-white/90 px-1.5 py-0.5 text-[11px] shadow">
                  <input type="checkbox" name="ids" value={v.id} />比較
                </label>
                <Link href={`/videos/${v.id}`} className="block">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={v.thumbnail_url} alt="" loading="lazy" className="aspect-video w-full bg-slate-100 object-cover" />
                  <div className="p-3">
                    <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-ink-faint">
                      <span className="font-medium text-ink-soft">{v.channel_name}</span>
                      {v.channel_kind === "interview" && <span className="badge bg-slate-50 text-slate-700 ring-slate-200">対談番組</span>}
                      <span>· {fmtRelative(v.published_at)}</span>
                    </div>
                    <h2 className="mt-1 line-clamp-2 font-bold leading-snug hover:text-accent">{v.title_ja || v.title}</h2>
                    {v.summary_ja && <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-ink-soft">{v.summary_ja}</p>}
                    {v.themes?.length > 0 && <div className="mt-2 flex flex-wrap gap-1">{v.themes.map((t: string) => <span key={t} className="badge bg-slate-50 text-slate-700 ring-slate-200">{t}</span>)}</div>}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </form>
      ) : <div className="mt-5"><Empty>条件に合う動画はまだありません。新着動画は毎朝5時台に取得します。</Empty></div>}
    </div>
  );
}
