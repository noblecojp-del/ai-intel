import Link from "next/link";
import { q } from "@/lib/db";
import { listCompanies } from "@/lib/queries";
import { SUMMARY_MODEL } from "@/lib/ai";
import { fmtDateTime } from "@/components/ui";
import {
  actionAddSource, actionDeleteDemo, actionDeleteSource, actionIngest, actionSaveCompany, actionSeedDemo,
  actionSummarize, actionToggleSource,
} from "./actions";
import { SubmitButton } from "./submit-button";

export const dynamic = "force-dynamic";
export const maxDuration = 300;
export const metadata = { title: "管理画面", robots: { index: false } };

const TABS = [
  ["overview", "ジョブ・エラー"],
  ["sources", "情報源"],
  ["companies", "追跡企業"],
  ["stories", "要確認の要約"],
] as const;

type SP = Promise<Record<string, string | undefined>>;

export default async function AdminPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const tab = sp.tab ?? "overview";
  return (
    <div>
      <h1 className="text-xl font-bold">管理画面</h1>
      <nav className="mt-4 flex gap-1 overflow-x-auto border-b border-line text-sm">
        {TABS.map(([k, label]) => (
          <Link key={k} href={`/admin?tab=${k}`} className={`whitespace-nowrap px-3 py-2 ${tab === k ? "border-b-2 border-ink font-bold" : "text-ink-soft hover:text-ink"}`}>{label}</Link>
        ))}
      </nav>
      <div className="mt-6">
        {tab === "overview" && <Overview />}
        {tab === "sources" && <Sources />}
        {tab === "companies" && <Companies error={sp.error} saved={!!sp.saved} />}
        {tab === "stories" && <Stories />}
      </div>
    </div>
  );
}

async function Overview() {
  const runs = await q<any>("SELECT * FROM job_runs ORDER BY id DESC LIMIT 15");
  const errors = await q<any>("SELECT e.*, r.job FROM job_errors e JOIN job_runs r ON r.id=e.job_run_id ORDER BY e.id DESC LIMIT 30");
  const [{ demo, pending }] = await q<any>(
    "SELECT (SELECT count(*)::int FROM stories WHERE is_demo) AS demo, (SELECT count(*)::int FROM stories WHERE summary_status IN ('pending','failed') AND NOT is_demo) AS pending",
  );
  const env = [
    ["データベース", process.env.DATABASE_URL ? "PostgreSQL（DATABASE_URL）" : "組込みDB（PGlite・ローカル専用）", !!process.env.DATABASE_URL],
    ["Claude APIキー", process.env.ANTHROPIC_API_KEY ? `設定済み（要約モデル: ${SUMMARY_MODEL}）` : "未設定（要約は生成されません）", !!process.env.ANTHROPIC_API_KEY],
    ["定期実行トークン", process.env.CRON_SECRET ? "設定済み" : "未設定（定期実行は401で拒否されます）", !!process.env.CRON_SECRET],
  ] as const;

  return (
    <div className="space-y-8">
      <section className="grid gap-3 sm:grid-cols-3">
        {env.map(([k, v, ok]) => (
          <div key={k} className={`card p-4 ${ok ? "" : "border-orange-300 bg-orange-50"}`}>
            <div className="text-xs text-ink-faint">{k}</div>
            <div className="mt-1 text-sm font-medium">{v}</div>
          </div>
        ))}
      </section>

      <section className="flex flex-wrap items-center gap-3">
        <form action={actionIngest}><SubmitButton className="btn-primary" pending="収集中…（数分かかります）">今すぐ収集＋要約</SubmitButton></form>
        <form action={actionSummarize}><SubmitButton className="btn" pending="要約中…">未要約を要約（{pending}件）</SubmitButton></form>
        {demo > 0 ? (
          <form action={actionDeleteDemo}><SubmitButton className="btn text-red-700" pending="削除中…">デモデータを削除（{demo}件）</SubmitButton></form>
        ) : (
          <form action={actionSeedDemo}><SubmitButton className="btn" pending="投入中…">デモデータを投入</SubmitButton></form>
        )}
      </section>

      <section>
        <h2 className="mb-2 font-bold">ジョブ実行履歴</h2>
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[640px]">
            <thead><tr><th className="th">ID</th><th className="th">ジョブ</th><th className="th">起動</th><th className="th">状態</th><th className="th">開始</th><th className="th">結果</th></tr></thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id}>
                  <td className="td tabular-nums">{r.id}</td>
                  <td className="td">{r.job === "ingest" ? "収集" : "要約"}</td>
                  <td className="td">{r.trigger}</td>
                  <td className="td"><span className={`badge ${r.status === "success" ? "bg-emerald-50 text-emerald-800 ring-emerald-200" : r.status === "partial" ? "bg-amber-50 text-amber-800 ring-amber-200" : r.status === "running" ? "bg-sky-50 text-sky-800 ring-sky-200" : "bg-red-50 text-red-700 ring-red-200"}`}>{r.status}</span></td>
                  <td className="td whitespace-nowrap">{fmtDateTime(r.started_at)}</td>
                  <td className="td font-mono text-xs text-ink-soft">{r.stats ? JSON.stringify(r.stats) : "—"}</td>
                </tr>
              ))}
              {!runs.length && <tr><td className="td text-ink-faint" colSpan={6}>まだ実行されていません</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="mb-2 font-bold">エラーログ</h2>
        <div className="card divide-y divide-line">
          {errors.map((e) => (
            <div key={e.id} className="px-4 py-2.5 text-sm">
              <div className="text-xs text-ink-faint">{fmtDateTime(e.created_at)}・{e.job === "ingest" ? "収集" : "要約"}・{e.scope}</div>
              <div className="mt-0.5 break-all text-red-700">{e.message}</div>
            </div>
          ))}
          {!errors.length && <div className="px-4 py-3 text-sm text-ink-faint">エラーはありません</div>}
        </div>
      </section>
    </div>
  );
}

