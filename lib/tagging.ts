// 記事と企業の紐付けをAIで判定：キーワード一致の候補から「主役の企業」と「言及されただけの企業」を分ける
import Anthropic from "@anthropic-ai/sdk";
import { q } from "./db";
import { errMsg, finishJob, logJobError, startJob } from "./jobs";
import { callClaude, toolInput } from "./usage";
import { SUMMARY_MODEL } from "./ai";

const BATCH = 25;

export type TagDecision = { subjects: string[]; mentioned: string[] };

/**
 * AIの判定を検証して確定する（純粋関数）：
 * - 追跡中の企業以外は捨てる・重複を除く
 * - 公式発表の発信元企業は必ず主役にする
 * - 主役と言及の両方に入った企業は主役のみ
 */
export function decideTags(ai: { subjects?: unknown; mentioned?: unknown } | undefined, allowed: Set<string>, forcedSubject?: string | null): TagDecision {
  const norm = (v: unknown) => [...new Set((Array.isArray(v) ? v : []).map((x) => String(x).trim().toLowerCase()).filter((x) => allowed.has(x)))];
  const subjects = norm(ai?.subjects);
  if (forcedSubject && allowed.has(forcedSubject) && !subjects.includes(forcedSubject)) subjects.unshift(forcedSubject);
  const mentioned = norm(ai?.mentioned).filter((m) => !subjects.includes(m));
  return { subjects, mentioned };
}

const SYSTEM = `あなたはAIニュースの編集者です。各ニュースについて、追跡中の企業のうち
- subjects: そのニュースの主役（発表・行動・取引・訴訟などの当事者）である企業
- mentioned: 比較対象・競合として名前が出ただけ、または製品が言及されただけの企業
を企業IDで答えてください。該当がなければ空の配列にします。
判断の基準:
- 他社の製品を使った事例は、発表した企業が主役。使われた製品の企業は、提携・採用そのものがニュースなら主役、背景の説明なら言及。
- 「〜と競合」「〜より高い」など比較で出ただけの企業は言及。
- 追跡中の企業以外（例：Perplexity、Thinking Machines）は答えに含めない。`;

const TOOL: Anthropic.Tool = {
  name: "save_tags",
  description: "企業の紐付け結果を保存する",
  input_schema: {
    type: "object",
    properties: {
      items: {
        type: "array",
        items: {
          type: "object",
          properties: {
            story_id: { type: "integer" },
            subjects: { type: "array", items: { type: "string" } },
            mentioned: { type: "array", items: { type: "string" } },
          },
          required: ["story_id", "subjects", "mentioned"],
        },
      },
    },
    required: ["items"],
  },
};

type Row = { id: number; title: string; summary: string | null; excerpt: string | null; source: string | null; source_company: string | null; source_type: string | null };

async function tagBatch(client: Anthropic, rows: Row[], companies: { id: number; slug: string; name: string }[]) {
  const list = companies.map((c) => `${c.slug}: ${c.name}`).join("\n");
  const doc = rows
    .map((r) => `[ID ${r.id}] 情報源: ${r.source ?? "不明"}${r.source_type === "official" && r.source_company ? `（${r.source_company} の公式）` : ""}\n見出し: ${r.title}\n内容: ${(r.summary || r.excerpt || "").slice(0, 300)}`)
    .join("\n\n");
  const res = await callClaude(client, "tagging", {
    model: SUMMARY_MODEL,
    max_tokens: 4000,
    system: SYSTEM,
    tools: [TOOL],
    tool_choice: { type: "tool", name: "save_tags" },
    messages: [{ role: "user", content: `■ 追跡中の企業（ID: 名前）\n${list}\n\n■ ニュース（${rows.length}件。すべて答えてください）\n${doc}` }],
  });
  const { items } = toolInput<{ items: { story_id: number; subjects: string[]; mentioned: string[] }[] }>(res);
  const byId = new Map((Array.isArray(items) ? items : []).map((i) => [Number(i.story_id), i]));
  const slugToId = new Map(companies.map((c) => [c.slug, c.id]));
  const allowed = new Set(companies.map((c) => c.slug));
  let changed = 0;
  for (const r of rows) {
    const ai = byId.get(r.id);
    if (!ai) continue; // 答えがなかったものは未判定のまま次回に回す
    const forced = r.source_type === "official" ? r.source_company : null;
    const d = decideTags(ai, allowed, forced);
    const [before] = await q<{ n: number }>("SELECT count(*)::int AS n FROM story_companies WHERE story_id=$1", [r.id]);
    await q("DELETE FROM story_companies WHERE story_id=$1", [r.id]);
    await q("DELETE FROM story_mentions WHERE story_id=$1", [r.id]);
    for (const s of d.subjects) await q("INSERT INTO story_companies (story_id, company_id) VALUES ($1,$2) ON CONFLICT DO NOTHING", [r.id, slugToId.get(s)]);
    for (const m of d.mentioned) await q("INSERT INTO story_mentions (story_id, company_id) VALUES ($1,$2) ON CONFLICT DO NOTHING", [r.id, slugToId.get(m)]);
    await q("UPDATE stories SET tagged_at=now(), tag_model=$2 WHERE id=$1", [r.id, SUMMARY_MODEL]);
    if (before.n !== d.subjects.length || d.mentioned.length) changed++;
  }
  return { done: byId.size, changed };
}

/** 未判定のニュースをまとめて判定（1回あたり最大 limit 件） */
export async function runTagging(trigger = "manual", limit = 200) {
  const runId = await startJob("tagging", trigger);
  const stats = { target: 0, done: 0, changed: 0, failed_batches: 0 };
  if (!process.env.ANTHROPIC_API_KEY) {
    await finishJob(runId, "failed", { ...stats, skipped_no_key: true });
    return stats;
  }
  const companies = await q<{ id: number; slug: string; name: string }>("SELECT id, slug, name FROM companies WHERE is_tracked ORDER BY sort_order");
  const rows = await q<Row>(
    `SELECT s.id, coalesce(s.title_ja, s.representative_title) AS title, s.summary_ja AS summary,
            (SELECT a.excerpt FROM articles a WHERE a.story_id=s.id ORDER BY a.published_at LIMIT 1) AS excerpt,
            (SELECT src.name FROM articles a JOIN sources src ON src.id=a.source_id WHERE a.story_id=s.id ORDER BY (src.source_type='official') DESC LIMIT 1) AS source,
            (SELECT src.source_type FROM articles a JOIN sources src ON src.id=a.source_id WHERE a.story_id=s.id ORDER BY (src.source_type='official') DESC LIMIT 1) AS source_type,
            (SELECT c.slug FROM articles a JOIN sources src ON src.id=a.source_id JOIN companies c ON c.id=src.company_id
              WHERE a.story_id=s.id AND src.source_type='official' LIMIT 1) AS source_company
       FROM stories s
      WHERE NOT s.is_demo AND s.tagged_at IS NULL
      ORDER BY coalesce(s.first_published_at, s.created_at) DESC LIMIT $1`,
    [limit],
  );
  stats.target = rows.length;
  const client = new Anthropic();
  for (let i = 0; i < rows.length; i += BATCH) {
    try {
      const r = await tagBatch(client, rows.slice(i, i + BATCH), companies);
      stats.done += r.done;
      stats.changed += r.changed;
    } catch (e) {
      stats.failed_batches++;
      await logJobError(runId, `batch:${i}`, errMsg(e));
    }
  }
  await finishJob(runId, stats.failed_batches ? (stats.done ? "partial" : "failed") : "success", stats);
  return stats;
}
