// 毎日の重要ニュースBEST5：候補抽出 → 100点評価 → 上位選定 → 深掘り分析 → 検証 → 公開
import Anthropic from "@anthropic-ai/sdk";
import { q } from "./db";
import { errMsg, finishJob, logJobError, startJob } from "./jobs";
import { callClaude, toolInput } from "./usage";
import { decideConfidence, jstDate, SCORE_CRITERIA, selectTop, verifyAnalysis, type Fact, type RawScore, type ScoredStory } from "./brief-logic";

export const ANALYSIS_MODEL = process.env.AI_ANALYSIS_MODEL || "claude-sonnet-5-5";
const MIN_SCORE = Number(process.env.BRIEF_MIN_SCORE || 60);
const MAX_CANDIDATES = 40;
const WINDOW_HOURS = 24;

export type BriefAnalysis = {
  overview: string;               // 事実：ニュース概要
  key_facts: Fact[];              // 事実：確認できた要点（出典の記事番号つき）
  what_changed: string;           // 事実：今回何が変わったか
  vs_past: string;                // 事実ベース：過去の発表との違い（提示した過去記事のみ根拠）
  why_important: string;          // 分析
  competitors: string;            // 分析
  industry: string;               // 分析
  japan: string;                  // 分析
  exec_points: string[];          // 分析
  business_use: string[];         // 分析
  outlook: { short: string; mid: string; long: string }; // 予測
  confidence: "high" | "medium" | "low";
  confidence_reason: string;
  missing_info: string[];         // 情報不足で判断できなかった点
};

type Candidate = {
  id: number; title: string; summary: string | null; category: string | null; verification: string;
  published: string | null; article_count: number; companies: string | null; excerpt: string | null; sources: string | null;
};

// ---------- 採点 ----------

const SCORE_SYSTEM = `あなたはAI業界ニュースの編集責任者です。経営者向けに、直近24時間のニュース候補を評価します。
各候補を次の基準で採点してください（合計100点）。
${SCORE_CRITERIA.map((c) => `- ${c.key}: ${c.label}（0〜${c.max}点）`).join("\n")}
厳守事項:
- 与えられたタイトル・要約・抜粋だけを根拠にする。書かれていない事実を想定して加点しない。
- 公式発表が未確認の報道は、確度が低い点を踏まえて評価する。
- 製品の小さなアップデート、イベント告知、事例紹介、ハウツー記事は低めに評価する。
- reason には、点数の根拠を候補の内容に即して1〜2文で書く。`;

const SCORE_TOOL: Anthropic.Tool = {
  name: "save_scores",
  description: "全候補の採点結果を保存する",
  input_schema: {
    type: "object",
    properties: {
      items: {
        type: "array",
        items: {
          type: "object",
          properties: {
            story_id: { type: "integer" },
            ...Object.fromEntries(SCORE_CRITERIA.map((c) => [c.key, { type: "integer", minimum: 0, maximum: c.max }])),
            reason: { type: "string" },
          },
          required: ["story_id", ...SCORE_CRITERIA.map((c) => c.key), "reason"],
        },
      },
    },
    required: ["items"],
  },
};

async function scoreCandidates(client: Anthropic, cands: Candidate[]): Promise<ScoredStory[]> {
  const list = cands
    .map((c) =>
      [
        `[ID ${c.id}] ${c.title}`,
        `確認状況: ${c.verification === "official" ? "公式発表あり" : c.verification === "reported" ? "複数報道" : "公式未確認"} / 記事数: ${c.article_count} / 関連企業: ${c.companies || "なし"} / 情報源: ${c.sources || "不明"}`,
        `内容: ${c.summary || c.excerpt || "(抜粋なし)"}`,
      ].join("\n"),
    )
    .join("\n\n");
  const res = await callClaude(client, "brief-score", {
    model: ANALYSIS_MODEL,
    max_tokens: 12000,
    system: SCORE_SYSTEM,
    tools: [SCORE_TOOL],
    tool_choice: { type: "tool", name: "save_scores" },
    messages: [{ role: "user", content: `候補は${cands.length}件です。すべて採点してください。\n\n${list}` }],
  });
  const { items } = toolInput<{ items: RawScore[] }>(res);
  return selectTop(items ?? [], new Set(cands.map((c) => c.id)), MIN_SCORE, 5);
}

