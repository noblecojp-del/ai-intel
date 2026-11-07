import Link from "next/link";
import { listPeople } from "@/lib/people";
import { fmtRelative } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "人物・発言分析" };

export default async function PeoplePage() {
  const people = await listPeople();
  return (
    <div>
      <h1 className="border-b-2 border-ink pb-2 text-xl font-bold sm:text-2xl">人物・発言分析</h1>
      <p className="mt-2 text-xs leading-relaxed text-ink-faint">
        収集したニュースの記事から、本人の発言をAIで抜き出しています。「直接引用」は記事の原文に本人の言葉として載っていることを照合済みのもの、
        「報道」は記者による要約・言い換えで、本人の正確な言葉とは限りません。
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {people.map((p: any) => (
          <Link key={p.slug} href={`/people/${p.slug}`} className="card group p-4 hover:border-ink/30">
            <div className="font-bold group-hover:text-accent">{p.name}<span className="ml-2 text-xs font-normal text-ink-faint">{p.name_ja}</span></div>
            <div className="mt-0.5 text-xs text-ink-soft">{p.role}</div>
            <div className="mt-3 text-sm">
              {p.latest ? (
                <p className="line-clamp-2 text-ink-soft">
                  <span className={`badge mr-1.5 align-middle ${p.latest.kind === "direct_quote" ? "bg-emerald-50 text-emerald-800 ring-emerald-200" : "bg-white text-ink-soft ring-line"}`}>{p.latest.kind === "direct_quote" ? "直接引用" : "報道"}</span>
                  {p.latest.summary_ja}
                </p>
              ) : <p className="text-ink-faint">まだ発言は収集されていません</p>}
            </div>
            <div className="mt-3 flex justify-between text-xs text-ink-faint">
              <span>30日間 <strong className="tabular-nums text-ink">{p.n30}</strong>件・直接引用 {p.n_quotes}件</span>
              {p.latest?.said_at && <span>{fmtRelative(p.latest.said_at)}</span>}
            </div>
          </Link>
        ))}
      </div>
      <p className="mt-6 text-xs text-ink-faint">役職は確認日時点の情報です。追跡する人物は管理画面で変更できます。</p>
    </div>
  );
}
