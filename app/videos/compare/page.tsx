import Link from "next/link";
import { videosByIds } from "@/lib/youtube";
import { Empty, fmtDateTime } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "動画の比較" };

type SP = Promise<Record<string, string | string[] | undefined>>;

export default async function CompareVideos({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const ids = [sp.ids].flat().filter(Boolean).map(Number).filter(Number.isInteger).slice(0, 4);
  const videos = await videosByIds(ids);
  return (
    <div>
      <Link href="/videos" className="text-sm text-accent">← 動画ライブラリ</Link>
      <h1 className="mt-2 border-b-2 border-ink pb-2 text-xl font-bold">動画の比較<span className="ml-2 text-sm font-normal text-ink-faint">最大4本</span></h1>
      {videos.length < 2 ? (
        <div className="mt-4"><Empty>比較するには、動画ライブラリで2本以上にチェックを入れて「選んだ動画を比較」を押してください。</Empty></div>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-lg border border-line bg-white">
          <table className="w-full min-w-[720px] table-fixed text-sm">
            <tbody>
              <tr>
                <th className="th w-28">動画</th>
                {videos.map((v: any) => (
                  <td key={v.id} className="td">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={v.thumbnail_url} alt="" className="aspect-video w-full rounded object-cover" />
                    <Link href={`/videos/${v.id}`} className="mt-1 block font-bold leading-snug hover:text-accent">{v.title_ja || v.title}</Link>
                  </td>
                ))}
              </tr>
              {[
                ["チャンネル", (v: any) => v.channel_name],
                ["公開日", (v: any) => fmtDateTime(v.published_at)],
                ["テーマ", (v: any) => (v.themes ?? []).join("、") || "—"],
                ["要約", (v: any) => v.summary_ja ?? "—"],
                ["主な内容", (v: any) => (Array.isArray(v.key_points) && v.key_points.length ? <ul className="space-y-0.5">{v.key_points.map((p: string, i: number) => <li key={i}>・{p}</li>)}</ul> : "—")],
              ].map(([label, f]: any) => (
                <tr key={label}><th className="th align-top">{label}</th>{videos.map((v: any) => <td key={v.id} className="td text-ink-soft">{f(v)}</td>)}</tr>
              ))}
            </tbody>
          </table>
          <p className="px-3 py-2 text-[11px] text-ink-faint">内容はタイトルと概要欄に基づくAI要約で、動画本編（字幕・音声）は使っていません。</p>
        </div>
      )}
    </div>
  );
}