// ---------- 深掘り分析 ----------

const ANALYSIS_SYSTEM = `あなたはAI業界の上級アナリストです。経営者・事業開発担当者向けに、1件のニュースを日本語で深掘り分析します。
3種類の内容を厳密に区別してください。
- 事実（overview, key_facts, what_changed）: 提示された記事に書かれていることだけ。key_facts には必ず根拠の記事番号を付ける。
- 過去との違い（vs_past）: 提示した「過去の関連ニュース」だけを根拠にする。該当がなければ「比較できる過去の情報がありません」と書く。
- 分析（why_important, competitors, industry, japan, exec_points, business_use）: 推論であることが分かる表現（〜と考えられる、〜の可能性がある）で書く。
- 予測（outlook）: 短期=〜3か月、中期=〜1年、長期=1年超。不確実性を前提に書く。
厳守事項:
- 記事にない数値・日付・人物の発言・価格・性能を作らない。
- 情報が足りず判断できない点は推測で埋めず、missing_info に列挙し、該当欄には「情報不足のため判断できません」と書く。
- 日本企業への影響は、具体的な業種・業務に結びつけて書くが、日本市場での発表がない限り「日本で提供される」とは断定しない。
- confidence は、情報源の確かさと情報量から high / medium / low を判断し、理由を書く。`;

const ANALYSIS_TOOL: Anthropic.Tool = {
  name: "save_analysis",
  description: "深掘り分析を保存する",
  input_schema: {
    type: "object",
    properties: {
      overview: { type: "string", description: "ニュース概要（事実のみ、150〜250字）" },
      key_facts: {
        type: "array",
        items: { type: "object", properties: { text: { type: "string" }, source: { type: "integer", description: "根拠の記事番号" } }, required: ["text", "source"] },
        description: "確認できた事実 2〜5件",
      },
      what_changed: { type: "string", description: "今回何が変化したのか（事実ベース）" },
      vs_past: { type: "string", description: "過去の発表との違い（提示した過去ニュースのみ根拠）" },
      why_important: { type: "string", description: "なぜ重要なのか（分析）" },
      competitors: { type: "string", description: "競合企業への影響（分析）" },
      industry: { type: "string", description: "AI業界全体への影響（分析）" },
      japan: { type: "string", description: "日本企業への影響（分析）" },
      exec_points: { type: "array", items: { type: "string" }, description: "経営者が注目すべきポイント 2〜4件" },
      business_use: { type: "array", items: { type: "string" }, description: "実際のビジネス活用方法 2〜4件" },
      outlook: {
        type: "object",
        properties: { short: { type: "string" }, mid: { type: "string" }, long: { type: "string" } },
        required: ["short", "mid", "long"],
      },
      confidence: { type: "string", enum: ["high", "medium", "low"] },
      confidence_reason: { type: "string" },
      missing_info: { type: "array", items: { type: "string" } },
    },
    required: ["overview", "key_facts", "what_changed", "vs_past", "why_important", "competitors", "industry", "japan",
      "exec_points", "business_use", "outlook", "confidence", "confidence_reason", "missing_info"],
  },
};

