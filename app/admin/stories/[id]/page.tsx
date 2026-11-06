import Link from "next/link";
import { notFound } from "next/navigation";
import { getStory } from "@/lib/queries";
import { CATEGORIES } from "@/lib/seed-data";
import { fmtDateTime } from "@/components/ui";
import { actionEditStory, actionRegenerate } from "../../actions";
import { SubmitButton } from "../../submit-button";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

type P = Promise<{ id: string }>;
type SP = Promise<Record<string, string | undefined>>;

export default async function EditStory({ params, searchParams }: { params: P; searchParams: SP }) {
  const id = Number((await params).id);
  const sp = await searchParams;
  const d = await getStory(id);
  if (!d) notFound();
  const s = d.story;
  const points: string[] = Array.isArray(s.key_points) ? s.key_points : [];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link href="/admin?tab=stories" className="text-sm text-accent">← 管理画面に戻る</Link>
      <h1 className="text-xl font-bold">要約の確認・修正 #{id}</h1>
      {sp.saved && <p className="rounded bg-emerald-50 px-3 py-2 text-sm text-emerald-800">保存しました（新しいバージョンとして記録）。</p>}
      {sp.regenerated && <p className="rounded bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{sp.regenerated} で再生成しました。</p>}
      {sp.error === "nokey" && <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">ANTHROPIC_API_KEY が未設定のため再生成できません。</p>}
      {s.consistency === "warn" && <p className="rounded bg-orange-50 px-3 py-2 text-sm text-orange-800">整合性チェック: {s.consistency_note}</p>}

      <section className="card p-4">
        <h2 className="mb-2 text-sm font-bold text-ink-soft">元記事（要約の根拠）</h2>
        <ul className="space-y-3 text-sm">
          {d.articles.map((a: any) => (
            <li key={a.id}>
              <a href={a.url} target="_blank" rel="noopener noreferrer" className="font-medium text-accent hover:underline">{a.title} ↗</a>
              <div className="text-xs text-ink-faint">{a.source_name ?? "デモ"}・{a.source_type === "official" ? "公式" : "報道"}・{fmtDateTime(a.published_at)}</div>
              {a.excerpt && <p className="mt-1 text-ink-soft">{a.excerpt}</p>}
            </li>
          ))}
        </ul>
      </section>

      <form action={actionEditStory} className="card space-y-4 p-4">
        <input type="hidden" name="id" value={id} />
        <div><label className="label">日本語見出し</label><input name="title_ja" defaultValue={s.title_ja ?? s.representative_title} className="input" required /></div>
        <div><label className="label">要約</label><textarea name="summary_ja" defaultValue={s.summary_ja ?? ""} rows={5} className="input" required /></div>
        <div><label className="label">要点（1行に1つ）</label><textarea name="key_points" defaultValue={points.join("\n")} rows={4} className="input" /></div>
        <div><label className="label">なぜ重要か（分析）</label><textarea name="why_it_matters" defaultValue={s.why_it_matters ?? ""} rows={3} className="input" /></div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div><label className="label">ジャンル</label><select name="category" defaultValue={s.category ?? "その他"} className="input">{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></div>
          <div><label className="label">重要度</label><select name="importance" defaultValue={String(s.importance ?? 1)} className="input"><option value="3">重要</option><option value="2">注目</option><option value="1">参考</option></select></div>
          <div><label className="label">確認状況</label><select name="verification" defaultValue={s.verification} className="input"><option value="official">公式発表</option><option value="reported">複数報道</option><option value="unconfirmed">公式未確認</option></select></div>
        </div>
        <div><label className="label">重要度の根拠</label><input name="importance_reason" defaultValue={s.importance_reason ?? ""} className="input" /></div>
        <div className="flex flex-wrap gap-3">
          <SubmitButton className="btn-primary" pending="保存中…">修正を保存</SubmitButton>
        </div>
      </form>

      <form action={actionRegenerate} className="flex items-center gap-3">
        <input type="hidden" name="id" value={id} />
        <SubmitButton className="btn" pending="再生成中…">AIで再生成</SubmitButton>
        <span className="text-xs text-ink-faint">現在 v{s.summary_version}。再生成すると手動修正は解除されます（履歴は残ります）。</span>
      </form>

      <section>
        <h2 className="mb-2 text-sm font-bold">バージョン履歴</h2>
        <ul className="card divide-y divide-line text-sm">
          {d.versions.map((v: any) => <li key={v.version} className="px-4 py-2">v{v.version}・{v.author === "admin" ? "編集者" : v.model}・{fmtDateTime(v.created_at)}</li>)}
          {!d.versions.length && <li className="px-4 py-2 text-ink-faint">履歴なし</li>}
        </ul>
      </section>
    </div>
  );
}
