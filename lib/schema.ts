// データベース定義（PostgreSQL / Supabase / PGlite 共通）
// 起動時に IF NOT EXISTS で適用される。破壊的変更は別途マイグレーションで行うこと。
export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS companies (
  id            SERIAL PRIMARY KEY,
  slug          TEXT UNIQUE NOT NULL,
  name          TEXT NOT NULL,
  name_ja       TEXT,
  description   TEXT,
  website       TEXT,
  is_listed     BOOLEAN NOT NULL DEFAULT FALSE,      -- 上場企業か（決算情報の扱いに使う）
  ticker        TEXT,
  ir_url        TEXT,                                -- 投資家向けページ（上場企業のみ）
  keywords      TEXT[] NOT NULL DEFAULT '{}',        -- 記事との自動紐付けに使う語
  is_tracked    BOOLEAN NOT NULL DEFAULT TRUE,       -- 追跡対象（最大20社を想定）
  sort_order    INT NOT NULL DEFAULT 100,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sources (
  id              SERIAL PRIMARY KEY,
  name            TEXT NOT NULL,
  feed_url        TEXT UNIQUE NOT NULL,
  site_url        TEXT,
  source_type     TEXT NOT NULL DEFAULT 'media',     -- official = 企業の公式発表 / media = 報道・二次情報
  company_id      INT REFERENCES companies(id) ON DELETE SET NULL,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  note            TEXT,
  last_fetched_at TIMESTAMPTZ,
  last_status     TEXT,
  last_error      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- story = 同一の発表・出来事をまとめた単位。複数記事が1つのstoryに統合される
CREATE TABLE IF NOT EXISTS stories (
  id                   SERIAL PRIMARY KEY,
  title_ja             TEXT,
  summary_ja           TEXT,
  key_points           JSONB,
  why_it_matters       TEXT,                         -- AIによる分析（事実ではない）
  category             TEXT,
  importance           SMALLINT,                     -- 1=参考 2=注目 3=重要（理由を必ず併記）
  importance_reason    TEXT,
  verification         TEXT NOT NULL DEFAULT 'unconfirmed', -- official / reported / unconfirmed
  first_published_at   TIMESTAMPTZ,
  last_article_at      TIMESTAMPTZ,
  representative_title TEXT NOT NULL,
  summary_status       TEXT NOT NULL DEFAULT 'pending',     -- pending / done / failed / skipped
  summary_model        TEXT,
  summary_generated_at TIMESTAMPTZ,
  summary_version      INT NOT NULL DEFAULT 0,
  consistency          TEXT NOT NULL DEFAULT 'unchecked',   -- ok / warn / unchecked
  consistency_note     TEXT,
  manually_edited      BOOLEAN NOT NULL DEFAULT FALSE,
  is_demo              BOOLEAN NOT NULL DEFAULT FALSE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS articles (
  id            SERIAL PRIMARY KEY,
  story_id      INT REFERENCES stories(id) ON DELETE CASCADE,
  source_id     INT REFERENCES sources(id) ON DELETE SET NULL,
  url           TEXT UNIQUE NOT NULL,               -- 正規化済みURL
  title         TEXT NOT NULL,
  norm_title    TEXT NOT NULL,
  excerpt       TEXT,
  published_at  TIMESTAMPTZ,                        -- 発表日時（取得元が示す値）
  fetched_at    TIMESTAMPTZ NOT NULL DEFAULT now(), -- 取得日時
  is_demo       BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX IF NOT EXISTS articles_story_idx ON articles(story_id);
CREATE INDEX IF NOT EXISTS articles_published_idx ON articles(published_at DESC);

CREATE TABLE IF NOT EXISTS story_companies (
  story_id   INT REFERENCES stories(id) ON DELETE CASCADE,
  company_id INT REFERENCES companies(id) ON DELETE CASCADE,
  PRIMARY KEY (story_id, company_id)
);

-- AI要約・手動修正の履歴（再生成・バージョン管理用）
CREATE TABLE IF NOT EXISTS summary_versions (
  id         SERIAL PRIMARY KEY,
  story_id   INT REFERENCES stories(id) ON DELETE CASCADE,
  version    INT NOT NULL,
  payload    JSONB NOT NULL,
  model      TEXT,
  author     TEXT NOT NULL DEFAULT 'ai',             -- ai / admin
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS job_runs (
  id          SERIAL PRIMARY KEY,
  job         TEXT NOT NULL,
  trigger     TEXT NOT NULL DEFAULT 'manual',        -- manual / cron / cli
  status      TEXT NOT NULL DEFAULT 'running',       -- running / success / partial / failed
  stats       JSONB,
  started_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS job_errors (
  id         SERIAL PRIMARY KEY,
  job_run_id INT REFERENCES job_runs(id) ON DELETE CASCADE,
  scope      TEXT,                                   -- 例: source:3 / story:12
  message    TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 毎日の重要ニュースBEST5
CREATE TABLE IF NOT EXISTS daily_briefs (
  id               SERIAL PRIMARY KEY,
  brief_date       DATE UNIQUE NOT NULL,                 -- 日本時間の日付
  status           TEXT NOT NULL DEFAULT 'running',      -- running / published / empty / failed
  window_start     TIMESTAMPTZ,
  window_end       TIMESTAMPTZ,
  candidate_count  INT NOT NULL DEFAULT 0,
  model            TEXT,
  note             TEXT,
  generated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at     TIMESTAMPTZ,
  is_demo          BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS brief_items (
  id                  SERIAL PRIMARY KEY,
  brief_id            INT REFERENCES daily_briefs(id) ON DELETE CASCADE,
  rank                SMALLINT NOT NULL,
  story_id            INT REFERENCES stories(id) ON DELETE SET NULL,
  headline            TEXT NOT NULL,
  total_score         SMALLINT NOT NULL,                 -- 100点満点（AIによる評価）
  scores              JSONB NOT NULL,                    -- 項目別の点数
  score_reason        TEXT,
  analysis            JSONB,                             -- 深掘り分析（事実/分析/予測を区別）
  confidence          TEXT,                              -- high / medium / low
  confidence_note     TEXT,
  check_status        TEXT NOT NULL DEFAULT 'unchecked', -- ok / warn / failed
  check_note          TEXT,
  model               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (brief_id, rank)
);

-- Claude API の使用量と推定コスト
CREATE TABLE IF NOT EXISTS api_usage (
  id            SERIAL PRIMARY KEY,
  job           TEXT NOT NULL,
  model         TEXT NOT NULL,
  input_tokens  INT NOT NULL DEFAULT 0,
  output_tokens INT NOT NULL DEFAULT 0,
  cost_usd      NUMERIC(12,6),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- 企業の紐付け：story_companies は「主役の企業」、言及されただけの企業は story_mentions に分ける
ALTER TABLE stories ADD COLUMN IF NOT EXISTS tagged_at TIMESTAMPTZ;      -- AIで紐付けを判定した日時（NULL＝未判定）
ALTER TABLE stories ADD COLUMN IF NOT EXISTS tag_model TEXT;
CREATE TABLE IF NOT EXISTS story_mentions (
  story_id   INT REFERENCES stories(id) ON DELETE CASCADE,
  company_id INT REFERENCES companies(id) ON DELETE CASCADE,
  PRIMARY KEY (story_id, company_id)
);

-- 人物（CEO・研究者など）と発言
CREATE TABLE IF NOT EXISTS people (
  id           SERIAL PRIMARY KEY,
  slug         TEXT UNIQUE NOT NULL,
  name         TEXT NOT NULL,
  name_ja      TEXT,
  role         TEXT,                       -- 役職（確認日を role_checked_on に記録）
  role_checked_on DATE,
  company_slug TEXT,
  aliases      TEXT[] NOT NULL DEFAULT '{}', -- 記事から探すための表記
  is_tracked   BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order   INT NOT NULL DEFAULT 100,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS statements (
  id          SERIAL PRIMARY KEY,
  person_id   INT REFERENCES people(id) ON DELETE CASCADE,
  story_id    INT REFERENCES stories(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL,               -- direct_quote（原文に引用として確認） / reported（報道による要約・言い換え）
  quote       TEXT,                        -- 原文の引用（direct_quote のみ。原文と照合済み）
  summary_ja  TEXT NOT NULL,               -- 発言内容の日本語要約
  topic       TEXT,
  said_at     TIMESTAMPTZ,                 -- 記事の発表日時（発言日そのものではない場合がある）
  model       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS statements_person_idx ON statements(person_id, said_at DESC);
ALTER TABLE stories ADD COLUMN IF NOT EXISTS people_checked_at TIMESTAMPTZ;

-- YouTube（公式チャンネルの公開フィードのみ。字幕は取得しない）
CREATE TABLE IF NOT EXISTS video_channels (
  id              SERIAL PRIMARY KEY,
  name            TEXT NOT NULL,
  handle          TEXT,                       -- @OpenAI など
  channel_id      TEXT UNIQUE,                -- UC... （未解決なら NULL）
  company_slug    TEXT,
  kind            TEXT NOT NULL DEFAULT 'official', -- official = 企業公式 / interview = 対談・インタビュー番組
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  last_fetched_at TIMESTAMPTZ,
  last_status     TEXT,
  last_error      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS videos (
  id            SERIAL PRIMARY KEY,
  channel_ref   INT REFERENCES video_channels(id) ON DELETE CASCADE,
  video_id      TEXT UNIQUE NOT NULL,
  title         TEXT NOT NULL,
  description   TEXT,                         -- 概要欄（最大2000字）
  published_at  TIMESTAMPTZ,
  thumbnail_url TEXT,
  url           TEXT NOT NULL,
  is_ai_related BOOLEAN,
  title_ja      TEXT,
  summary_ja    TEXT,                         -- タイトルと概要欄のみに基づく要約
  key_points    JSONB,
  themes        TEXT[] NOT NULL DEFAULT '{}',
  people_slugs  TEXT[] NOT NULL DEFAULT '{}',
  summary_model TEXT,
  summarized_at TIMESTAMPTZ,
  fetched_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS videos_published_idx ON videos(published_at DESC);

-- 管理画面から変更できる設定
CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- AIモデル比較（公式情報のみ。各値に出典・取得日・条件を持つ）
CREATE TABLE IF NOT EXISTS ai_models (
  id           SERIAL PRIMARY KEY,
  company_slug TEXT,
  name         TEXT NOT NULL,
  model_key    TEXT UNIQUE NOT NULL,           -- APIのモデルID など
  status       TEXT NOT NULL DEFAULT 'published', -- published / hidden
  note         TEXT,
  sort_order   INT NOT NULL DEFAULT 100,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS model_facts (
  id           SERIAL PRIMARY KEY,
  model_id     INT REFERENCES ai_models(id) ON DELETE CASCADE,
  field        TEXT NOT NULL,                  -- price_in / price_out / context / max_output / benchmark / feature
  label        TEXT,                           -- ベンチマーク名など
  value_num    NUMERIC,
  value_text   TEXT,
  unit         TEXT,
  condition    TEXT,                           -- 測定条件・料金の適用条件
  source_url   TEXT NOT NULL,
  source_title TEXT,
  checked_on   DATE NOT NULL,                  -- 取得日（出典を確認した日）
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 週次などのAI分析（競争状況など）
CREATE TABLE IF NOT EXISTS analyses (
  id           SERIAL PRIMARY KEY,
  kind         TEXT NOT NULL,                  -- landscape
  period_start TIMESTAMPTZ,
  period_end   TIMESTAMPTZ,
  status       TEXT NOT NULL DEFAULT 'published',
  model        TEXT,
  payload      JSONB,
  check_note   TEXT,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 全候補の採点結果（基準点の調整と透明性のため）
ALTER TABLE daily_briefs ADD COLUMN IF NOT EXISTS score_summary JSONB;

CREATE INDEX IF NOT EXISTS api_usage_created_idx ON api_usage(created_at DESC);
`;