async function analyzeStory(client: Anthropic, storyId: number) {
  const [story] = await q<any>("SELECT id, title_ja, representative_title, summary_ja, verification FROM stories WHERE id=$1", [storyId]);
  const arts = await q<any>(
    `SELECT a.title, a.excerpt, a.published_at, s.name AS source, s.source_type
       FROM articles a LEFT JOIN sources s ON s.id=a.source_id
      WHERE a.story_id=$1 ORDER BY (s.source_type='official') DESC, a.published_at ASC LIMIT 6`,
    [storyId],
  );
  const past = await q<any>(
    `SELECT DISTINCT ON (s.id) s.id, coalesce(s.title_ja, s.representative_title) AS title, s.summary_ja, s.first_published_at
       FROM stories s JOIN story_companies sc ON sc.story_id=s.id
      WHERE sc.company_id IN (SELECT company_id FROM story_companies WHERE story_id=$1)
        AND s.id <> $1 AND NOT s.is_demo
        AND coalesce(s.first_published_at, s.created_at) BETWEEN now() - interval '90 days' AND now() - interval '1 day'
      ORDER BY s.id DESC LIMIT 8`,
    [storyId],
  );
  const companies = await q<{ name: string }>(
    "SELECT c.name FROM story_companies sc JOIN companies c ON c.id=sc.company_id WHERE sc.story_id=$1",
    [storyId],
  );
  const sourceTexts = arts.map((a) => `${a.title} ${a.excerpt ?? ""}`);
  const doc = [
    `確認状況: ${story.verification === "official" ? "公式発表あり" : story.verification === "reported" ? "複数報道（公式未確認）" : "単一報道（公式未確認）"}`,
    `関連企業: ${companies.map((c) => c.name).join(", ") || "なし"}`,
    "",
    "■ 記事",
    ...arts.map((a, i) => `[記事${i + 1}] ${a.source ?? "不明"}（${a.source_type === "official" ? "公式" : "報道"}）${a.published_at ? new Date(a.published_at).toISOString().slice(0, 10) : ""}\nタイトル: ${a.title}\n抜粋: ${a.excerpt || "(抜粋なし)"}`),
    "",
    "■ 過去の関連ニュース（直近90日・当サイトで収集したもの）",
    ...(past.length
      ? past.map((p) => `- ${p.first_published_at ? new Date(p.first_published_at).toISOString().slice(0, 10) : "日付不明"} ${p.title}${p.summary_ja ? `：${p.summary_ja.slice(0, 120)}` : ""}`)
      : ["（該当なし）"]),
  ].join("\n");

  const res = await callClaude(client, "brief-analysis", {
    model: ANALYSIS_MODEL,
    max_tokens: 10000,
    system: ANALYSIS_SYSTEM,
    tools: [ANALYSIS_TOOL],
    tool_choice: { type: "tool", name: "save_analysis" },
    messages: [{ role: "user", content: `次のニュースを深掘り分析してください。\n\n${doc}` }],
  });
  const a = toolInput<BriefAnalysis>(res);
  const check = verifyAnalysis(a.key_facts ?? [], a.overview ?? "", sourceTexts);
  const confidence = decideConfidence(story.verification, arts.length, a.confidence);
  return {
    analysis: a,
    headline: story.title_ja || story.representative_title,
    confidence,
    check,
  };
}

// ---------- ジョブ本体 ----------

export type BriefResult = { date: string; status: string; items: number; note?: string };

