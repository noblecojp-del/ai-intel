# AI Intel｜世界のAI情報プラットフォーム

世界の主要AI企業の公式発表・ニュースを自動収集し、重複を統合したうえで日本語で要約・整理するWebサービスです。
現在は **第1段階（MVP）** を実装しています。

## 実装状況

| 区分 | 内容 |
|---|---|
| ✅ 実装済み | ダッシュボード / ニュース一覧・詳細（検索・企業・ジャンル・重要度・確認状況フィルター） / 企業一覧・企業別ページ（10社、最大20社まで管理画面で変更可） |
| ✅ 実装済み | RSS自動収集（公式8件＋報道2件）、URL正規化と重複統合、企業の自動紐付け、公式/複数報道/公式未確認の区別、発表日時と取得日時の区別 |
| ✅ 実装済み | Claude APIによる日本語要約（見出し・要約・要点・「なぜ重要か」・ジャンル・重要度と根拠）、数値の整合性チェック、使用モデル・生成日時・バージョン履歴の記録 |
| ✅ 実装済み | 管理画面（ジョブ実行・履歴・エラーログ、情報源の追加/停止、追跡企業の編集、要約の修正・再生成）、Basic認証 |
| ✅ 実装済み | 定期実行（Vercel Cron：毎日1回 ／ GitHub Actions：3時間ごと）、失敗時の再試行とログ記録、1回あたりの要約件数上限 |
| ⏳ 未実装（第2段階） | CEO・人物の発言分析、YouTube動画ライブラリ、横断分析・比較表・グラフ |
| ⏳ 未実装（第3段階） | 日次・週次・月次レポート、通知、コスト最適化 |
| ⚠️ 要外部設定 | Supabase（DB）、Vercel（公開）、Claude APIキー、GitHub Actions Secrets ― 手順は下記 |

**情報源についての注意**：Anthropic と Meta AI は公式RSSを提供していないため、現状は報道記事のキーワード一致でのみ紐付けています。NVIDIAのRSSは利用条件（非商用目的）があるため、商用運用前に確認してください。記事本文は保存せず、タイトル・抜粋（600字まで）・リンクのみを扱います。

## 構成

```
[公式RSS / 報道RSS]
      │  lib/ingest.ts   取得（タイムアウト15秒・3回再試行）
      ▼
[正規化・重複統合]  lib/dedupe.ts   URL正規化 / タイトル類似度（72時間以内）/ 企業キーワード照合
      ▼
[PostgreSQL]  stories ← articles（1つの発表に複数記事）／ companies ／ sources ／ summary_versions ／ job_runs ／ job_errors
      ▼
[AI要約]  lib/ai.ts   Claude API（既定: claude-haiku-5-5）・ツール出力で構造化・整合性チェック・版管理
      ▼
[表示]  Next.js App Router（app/）     [管理]  /admin（Basic認証）
定期実行: /api/cron/ingest（CRON_SECRETで保護）
```

DBスキーマは `lib/schema.ts`、初期の企業・情報源は `lib/seed-data.ts` にあります。

## ローカルで動かす

```bash
npm install
cp .env.example .env.local     # ANTHROPIC_API_KEY を入れると要約が生成されます
npm run seed:demo              # 任意：画面確認用デモデータ（「デモデータ」と表示。管理画面から削除可）
npm run ingest                 # 実際のRSSを収集して要約
npm run dev                    # http://localhost:3000
```

`DATABASE_URL` が未設定のときは組込みDB（PGlite、`./.data`）を使うので、DBのセットアップは不要です。
テスト: `npm test`

## 公開手順（Supabase + Vercel）

1. **Supabase** でプロジェクトを作成 → Project Settings → Database → Connection string の **Transaction pooler（ポート6543）** をコピー
2. **Vercel** で「Add New → Project」→ このGitHubリポジトリをImport
3. Environment Variables に以下を設定して Deploy

   | 変数 | 値 |
   |---|---|
   | `DATABASE_URL` | 手順1の接続文字列（パスワード部分を置き換える） |
   | `ANTHROPIC_API_KEY` | Claude APIキー（console.anthropic.com で発行） |
   | `AI_SUMMARY_MODEL` | 省略可（既定 `claude-haiku-5-5`） |
   | `AI_MAX_SUMMARIES_PER_RUN` | 省略可（既定 20。費用上限の調整用） |
   | `CRON_SECRET` | 長いランダム文字列（例: `openssl rand -hex 32`） |
   | `ADMIN_USER` / `ADMIN_PASSWORD` | 管理画面のログイン情報 |

   テーブルは初回アクセス時に自動作成されます。
4. 公開URLの `/admin` を開き「今すぐ収集＋要約」で初回データを取り込む
5. 3時間ごとに自動収集するには、GitHub の Settings → Secrets and variables → Actions に
   `SITE_URL`（例 `https://ai-intel.vercel.app`）と `CRON_SECRET`（手順3と同じ値）を登録

Vercel の Hobby（無料）プランは cron が1日1回まで・個人の非商用利用が前提です。商用運用時は Pro プランを検討してください。

## 品質方針

- 要約は取得できたタイトル・抜粋のみを根拠にし、書かれていない事実を補わない
- 「なぜ重要か」はAIによる分析として明示し、推測表現で記述
- 要約内の数値が原文に見当たらない場合は「要確認」として管理画面に表示
- 管理者が修正した要約は手動修正として版管理され、自動再生成で上書きされない
- 重要度は3段階で、必ず判断根拠を併記。記事数はランキングとして扱わない
