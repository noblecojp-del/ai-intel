import Link from "next/link";
import { q } from "@/lib/db";
import { listCompanies } from "@/lib/queries";
import { SUMMARY_MODEL } from "@/lib/ai";
import { fmtDateTime } from "@/components/ui";
import { usageSummary } from "@/lib/brief-queries";
import { jstDate } from "@/lib/brief-logic";
import { ANALYSIS_MODEL } from "@/lib/brief";
import { logout } from "./login/actions";
import { getMinScore } from "@/lib/settings";
import { MinScoreForm } from "./min-score-form";
import { listModels } from "@/lib/compare";
import {
  actionBrief, actionSaveMinScore, actionLandscape, actionTagging, actionAddModel, actionAddFact, actionDeleteFact, actionToggleModel, actionAddSource, actionDeleteDemo, actionDeleteSource, actionIngest, actionSaveCompany, actionSeedDemo,
  actionSummarize, actionToggleSource,
} from "./actions";
import { SubmitButton } from "./submit-button";

export const dynamic = "force-dynamic";
export const maxDuration = 300;
export const metadata = { title: "管理画面", robots: { index: false } };

const TABS = [
  ["overview", "ジョブ・エラー"],
  ["brief", "TOP5設定"],
  ["models", "モデル比較"],
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
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">管理画面</h1>
        <form action={logout}><button className="btn text-xs">ログアウト</button></form>
      </div>
      <nav className="mt-4 flex gap-1 overflow-x-auto border-b border-line text-sm">
        {TABS.map(([k, label]) => (
          <Link key={k} href={`/admin?tab=${k}`} className={`whitespace-nowrap px-3 py-2 ${tab === k ? "border-b-2 border-ink font-bold" : "text-ink-soft hover:text-ink"}`}>{label}</Link>
        ))}
      </nav>
      <div className="mt-6">
        {tab === "overview" && <Overview briefResult={sp.brief} landscapeResult={sp.landscape} taggingResult={sp.tagging} />}
        {tab === "brief" && <BriefSettings sp={sp} />}
        {tab === "models" && <ModelsAdmin />}
        {tab === "sources" && <Sources />}
        {tab === "companies" && <Companies error={sp.error} saved={!!sp.saved} />}
        {tab === "stories" && <Stories />}
      </div>
    </div>
  );
}

const BRIEF_STATUS: Record<string, string> = { published: "公開済み", empty: "該当なし（基準点未満）", failed: "失敗・未更新", running: "生成中", skipped: "公開済みのためスキップ" };
const usd = (n: number) => `$${n.toFixed(n < 1 ? 3 : 2)}`;