export async function runBrief(trigger = "manual", opts: { force?: boolean; date?: string } = {}): Promise<BriefResult> {
  const date = opts.date ?? jstDate();
  const [existing] = await q<{ id: number; status: string }>("SELECT id, status FROM daily_briefs WHERE brief_date=$1 AND NOT is_demo", [date]);
  if (existing && existing.status === "published" && !opts.force) {
    return { date, status: "skipped", items: 0, note: "本日分は公開済みのため再生成しませんでした" };
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    const runId = await startJob("brief", trigger);
    await logJobError(runId, "config", "ANTHROPIC_API_KEY が未設定のためBEST5を生成できません");
    await finishJob(runId, "failed", { date });
    return { date, status: "failed", items: 0, note: "APIキー未設定" };
  }

  const runId = await startJob("brief", trigger);
  const windowEnd = new Date();
  const windowStart = new Date(windowEnd.getTime() - WINDOW_HOURS * 36e5);
  const [brief] = await q<{ id: number }>(
    `INSERT INTO daily_briefs (brief_date, status, window_start, window_end, model, generated_at, note, published_at, candidate_count)
     VALUES ($1,'running',$2,$3,$4,now(),NULL,NULL,0)
     ON CONFLICT (brief_date) DO UPDATE SET status='running', is_demo=FALSE, window_start=$2, window_end=$3, model=$4, generated_at=now(), note=NULL
     RETURNING id`,
    [date, windowStart, windowEnd, ANALYSIS_MODEL],
  );

  const finish = async (status: "published" | "empty" | "failed", note: string | null, items: number, runStatus: "success" | "partial" | "failed") => {
    await q(
      `UPDATE daily_briefs SET status=$2, note=$3, published_at = CASE WHEN $2 IN ('published','empty') THEN now() ELSE published_at END WHERE id=$1`,
      [brief.id, status, note],
    );
    await finishJob(runId, runStatus, { date, items, note });
    return { date, status, items, note: note ?? undefined };
  };

  try {
    const cands = await q<Candidate>(
      `SELECT s.id, coalesce(s.title_ja, s.representative_title) AS title, s.summary_ja AS summary, s.category, s.verification,
              s.first_published_at AS published,
              (SELECT count(*)::int FROM articles a WHERE a.story_id=s.id) AS article_count,
              (SELECT string_agg(c.name, ', ') FROM story_companies sc JOIN companies c ON c.id=sc.company_id WHERE sc.story_id=s.id) AS companies,
              (SELECT a.excerpt FROM articles a WHERE a.story_id=s.id ORDER BY a.published_at LIMIT 1) AS excerpt,
              (SELECT string_agg(DISTINCT src.name, ', ') FROM articles a JOIN sources src ON src.id=a.source_id WHERE a.story_id=s.id) AS sources
         FROM stories s
        WHERE NOT s.is_demo AND coalesce(s.first_published_at, s.created_at) BETWEEN $1 AND $2
        ORDER BY coalesce(s.importance, 0) DESC, (s.verification='official') DESC,
                 (SELECT count(*) FROM articles a WHERE a.story_id=s.id) DESC, s.first_published_at DESC
        LIMIT $3`,
      [windowStart, windowEnd, MAX_CANDIDATES],
    );
    await q("UPDATE daily_briefs SET candidate_count=$2 WHERE id=$1", [brief.id, cands.length]);
    if (!cands.length) return await finish("empty", "直近24時間に対象となるニュースがありませんでした", 0, "success");

    const top = await scoreCandidates(client(), cands);
    await q("DELETE FROM brief_items WHERE brief_id=$1", [brief.id]);
    if (!top.length) return await finish("empty", `基準点（${MIN_SCORE}点）以上のニュースがありませんでした`, 0, "success");

    // 深掘り分析は並列実行（処理時間を短縮）
    const results = await Promise.allSettled(top.map((t) => analyzeStory(client(), t.story_id)));
    let saved = 0;
    for (const [i, r] of results.entries()) {
      const t = top[i];
      if (r.status === "rejected") {
        await logJobError(runId, `story:${t.story_id}`, `深掘り分析に失敗: ${errMsg(r.reason)}`);
        continue;
      }
      saved++;
      await q(
        `INSERT INTO brief_items (brief_id, rank, story_id, headline, total_score, scores, score_reason, analysis,
           confidence, confidence_note, check_status, check_note, model)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [brief.id, saved, t.story_id, r.value.headline, t.total, JSON.stringify(t.scores), t.reason,
         JSON.stringify(r.value.analysis), r.value.confidence, r.value.analysis.confidence_reason,
         r.value.check.status, r.value.check.notes.join(" / ") || null, ANALYSIS_MODEL],
      );
    }
    if (!saved) return await finish("failed", "すべての深掘り分析に失敗しました", 0, "failed");
    const note = saved < top.length ? `${top.length - saved}件は分析に失敗したため掲載していません` : null;
    return await finish("published", note, saved, saved < top.length ? "partial" : "success");
  } catch (e) {
    await logJobError(runId, "brief", errMsg(e));
    const [{ n }] = await q<{ n: number }>("SELECT count(*)::int AS n FROM brief_items WHERE brief_id=$1", [brief.id]);
    if (n > 0) return await finish("published", "再生成に失敗したため、前回生成した内容を表示しています", n, "failed");
    return await finish("failed", `生成に失敗しました: ${errMsg(e).slice(0, 200)}`, 0, "failed");
  }
}

let _client: Anthropic | null = null;
function client() {
  return (_client ??= new Anthropic());
}
