export const metadata = { title: "今後の機能" };

const PHASES = [
  { name: "第1段階（公開中）", done: true, items: ["ダッシュボード", "ニュース一覧・詳細（検索・フィルター）", "企業別ページ（10社・最大20社まで管理画面で設定）", "公式RSS・報道RSSからの自動収集と重複統合", "AIによる日本語要約・整合性チェック・バージョン管理", "管理画面（情報源・追跡企業・ジョブ・エラー・要約修正）"] },
  { name: "追加済み", done: true, items: ["毎日の重要ニュースTOP5と深掘り分析", "企業比較・企業別タイムライン・1週間/1か月の変化", "AIモデル比較（公式の価格・コンテキスト長、出典・取得日つき）", "週次の競争状況分析（AI）"] },
  { name: "追加済み（人物）", done: true, items: ["CEO・主要人物の発言追跡（直接引用は原文と照合、報道と区別）", "人物ごとの発言分析（過去発言・他社見解との比較）", "記事と企業の紐付けのAI判定"] },
  { name: "次に追加", done: false, items: ["YouTube動画ライブラリ（公式API経由、取得できた字幕のみ要約）"] },
  { name: "第3段階", done: false, items: ["日次・週次・月次の自動レポート", "企業分析の継続更新", "通知機能", "分析精度・更新コストの最適化"] },
];

export default function Roadmap() {
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="border-b-2 border-ink pb-2 text-xl font-bold">今後の機能</h1>
      <p className="mt-3 text-sm text-ink-soft">人物分析・動画ライブラリ・レポートは順次追加します。</p>
      <div className="mt-6 space-y-4">
        {PHASES.map((p) => (
          <section key={p.name} className="card p-5">
            <h2 className="font-bold">{p.name}</h2>
            <ul className="mt-3 space-y-1.5 text-sm">
              {p.items.map((i) => <li key={i} className="flex gap-2"><span className={p.done ? "text-emerald-600" : "text-ink-faint"}>{p.done ? "✓" : "○"}</span>{i}</li>)}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
