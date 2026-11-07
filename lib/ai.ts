// AI要約ジョブ：未要約のstoryを日本語で要約し、整合性チェックとバージョン記録を行う
import Anthropic from "@anthropic-ai/sdk";
import { q } from "./db";
import { CATEGORIES } from "./seed-data";
import { errMsg, finishJob, logJobError, startJob } from "./jobs";
import { callClaude, toolInput } from "./usage";

export const SUMMARY_MODEL = process.env.AI_SUMMARY_MODEL || "claude-haiku-5-5";
const MAX_PER_RUN = Number(process.env.AI_MAX_SUMMARIES_PER_RUN || 20);

export type SummaryPayload = {
  title_ja: string;
  summary_ja: string;
  key_points: string[];
  why_it_matters: string;
  category: string;
  importance: 1 | 2 | 3;
  importance_reason: string;
};

const SYSTEM = `あなたはAI業界ニュースの編集者です。与えられた記事（タイトルと抜粋）だけを根拠に、日本語で要約します。
厳守事項:
- 記事に書かれていない事実・数値・日付・人物の発言を加えない。推測で補わない。
- 抜粋で情報が不足していれば、その旨を要約に書く（例:「詳細は原文参照」）。
- why_it_matters は「分析」であり事実ではない。断定せず「〜の可能性がある」「〜と見られる」のように書く。
- importance は 3=業界全体に影響し得る主要発表、2=注目すべき動き、1=参考情報。importance_reason にその判断根拠を記事内容に即して1文で書く。
- 社名・製品名は原文表記を維持する。`;

const TOOL: Anthropic.Tool = {
  name: "save_summary",
  description: "記事要約を保存する",
  input_schema: {
    type: "object",
    properties: {
      title_ja: { type: "string", description: "日本語の見出し（40字程度）" },
      summary_ja: { type: "string", description: "日本語要約（150〜250字）" },
      key_points: { type: "array", items: { type: "string" }, description: "要点 2〜4個（記事に書かれた事実のみ）" },
      why_it_matters: { type: "string", description: "なぜ重要か・ビジネスへの影響の分析（100字程度、推測表現で）" },
      category: { type: "string", enum: [...CATEGORIES] },
      importance: { type: "integer", enum: [1, 2, 3] },
      importance_reason: { type: "string" },
    },
    required: ["title_ja", "summary_ja", "key_points", "why_it_matters", "category", "importance", "importance_reason"],
  },
};

/**
 * 整合性チェック（機械的）: 要約・要点に出てくる数値が原文側に存在するかを確認する。
 * 原文に無い数値があれば warn にして管理画面で確認できるようにする。
 */
export function checkConsistency(p: Pick<SummaryPayload, "summary_ja" | "key_points">, source: string): { status: "ok" | "warn"; note: string | null } {
  const nums = (s: string) => (s.normalize("NFKC").match(/\d+(?:[.,]\d+)?/g) ?? []).map((n) => n.replace(/,/g, ""));
  const src = new Set(nums(source));
  const out = nums([p.summary_ja, ...p.key_points].join(" "));
  const missing = [...new Set(out.filter((n) => !src.has(n)))];
  return missing.length ? { status: "warn", note: `原文に見当たらない数値: ${missing.join(", ")}` } : { status: "ok", note: null };
}

export async function summarizeStory(client: Anthropic, storyId: number) {
  const arts = await q<{ title: string; excerpt: string | null; source: string | null; source_type: string | null; published_at: string | null }>(
    `SELECT a.title, a.excerpt, s.name AS source, s.source_type, a.published_at
       FROM articles a LEFT JOIN sources s ON s.id=a.source_id
      WHERE a.story_id=$1 ORDER BY (s.source_type='official') DESC, a.published_at ASC LIMIT 5`,
    [storyId],
  );
  if (!arts.length) throw new Error("記事がありません");
  const doc = arts
    .map((a, i) => `[記事${i + 1}] 情報源: ${a.source ?? "不明"}（${a.source_type === "official" ? "公式" : "報道"}）\nタイトル: ${a.title}\n抜粋: ${a.excerpt || "(抜粋なし)"}`)
    .join("\n\n");

  const res = await callClaude(client, "summarize", {
    model: SUMMARY_MODEL,
    max_tokens: 1200,
    system: SYSTEM,
    tools: [TOOL],
    tool_choice: { type: "tool", name: "save_summary" },
    messages: [{ role: "user", content: `以下は同一の発表・出来事を扱う記事です。まとめて要約してください。\n\n${doc}` }],
  });
  const p = toolInput<SummaryPayload>(res);
  const check = checkConsistency(p, doc);
  await saveSummary(storyId, p, SUMMARY_MODEL, "ai", check);
}

export async function saveSummary(
  storyId: number,
  p: SummaryPayload,
  model: string | null,
  author: "ai" | "admin",
  check: { status: string; note: string | null },
) {
  const [{ v }] = await q<{ v: number }>("SELECT summary_version + 1 AS v FROM stories WHERE id=$1", [storyId]);
  await q(
    `UPDATE stories SET title_ja=$2, summary_ja=$3, key_points=$4, why_it_matters=$5, category=$6,
       importance=$7, importance_reason=$8, summary_status='done', summary_model=$9,
       summary_generated_at=now(), summary_version=$10, consistency=$11, consistency_note=$12,
       manually_edited = (manually_edited OR $13), updated_at=now()
     WHERE id=$1`,
    [storyId, p.title_ja, p.summary_ja, JSON.stringify(p.key_points), p.why_it_matters, p.category, p.importance,
     p.importance_reason, model, v, check.status, check.note, author === "admin"],
  );
  await q("INSERT INTO summary_versions (story_id, version, payload, model, author) VALUES ($1,$2,$3,$4,$5)", [
    storyId, v, JSON.stringify(p), model, author,
  ]);
}

export async function runSummarize(trigger = "manual", limit = MAX_PER_RUN) {
  const runId = await startJob("summarize", trigger);
  const stats = { target: 0, done: 0, failed: 0, skipped_no_key: false };
  if (!process.env.ANTHROPIC_API_KEY) {
    stats.skipped_no_key = true;
    await logJobError(runId, "config", "ANTHROPIC_API_KEY が未設定のため要約をスキップしました");
    await finishJob(runId, "failed", stats);
    return { runId, stats };
  }
  const client = new Anthropic();
  const targets = await q<{ id: number }>(
    `SELECT id FROM stories WHERE summary_status IN ('pending','failed') AND NOT is_demo
     ORDER BY coalesce(first_published_at, created_at) DESC LIMIT $1`,
    [limit],
  );
  stats.target = targets.length;
  for (const t of targets) {
    try {
      await summarizeStory(client, t.id);
      stats.done++;
    } catch (e) {
      stats.failed++;
      await logJobError(runId, `story:${t.id}`, errMsg(e));
      await q("UPDATE stories SET summary_status='failed' WHERE id=$1", [t.id]);
    }
  }
  await finishJob(runId, stats.failed === 0 ? "success" : stats.done > 0 ? "partial" : "failed", stats);
  return { runId, stats };
}
