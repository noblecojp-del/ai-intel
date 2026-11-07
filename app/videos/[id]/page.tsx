import Link from "next/link";
import { notFound } from "next/navigation";
import { getVideo } from "@/lib/youtube";
import { fmtDateTime, fmtRelative } from "@/components/ui";

export const dynamic = "force-dynamic";
type P = Promise<{ id: string }>;

export async function generateMetadata({ params }: { params: P }) {
  const d = await getVideo(Number((await params).id));
  return { title: d ? d.video.title_ja || d.video.title : "動画" };
}

export default async function VideoPage({ params }: { params: P }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const d = await getVideo(id);
  if (!d) notFound();
  const { video: v, related, sameTheme, people } = d;
  const points: string[] = Array.isArray(v.key_points) ? v.key_points : [];
  return (
    <div className="grid gap-10 lg:grid-cols-3">
      <article className="lg:col-span-2">
        <Link href="/videos" className="text-sm text-accent">← 動画ライブラリ</Link>
        <div className="mt-3 aspect-video w-full overflow-hidden rounded-lg bg-black">
          <iframe src={`https://www.youtube-nocookie.com/embed/${v.video_id}`} title={v.title} className="h-full w-full" loading="lazy"
            allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-ink-faint">
          <span className="font-medium text-ink-soft">{v.channel_name}</span>
          {v.company_slug && <Link href={`/companies/${v.company_slug}`} className="text-accent hover:underline">{v.company_name}</Link>}
          <span>公開 {fmtDateTime(v.published_at)}</span><span>取得 {fmtDateTime(v.fetched_at)}</span>
        </div>
        <h1 className="mt-2 text-xl font-bold leading-snug sm:text-2xl">{v.title_ja || v.title}</h1>
        {v.title_ja && <p className="mt-1 text-sm text-ink-faint">原題: {v.title}</p>}

        <section className="mt-5 rounded-lg border border-line bg-white p-5">
          <h2 className="flex flex-wrap items-center gap-2 text-sm font-bold text-ink-soft">要約<span className="badge bg-slate-50 text-slate-700 ring-slate-300">タイトルと概要欄に基づくAI要約・字幕は不使用</span></h2>
          {v.summary_ja ? (
            <>
              <p className="mt-2 leading-[1.9]">{v.summary_ja}</p>
              {points.length > 0 && <ul className="mt-3 space-y-1 border-t border-line pt-3 text-[15px]">{points.map((p, i) => <li key={i} className="flex gap-2"><span className="text-ink-faint">•</span><span>{p}</span></li>)}</ul>}
              <p className="mt-3 text-xs text-ink-faint">{v.summary_model}・{fmtDateTime(v.summarized_at)}生成</p>
            </>
          ) : <p className="mt-2 text-sm text-ink-soft">要約はまだ生成されていません。</p>}
        </section>

        {people.length > 0 && (
          <p className="mt-4 text-sm">登場人物（概要欄・タイトルに記載）：{people.map((p: any) => <Link key={p.slug} href={`/people/${p.slug}`} className="ml-2 text-accent hover:underline">{p.name}</Link>)}</p>
        )}
        <p className="mt-4 text-sm"><a href={v.url} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">YouTubeで見る ↗</a></p>
      </article>

      <aside className="space-y-8">
        <section>
          <h2 className="border-b-2 border-ink pb-2 font-bold">関連ニュース</h2>
          <ul className="divide-y divide-line text-sm">
            {related.map((s: any) => <li key={s.id}><Link href={`/news/${s.id}`} className="block py-2.5 hover:text-accent">{s.title}<span className="ml-1 text-xs text-ink-faint">{fmtRelative(s.first_published_at)}</span></Link></li>)}
            {!related.length && <li className="py-3 text-ink-faint">前後7日に関連するニュースは見つかりませんでした</li>}
          </ul>
          <p className="mt-1 text-[11px] text-ink-faint">同じ企業・前後7日以内・見出しの語の重なりで自動判定しています。</p>
        </section>
        {sameTheme.length > 0 && (
          <section>
            <h2 className="border-b-2 border-ink pb-2 font-bold">同じテーマの動画</h2>
            <ul className="divide-y divide-line text-sm">
              {sameTheme.map((o: any) => <li key={o.id}><Link href={`/videos/${o.id}`} className="block py-2.5 hover:text-accent">{o.title_ja || o.title}<span className="ml-1 text-xs text-ink-faint">{o.channel_name}</span></Link></li>)}
            </ul>
            <Link href={`/videos/compare?${[v.id, ...sameTheme.slice(0, 3).map((o: any) => o.id)].map((i) => `ids=${i}`).join("&")}`} className="mt-2 inline-block text-xs text-accent hover:underline">これらの動画を比較する →</Link>
          </section>
        )}
      </aside>
    </div>
  );
}