async function Sources() {
  const sources = await q<any>("SELECT s.*, c.name AS company FROM sources s LEFT JOIN companies c ON c.id=s.company_id ORDER BY s.id");
  const companies = await listCompanies(true);
  return (
    <div className="space-y-6">
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[760px]">
          <thead><tr><th className="th">名前</th><th className="th">種別</th><th className="th">企業</th><th className="th">最終取得</th><th className="th">状態</th><th className="th"></th></tr></thead>
          <tbody>
            {sources.map((s) => (
              <tr key={s.id} className={s.is_active ? "" : "opacity-50"}>
                <td className="td"><div className="font-medium">{s.name}</div><div className="break-all text-xs text-ink-faint">{s.feed_url}</div>{s.note && <div className="text-xs text-amber-700">{s.note}</div>}</td>
                <td className="td">{s.source_type === "official" ? "公式" : "報道"}</td>
                <td className="td">{s.company ?? "—"}</td>
                <td className="td whitespace-nowrap text-xs">{fmtDateTime(s.last_fetched_at)}</td>
                <td className="td text-xs">{s.last_status === "error" ? <span className="text-red-700" title={s.last_error}>エラー: {s.last_error?.slice(0, 60)}</span> : s.last_status ?? "未取得"}</td>
                <td className="td whitespace-nowrap">
                  <form action={actionToggleSource} className="inline"><input type="hidden" name="id" value={s.id} /><button className="btn text-xs">{s.is_active ? "停止" : "再開"}</button></form>
                  <form action={actionDeleteSource} className="ml-1 inline"><input type="hidden" name="id" value={s.id} /><button className="btn text-xs text-red-700">削除</button></form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <form action={actionAddSource} className="card grid gap-3 p-4 sm:grid-cols-2">
        <h2 className="font-bold sm:col-span-2">情報源を追加（RSS / Atom）</h2>
        <div><label className="label">名前</label><input name="name" className="input" required /></div>
        <div><label className="label">フィードURL</label><input name="feed_url" type="url" className="input" required /></div>
        <div><label className="label">サイトURL（任意）</label><input name="site_url" type="url" className="input" /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label">種別</label><select name="source_type" className="input"><option value="media">報道・二次情報</option><option value="official">企業の公式発表</option></select></div>
          <div><label className="label">企業</label><select name="company_id" className="input"><option value="">なし</option>{companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
        </div>
        <p className="text-xs text-ink-faint sm:col-span-2">利用規約でRSSの利用・再配布が許可されている情報源のみ登録してください。「公式」は企業自身が運営するチャネルに限ります。</p>
        <div className="sm:col-span-2"><button className="btn-primary">追加</button></div>
      </form>
    </div>
  );
}

async function Companies({ error, saved }: { error?: string; saved: boolean }) {
  const companies = await listCompanies(true);
  const tracked = companies.filter((c) => c.is_tracked).length;
  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-soft">追跡中 <strong>{tracked}</strong> / 20社。キーワードは記事タイトル・抜粋との一致で企業を紐付けるのに使います（カンマ区切り）。</p>
      {error === "max" && <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">追跡できるのは最大20社です。他の企業の追跡を外してから追加してください。</p>}
      {saved && <p className="rounded bg-emerald-50 px-3 py-2 text-sm text-emerald-800">保存しました。</p>}
      {[...companies, null].map((c) => (
        <details key={c?.id ?? "new"} className="card" open={!c}>
          <summary className="cursor-pointer px-4 py-3 font-medium">
            {c ? <>{c.name}<span className="ml-2 text-xs text-ink-faint">{c.is_tracked ? "追跡中" : "追跡停止"}・{c.is_listed ? "上場" : "非上場"}</span></> : "＋ 企業を追加"}
          </summary>
          <form action={actionSaveCompany} className="grid gap-3 border-t border-line p-4 sm:grid-cols-2">
            <input type="hidden" name="id" value={c?.id ?? ""} />
            {!c && <div><label className="label">スラッグ（URL用・英小文字）</label><input name="slug" className="input" required placeholder="例: cohere" /></div>}
            <div><label className="label">名前</label><input name="name" defaultValue={c?.name} className="input" required /></div>
            <div><label className="label">公式サイト</label><input name="website" defaultValue={c?.website ?? ""} className="input" /></div>
            <div className="sm:col-span-2"><label className="label">説明</label><input name="description" defaultValue={c?.description ?? ""} className="input" /></div>
            <div className="sm:col-span-2"><label className="label">キーワード</label><input name="keywords" defaultValue={c?.keywords.join(", ")} className="input" /></div>
            <div><label className="label">ティッカー（上場時）</label><input name="ticker" defaultValue={c?.ticker ?? ""} className="input" /></div>
            <div><label className="label">投資家向けページURL（上場時）</label><input name="ir_url" defaultValue={c?.ir_url ?? ""} className="input" /></div>
            <div><label className="label">表示順</label><input name="sort_order" type="number" defaultValue={c?.sort_order ?? 100} className="input" /></div>
            <div className="flex items-end gap-5 pb-2 text-sm">
              <label className="flex items-center gap-2"><input type="checkbox" name="is_tracked" defaultChecked={c?.is_tracked ?? true} />追跡する</label>
              <label className="flex items-center gap-2"><input type="checkbox" name="is_listed" defaultChecked={c?.is_listed ?? false} />上場企業</label>
            </div>
            <div className="sm:col-span-2"><button className="btn-primary">保存</button></div>
          </form>
        </details>
      ))}
    </div>
  );
}

async function Stories() {
  const rows = await q<any>(
    `SELECT id, coalesce(title_ja, representative_title) AS title, summary_status, consistency, consistency_note, manually_edited, first_published_at
       FROM stories WHERE NOT is_demo AND (consistency='warn' OR summary_status='failed')
      ORDER BY id DESC LIMIT 50`,
  );
  const recent = await q<any>(
    `SELECT id, coalesce(title_ja, representative_title) AS title, summary_status, consistency, manually_edited
       FROM stories ORDER BY id DESC LIMIT 30`,
  );
  const Row = ({ r }: { r: any }) => (
    <li className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
      <div className="min-w-0">
        <Link href={`/admin/stories/${r.id}`} className="font-medium hover:text-accent">{r.title}</Link>
        <div className="text-xs text-ink-faint">#{r.id}・要約 {r.summary_status}{r.consistency === "warn" && <span className="text-orange-700">・{r.consistency_note}</span>}{r.manually_edited && "・手動修正済み"}</div>
      </div>
      <Link href={`/admin/stories/${r.id}`} className="btn shrink-0 text-xs">編集</Link>
    </li>
  );
  return (
    <div className="space-y-8">
      <section>
        <h2 className="mb-2 font-bold">要確認（整合性警告・要約失敗）</h2>
        <ul className="card divide-y divide-line">{rows.map((r) => <Row key={r.id} r={r} />)}{!rows.length && <li className="px-4 py-3 text-sm text-ink-faint">要確認の項目はありません</li>}</ul>
      </section>
      <section>
        <h2 className="mb-2 font-bold">最近のストーリー</h2>
        <ul className="card divide-y divide-line">{recent.map((r) => <Row key={r.id} r={r} />)}</ul>
      </section>
    </div>
  );
}
