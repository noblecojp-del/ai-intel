// 週次の「AI業界の競争状況分析」：直近7日のニュースと前週比、前回の分析を材料に、事実・分析・予測を分けて生成
import Anthropic from "@anthropic-ai/sdk";
import { q } from "./db";
import { errMsg, finishJob, logJobError, startJob } from "./jobs";
import { callClaude, toolInput } from "./usage";
import { ANALYSIS_MODEL } from "./brief";

export type Landscape = {
  headline: string;
  overview: string;                                                // 事実：今週の動きの概要
  company_moves: { company: string; moves: { text: string; story_ids: number[] }[] }[]; // 事実（根拠ニュースID）
  competitive_dynamics: string;                                    // 分析：競争状況
  tech_impact: string;                                             // 分析：新技術の市場への影響
  changes_vs_last_week: string;                                    // 分析：前週からの変化（前回分析と件数比較が根拠）
  japan_use_cases: { title: string; description: string; story_ids: number[] }[]; // 分析：日本企業が検討できる活用
  watch_next: string[];                                            // 予測：今後の注目点
  missing_info: string[];
};

const SYSTEM = `あなたはAI業界の上級アナリストです。経営者向けに、直近1週間のAI業界の競争状況を日本語でまとめます。
材料は「今週のニュース一覧」（当サイトが収集した記事の要約）、「企業別の記事件数（今週・前週）」、「前回の分析」だけです。
厳守事項:
- overview と company_moves は事実のみ。company_moves の各項目には根拠となるニュースIDを story_ids に必ず入れる。
- 材料にない数値・発言・製品名を作らない。記事件数は「当サイトでの収集件数」であり、企業の業績や勢いの指標として断定しない。
- 分析（competitive_dynamics, tech_impact, changes_vs_last_week, japan_use_cases）は推論と分かる表現で書く。
- changes_vs_last_week は前回の分析と件数比較だけを根拠にする。前回の分析がなければ「前回の分析がないため比較できません」と書く。
- japan_use_cases は、今週のニュースに出てきた技術・製品に基づく、日本企業が検討できる活用例を2〜4件。根拠のニュースIDを付ける。
- watch_next は今後1〜3か月の注目点（予測）。
- 判断できない点は missing_info に書く。`;

const TOOL: Anthropic.Tool = {
  name: "save_landscape",
  description: "競争状況分析を保存する",
  input_schema: {
    type: "object",
    properties: {
      headline: { type: "string", description: "今週の見出し（40字程度）" },
      overview: { type: "string", description: "今週の動きの概要（事実、200〜300字）" },
      company_moves: {
        type: "array",
        items: {
          type: "object",
          properties: {
            company: { type: "string" },
            moves: { type: "array", items: { type: "object", properties: { text: { type: "string" }, story_ids: { type: "array", items: { type: "integer" } } }, required: ["text", "story_ids"] } },
          },
          required: ["company", "moves"],
        },
      },
      competitive_dynamics: { type: "string" },
      tech_impact: { type: "string" },
      changes_vs_last_week: { type: "string" },
      japan_use_cases: { type: "array", items: { type: "object", properties: { title: { type: "string" }, description: { type: "string" }, story_ids: { type: "array", items: { type: "integer" } } }, required: ["title", "description", "story_ids"] } },
      watch_next: { type: "array", items: { type: "string" } },
      missing_info: { type: "array", items: { type: "string" } },
    },
    required: ["headline", "overview", "company_moves", "competitive_dynamics", "tech_impact", "changes_vs_last_week", "japan_use_cases", "watch_next", "missing_info"],
  },
};

/** 根拠IDの検証：材料に含まれないIDを取り除き、件数を返す */
export function sanitizeLandscape(l: Landscape, validIds: Set<number>): { landscape: Landscape; removed: number } {
  let removed = 0;
  const clean = (ids: unknown) => {
    const arr = Array.isArray(ids) ? ids.map(Number) : [];
    const ok = arr.filter((i) => validIds.has(i));
    removed += arr.length - ok.length;
    return [...new Set(ok)];
  };
  return {
    landscape: {
      ...l,
      company_moves: (l.company_moves ?? []).map((c) => ({ ...c, moves: (c.moves ?? []).map((m) => ({ ...m, story_ids: clean(m.story_ids) })) })),
      japan_use_cases: (l.japan_use_cases ?? []).map((u) => ({ ...u, story_ids: clean(u.story_ids) })),
      watch_next: l.watch_next ?? [],
      missing_info: l.missing_info ?? [],
    },
    removed,
  };
}