async function Overview({ briefResult, landscapeResult, taggingResult }: { briefResult?: string; landscapeResult?: string; taggingResult?: string }) {
  const today = jstDate();
  const [lastIngest] = await q<any>("SELECT * FROM job_runs WHERE job='ingest' ORDER BY id DESC LIMIT 1");
  const [lastSumm] = await q<any>("SELECT * FROM job_runs WHERE job='summarize' ORDER BY id DESC LIMIT 1");
  const [todayBrief] = await q<any>(
    "SELECT b.*, (SELECT count(*)::int FROM brief_items bi WHERE bi.brief_id=b.id) AS n FROM daily_briefs b WHERE brief_date=$1 AND NOT is_demo",
    [today],
  );
  const [{ untagged }] = await q<any>("SELECT count(*)::int AS untagged FROM stories WHERE NOT is_demo AND tagged_at IS NULL");
  const [{ errors24 }] = await q<any>("SELECT count(*)::int AS errors24 FROM job_errors WHERE created_at > now() - interval '24 hours'");
  const usage = await usageSummary();
  const ingestStale = !lastIngest || Date.now() - new Date(lastIngest.started_at).getTime() > 26 * 36e5;
  const metrics: [string, string, string | null, boolean][] = [
    ["最終更新（収集）", lastIngest ? fmtDateTime(lastIngest.finished_at ?? lastIngest.started_at) : "未実行", ingestStale ? "26時間以上更新されていません" : null, ingestStale],
    ["最新の取得件数", lastIngest?.stats ? `取得 ${lastIngest.stats.fetched}・新規 ${lastIngest.stats.added}・統合 ${lastIngest.stats.merged}` : "—", lastIngest?.stats ? `情報源 成功${lastIngest.stats.ok} / 失敗${lastIngest.stats.failed}` : null, !!lastIngest?.stats?.failed],
    ["要約の成功件数（最新）", lastSumm?.stats ? `${lastSumm.stats.done} / ${lastSumm.stats.target}件` : "—", lastSumm?.stats?.failed ? `失敗 ${lastSumm.stats.failed}件` : null, !!lastSumm?.stats?.failed],
    ["エラー件数（24時間）", `${errors24}件`, null, errors24 > 0],
    ["本日のBEST5", todayBrief ? `${BRIEF_STATUS[todayBrief.status] ?? todayBrief.status}・${todayBrief.n}件` : "未生成", todayBrief ? `${fmtDateTime(todayBrief.published_at ?? todayBrief.generated_at)}${todayBrief.note ? `・${todayBrief.note}` : ""}` : "毎朝7〜8時台に自動生成", !todayBrief || todayBrief.status === "failed"],
    ["API推定コスト（今月）", usd(usage.month_usd), `本日 ${usd(usage.today_usd)}・月額試算 ${usd(usage.projected_month_usd)}`, false],
  ];

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
      {taggingResult && (() => { const [d, c, t] = taggingResult.split("-"); return <p className="rounded bg-sky-50 px-3 py-2 text-sm text-sky-900">企業の紐付け：{t}件中 {d}件を判定し、{c}件の紐付けを修正しました。</p>; })()}
      {landscapeResult && <p className="rounded bg-sky-50 px-3 py-2 text-sm text-sky-900">競争状況分析：{({ published: "生成しました", skipped: "ニュースが少ないため生成しませんでした", failed: "失敗しました（エラーログを確認）" } as Record<string, string>)[landscapeResult] ?? landscapeResult}</p>}
      {briefResult && <p className="rounded bg-sky-50 px-3 py-2 text-sm text-sky-900">BEST5の生成結果：{BRIEF_STATUS[briefResult] ?? briefResult}</p>}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {metrics.map(([k, v, sub, warn]) => (
          <div key={k} className={`card p-4 ${warn ? "border-orange-300 bg-orange-50" : ""}`}>
            <div className="text-xs text-ink-faint">{k}</div>
            <div className="mt-1 font-bold tabular-nums">{v}</div>
            {sub && <div className="mt-0.5 text-xs text-ink-soft">{sub}</div>}
          </div>
        ))}
      </section>

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
        <form action={actionBrief}><SubmitButton className="btn-primary" pending="BEST5を生成中…（1〜3分）">BEST5を今すぐ生成</SubmitButton></form>
        <form action={actionTagging}><SubmitButton className="btn" pending="判定中…">企業の紐付けをAIで判定（未判定 {untagged}件）</SubmitButton></form>
        <form action={actionLandscape}><SubmitButton className="btn" pending="分析中…（1〜2分）">競争状況分析を生成</SubmitButton></form>
        <form action={actionSummarize}><SubmitButton className="btn" pending="要約中…">未要約を要約（{pending}件）</SubmitButton></form>
        {demo > 0 ? (
          <form action={actionDeleteDemo}><SubmitButton className="btn text-red-700" pending="削除中…">デモデータを削除（{demo}件）</SubmitButton></form>
        ) : (
          <form action={actionSeedDemo}><SubmitButton className="btn" pending="投入中…">デモデータを投入</SubmitButton></form>
        )}
      </section>

      <section>
        <h2 className="mb-2 font-bold">API利用状況（今月）</h2>
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[560px]">
            <thead><tr><th className="th">処理</th><th className="th">モデル</th><th className="th text-right">回数</th><th className="th text-right">入力トークン</th><th className="th text-right">出力トークン</th><th className="th text-right">推定コスト</th></tr></thead>
            <tbody>
              {usage.byJob.map((u: any) => (
                <tr key={u.job + u.model}>
                  <td className="td">{({ summarize: "要約", "brief-score": "BEST5 採点", "brief-analysis": "BEST5 深掘り分析", landscape: "競争状況分析", tagging: "企業の紐付け" } as Record<string, string>)[u.job] ?? u.job}</td>
                  <td className="td text-xs">{u.model}</td>
                  <td className="td text-right tabular-nums">{u.calls}</td>
                  <td className="td text-right tabular-nums">{Number(u.input_tokens).toLocaleString()}</td>
                  <td className="td text-right tabular-nums">{Number(u.output_tokens).toLocaleString()}</td>
                  <td className="td text-right tabular-nums">{usd(u.cost_usd)}</td>
                </tr>
              ))}
              {!usage.byJob.length && <tr><td className="td text-ink-faint" colSpan={6}>今月の利用はまだありません</td></tr>}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-ink-faint">推定コストは公開単価（要約 {SUMMARY_MODEL}、分析 {ANALYSIS_MODEL}）からの概算です。正確な請求額は console.anthropic.com の Usage で確認してください。</p>
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
                  <td className="td">{({ ingest: "収集", summarize: "要約", brief: "BEST5", landscape: "競争状況分析", tagging: "企業の紐付け" } as Record<string, string>)[r.job] ?? r.job}</td>
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
              <div className="text-xs text-ink-faint">{fmtDateTime(e.created_at)}・{({ ingest: "収集", summarize: "要約", brief: "BEST5", landscape: "競争状況分析", tagging: "企業の紐付け" } as Record<string, string>)[e.job] ?? e.job}・{e.scope}</div>
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

async function BriefSettings({ sp }: { sp: Record<string, string | undefined> }) {
  const current = await getMinScore();
  const [b] = await q<any>("SELECT status, score_summary FROM daily_briefs WHERE brief_date=$1 AND NOT is_demo", [jstDate()]);
  const items = (b?.score_summary?.items ?? []) as { story_id: number; title: string; total: number; reason: string; scores?: unknown }[];
  return (
    <div className="space-y-4">
      {sp.saved && (
        <p className="rounded bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          基準点を保存しました。{sp.brief && `本日分を作り直しました（${BRIEF_STATUS[sp.brief] ?? sp.brief}・${sp.items ?? 0}件）。`}
        </p>
      )}
      <MinScoreForm current={current} items={items} action={actionSaveMinScore} hasScores={items.length > 0 && items.every((i) => i.scores)} />
    </div>
  );
}

const FIELD_LABEL: Record<string, string> = {
  price_in: "入力価格", price_out: "出力価格", context: "コンテキスト長", max_output: "最大出力", benchmark: "ベンチマーク", feature: "機能",
};

async function ModelsAdmin() {
  const models = await listModels(true);
  const companies = await listCompanies(true);
  const today = jstDate();
  return (
    <div className="space-y-6">
      <p className="text-sm text-ink-soft">公開ページ <Link href="/compare#models" className="text-accent">/compare</Link> に表示されます。値は必ず公式ページなど出典を確認してから登録してください（出典URL・取得日は必須）。</p>
      {models.map((m) => (
        <details key={m.id} className="card">
          <summary className="cursor-pointer px-4 py-3 font-medium">
            {m.name}<span className="ml-2 text-xs text-ink-faint">{m.company_name ?? m.company_slug}・{m.model_key}・{m.facts.length}項目{(m as any).status === "hidden" ? "・非表示" : ""}</span>
          </summary>
          <div className="border-t border-line p-4">
            <table className="w-full text-sm">
              <tbody>
                {m.facts.map((f) => (
                  <tr key={f.id}>
                    <td className="td whitespace-nowrap">{FIELD_LABEL[f.field] ?? f.field}{f.label ? `：${f.label}` : ""}</td>
                    <td className="td tabular-nums">{f.value_num ?? f.value_text} {f.unit}</td>
                    <td className="td text-xs text-ink-soft">{f.condition ?? "—"}</td>
                    <td className="td text-xs"><a href={f.source_url} target="_blank" rel="noopener noreferrer" className="text-accent">出典</a>・{f.checked_on}</td>
                    <td className="td"><form action={actionDeleteFact}><input type="hidden" name="id" value={f.id} /><button className="btn text-xs text-red-700">削除</button></form></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <form action={actionAddFact} className="mt-4 grid gap-2 sm:grid-cols-4">
              <input type="hidden" name="model_id" value={m.id} />
              <select name="field" className="input">{Object.entries(FIELD_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
              <input name="label" placeholder="ベンチマーク名など（任意）" className="input" />
              <input name="value" placeholder="値（数値または文字）" className="input" required />
              <input name="unit" placeholder="単位（例：USD/100万トークン）" className="input" />
              <input name="condition" placeholder="測定条件・適用条件（任意）" className="input sm:col-span-2" />
              <input name="source_url" type="url" placeholder="出典URL（必須）" className="input" required />
              <input name="checked_on" type="date" defaultValue={today} className="input" required />
              <div className="sm:col-span-4 flex gap-2">
                <button className="btn-primary text-xs">項目を追加</button>
              </div>
            </form>
            <form action={actionToggleModel} className="mt-3"><input type="hidden" name="id" value={m.id} /><button className="btn text-xs">{(m as any).status === "hidden" ? "公開する" : "非表示にする"}</button></form>
          </div>
        </details>
      ))}
      <form action={actionAddModel} className="card grid gap-3 p-4 sm:grid-cols-4">
        <h2 className="font-bold sm:col-span-4">モデルを追加</h2>
        <input name="name" placeholder="表示名（例：Claude Opus 5.5）" className="input" required />
        <input name="model_key" placeholder="モデルID（例：claude-opus-5-5）" className="input" required />
        <select name="company_slug" className="input">{companies.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}</select>
        <input name="sort_order" type="number" defaultValue={100} className="input" />
        <div className="sm:col-span-4"><button className="btn-primary">追加</button></div>
      </form>
    </div>
  );
}
