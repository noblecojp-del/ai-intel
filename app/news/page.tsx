import Link from "next/link";
import { listCompanies, listStories } from "@/lib/queries";
import { CATEGORIES } from "@/lib/seed-data";
import { Empty, StoryCard } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "ニュース一覧" };

const PER = 30;

type SP = Promise<Record<string, string | undefined>>;

export default async function NewsPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const filter = {
    q: sp.q?.trim() || undefined,
    category: sp.category || undefined,
    company: sp.company || undefined,
    verification: sp.verification || undefined,
    importance: sp.importance ? Number(sp.importance) : undefined,
  };
  const [stories, companies] = await Promise.all([
    listStories({ ...filter, limit: PER + 1, offset: (page - 1) * PER }),
    listCompanies(),
  ]);
  const hasNext = stories.length > PER;
  const qs = (p: number) => {
    const u = new URLSearchParams(Object.entries({ ...sp, page: String(p) }).filter(([, v]) => v) as [string, string][]);
    return `/news?${u}`;
  };
  const active = Object.values(filter).some(Boolean);

  return (
    <div className="grid gap-8 lg:grid-cols-[260px_1fr]">
      <aside>
        <form className="card space-y-4 p-4 lg:sticky lg:top-20" method="get">
          <div>
            <label className="label" htmlFor="q">キーワード</label>
            <input id="q" name="q" defaultValue={filter.q} className="input" placeholder="例: Gemini, 半導体" />
          </div>
          <div>
            <label className="label" htmlFor="company">企業</label>
            <select id="company" name="company" defaultValue={filter.company ?? ""} className="input">
              <option value="">すべて</option>
              {companies.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="category">ジャンル</label>
            <select id="category" name="category" defaultValue={filter.category ?? ""} className="input">
              <option value="">すべて</option>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="importance">重要度</label>
              <select id="importance" name="importance" defaultValue={sp.importance ?? ""} className="input">
                <option value="">すべて</option>
                <option value="3">重要のみ</option>
                <option value="2">注目以上</option>
              </select>
            </div>
            <div>
              <label className="label" htmlFor="verification">確認状況</label>
              <select id="verification" name="verification" defaultValue={filter.verification ?? ""} className="input">
                <option value="">すべて</option>
                <option value="official">公式発表</option>
                <option value="reported">複数報道</option>
                <option value="unconfirmed">公式未確認</option>
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <button className="btn-primary flex-1" type="submit">絞り込む</button>
            {active && <Link href="/news" className="btn">解除</Link>}
          </div>
        </form>
      </aside>

      <section>
        <h1 className="border-b-2 border-ink pb-2 text-xl font-bold">ニュース一覧{page > 1 && <span className="ml-2 text-sm font-normal text-ink-faint">{page}ページ目</span>}</h1>
        {stories.length ? stories.slice(0, PER).map((s) => <StoryCard key={s.id} s={s} />) : (
          <div className="mt-4"><Empty>条件に合うニュースはありません。</Empty></div>
        )}
        <div className="mt-6 flex justify-between">
          {page > 1 ? <Link className="btn" href={qs(page - 1)}>← 前へ</Link> : <span />}
          {hasNext && <Link className="btn" href={qs(page + 1)}>次へ →</Link>}
        </div>
      </section>
    </div>
  );
}