export async function runLandscape(trigger = "manual") {
  const runId = await startJob("landscape", trigger);
  if (!process.env.ANTHROPIC_API_KEY) {
    await logJobError(runId, "config", "ANTHROPIC_API_KEY が未設定です");
    await finishJob(runId, "failed", {});
    return { status: "failed" };
  }
  try {
    const end = new Date();
    const start = new Date(end.getTime() - 7 * 864e5);
    const stories = await q<any>(`
      SELECT s.id, coalesce(s.title_ja, s.representative_title) AS title, s.summary_ja, s.category, s.importance, s.verification,
             coalesce(s.first_published_at, s.created_at) AS at,
             (SELECT string_agg(c.name, ', ') FROM story_companies sc JOIN companies c ON c.id=sc.company_id WHERE sc.story_id=s.id) AS companies
        FROM stories s
       WHERE NOT s.is_demo AND coalesce(s.first_published_at, s.created_at) BETWEEN $1 AND $2
       ORDER BY coalesce(s.importance, 0) DESC, (s.verification='official') DESC, s.first_published_at DESC
       LIMIT 70`, [start, end]);
    if (stories.length < 3) {
      await finishJob(runId, "success", { skipped: "ニュースが少ないため生成しませんでした", stories: stories.length });
      return { status: "skipped" };
    }
    const counts = await q<any>(`
      SELECT c.name,
        count(*) FILTER (WHERE coalesce(s.first_published_at, s.created_at) > now() - interval '7 days')::int AS this_week,
        count(*) FILTER (WHERE coalesce(s.first_published_at, s.created_at) BETWEEN now() - interval '14 days' AND now() - interval '7 days')::int AS last_week
        FROM companies c LEFT JOIN story_companies sc ON sc.company_id=c.id
        LEFT JOIN stories s ON s.id=sc.story_id AND NOT s.is_demo
       WHERE c.is_tracked GROUP BY c.id ORDER BY c.sort_order`);
    const [prev] = await q<any>("SELECT payload, generated_at FROM analyses WHERE kind='landscape' AND status='published' ORDER BY generated_at DESC LIMIT 1");
    const doc = [
      "■ 今週のニュース一覧",
      ...stories.map((s) => `[ID ${s.id}] ${new Date(s.at).toISOString().slice(0, 10)} ${s.companies ?? "企業なし"}｜${s.verification === "official" ? "公式" : s.verification === "reported" ? "複数報道" : "未確認"}｜${s.category ?? "未分類"}\n${s.title}${s.summary_ja ? `：${s.summary_ja.slice(0, 200)}` : ""}`),
      "",
      "■ 企業別の記事件数（当サイトでの収集件数）",
      ...counts.map((c) => `- ${c.name}: 今週 ${c.this_week} / 前週 ${c.last_week}`),
      "",
      "■ 前回の分析",
      prev ? `${new Date(prev.generated_at).toISOString().slice(0, 10)}：${prev.payload?.headline ?? ""}\n${prev.payload?.overview ?? ""}\n${prev.payload?.competitive_dynamics ?? ""}` : "（なし）",
    ].join("\n");

    const res = await callClaude(new Anthropic(), "landscape", {
      model: ANALYSIS_MODEL,
      max_tokens: 12000,
      system: SYSTEM,
      tools: [TOOL],
      tool_choice: { type: "tool", name: "save_landscape" },
      messages: [{ role: "user", content: doc }],
    });
    const raw = toolInput<Landscape>(res);
    const { landscape, removed } = sanitizeLandscape(raw, new Set(stories.map((s) => s.id as number)));
    await q(
      "INSERT INTO analyses (kind, period_start, period_end, model, payload, check_note) VALUES ('landscape',$1,$2,$3,$4,$5)",
      [start, end, ANALYSIS_MODEL, JSON.stringify(landscape), removed ? `材料にない根拠ID ${removed}件を除外しました` : null],
    );
    await finishJob(runId, "success", { stories: stories.length, removed_ids: removed });
    return { status: "published" };
  } catch (e) {
    await logJobError(runId, "landscape", errMsg(e));
    await finishJob(runId, "failed", {});
    return { status: "failed", error: errMsg(e) };
  }
}
