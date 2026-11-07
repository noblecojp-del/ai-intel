// 人物の発言：記事から抽出（直接引用は原文と照合）→ 人物ごとのAI分析（事実・分析・予測を区別）
import Anthropic from "@anthropic-ai/sdk";
import { q } from "./db";
import { errMsg, finishJob, logJobError, startJob } from "./jobs";
import { callClaude, toolInput } from "./usage";
import { SUMMARY_MODEL } from "./ai";
import { ANALYSIS_MODEL } from "./brief";

export type Person = {
  id: number; slug: string; name: string; name_ja: string | null; role: string | null; role_checked_on: string | null;
  company_slug: string | null; aliases: string[]; is_tracked: boolean; sort_order: number;
};

// ---------- 照合（純粋関数。テスト対象） ----------

const norm = (s: string) =>
  s.normalize("NFKC").replace(/[“”„‟"]/g, '"').replace(/[‘’‚‛']/g, "'").replace(/[—–]/g, "-").replace(/\s+/g, " ").trim().toLowerCase();

/** 引用が原文（タイトル・抜粋）にそのまま含まれるか。前後の引用符・末尾の句読点の違いは許容 */
export function quoteFoundIn(quote: string, sourceText: string): boolean {
  const qn = norm(quote).replace(/^["'「『]+|["'」』]+$/g, "").replace(/[.,。、!?…]+$/, "").trim();
  if (qn.length < 12) return false; // 短すぎる引用は照合の意味が薄いので「報道」とする
  return norm(sourceText).includes(qn);
}

/** 記事に人物の表記が出てくるか（抽出の前段のふるい） */
export function mentionsPerson(text: string, aliases: string[]): boolean {
  const t = ` ${text} `;
  return aliases.some((a) => {
    const k = a.trim();
    if (!k) return false;
    if (/^[A-Za-z .'-]+$/.test(k)) return new RegExp(`(^|[^A-Za-z])${k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^A-Za-z]|$)`).test(t);
    return t.includes(k);
  });
}

// ---------- 発言の抽出 ----------

const EXTRACT_SYSTEM = `あなたはAIニュースの編集者です。記事のタイトルと抜粋から、指定した人物「本人の」発言だけを抜き出します。
- 本人が言ったこと（発言・投稿・インタビュー・講演）だけ。人物について他人が述べたこと、人物の行動の説明は含めない。
- kind は、抜粋に引用符などで本人の言葉がそのまま載っていれば "direct_quote"、記者による要約・言い換えなら "reported"。
- direct_quote の quote には、抜粋に書かれている原文の言葉を一字一句そのまま入れる（翻訳・要約しない。英語ならそのまま英語）。
- summary_ja は発言内容の日本語要約（80字以内）。記事に書かれていないことを補わない。
- topic は「AGI・安全性」「計算資源・半導体」「雇用・社会」「規制・政策」「製品・戦略」「資金・事業」「研究」「その他」から1つ。
- 発言がなければ statements は空。`;

const EXTRACT_TOOL: Anthropic.Tool = {
  name: "save_statements",
  description: "発言の抽出結果を保存する",
  input_schema: {
    type: "object",
    properties: {
      items: {
        type: "array",
        items: {
          type: "object",
          properties: {
            story_id: { type: "integer" },
            statements: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  person: { type: "string", description: "人物ID" },
                  kind: { type: "string", enum: ["direct_quote", "reported"] },
                  quote: { type: "string" },
                  summary_ja: { type: "string" },
                  topic: { type: "string" },
                },
                required: ["person", "kind", "summary_ja", "topic"],
              },
            },
          },
          required: ["story_id", "statements"],
        },
      },
    },
    required: ["items"],
  },
};

type Cand = { id: number; title: string; title_ja: string | null; summary: string | null; text: string; at: string | null; people: Person[] };

async function extractBatch(client: Anthropic, cands: Cand[]) {
  const doc = cands
    .map((c) => `[ID ${c.id}] 対象人物: ${c.people.map((p) => `${p.slug}（${p.name}）`).join("、")}\nタイトル: ${c.title}\n抜粋: ${c.text.slice(0, 1200)}`)
    .join("\n\n");
  const res = await callClaude(client, "statements", {
    model: SUMMARY_MODEL,
    max_tokens: 4000,
    system: EXTRACT_SYSTEM,
    tools: [EXTRACT_TOOL],
    tool_choice: { type: "tool", name: "save_statements" },
    messages: [{ role: "user", content: `${cands.length}件の記事です。すべて答えてください。\n\n${doc}` }],
  });
  const { items } = toolInput<{ items: { story_id: number; statements: any[] }[] }>(res);
  const byId = new Map((Array.isArray(items) ? items : []).map((i) => [Number(i.story_id), i]));
  let saved = 0, quotes = 0, dropped = 0;
  for (const c of cands) {
    const it = byId.get(c.id);
    if (!it) continue; // 答えがなければ次回に回す
    await q("DELETE FROM statements WHERE story_id=$1", [c.id]);
    for (const st of Array.isArray(it.statements) ? it.statements : []) {
      const person = c.people.find((p) => p.slug === String(st.person ?? "").toLowerCase());
      if (!person || !st.summary_ja) continue;
      // 直接引用と答えたのに原文に見つからない発言は、要約も信頼できないため保存しない
      const claimedQuote = st.kind === "direct_quote";
      const isQuote = claimedQuote && typeof st.quote === "string" && quoteFoundIn(st.quote, `${c.title} ${c.text}`);
      if (claimedQuote && !isQuote) { dropped++; continue; }
      await q(
        `INSERT INTO statements (person_id, story_id, kind, quote, summary_ja, topic, said_at, model) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [person.id, c.id, isQuote ? "direct_quote" : "reported", isQuote ? String(st.quote).slice(0, 300) : null,
         String(st.summary_ja).slice(0, 300), st.topic ?? "その他", c.at, SUMMARY_MODEL],
      );
      saved++;
      if (isQuote) quotes++;
    }
    await q("UPDATE stories SET people_checked_at=now() WHERE id=$1", [c.id]);
  }
  return { saved, quotes, dropped, done: byId.size };
}

/** 未確認のニュースから人物の発言を抽出（人物名が出てこない記事はAPIを使わず確認済みにする） */
export async function runStatements(trigger = "manual", limit = 300) {
  const runId = await startJob("statements", trigger);
  const stats = { checked: 0, candidates: 0, saved: 0, direct_quotes: 0, dropped_unverified: 0, failed_batches: 0 };
  if (!process.env.ANTHROPIC_API_KEY) {
    await finishJob(runId, "failed", { ...stats, skipped_no_key: true });
    return stats;
  }
  const people = await q<Person>("SELECT * FROM people WHERE is_tracked ORDER BY sort_order");
  const rows = await q<any>(
    `SELECT s.id, s.representative_title AS title, s.title_ja, s.summary_ja AS summary, coalesce(s.first_published_at, s.created_at) AS at,
            coalesce((SELECT string_agg(a.title || ' ' || coalesce(a.excerpt,''), ' / ') FROM articles a WHERE a.story_id=s.id), '') AS text
       FROM stories s WHERE NOT s.is_demo AND s.people_checked_at IS NULL
      ORDER BY coalesce(s.first_published_at, s.created_at) DESC LIMIT $1`,
    [limit],
  );
  stats.checked = rows.length;
  const cands: Cand[] = [];
  for (const r of rows) {
    const hay = `${r.title} ${r.title_ja ?? ""} ${r.summary ?? ""} ${r.text}`;
    const ps = people.filter((p) => mentionsPerson(hay, p.aliases.length ? p.aliases : [p.name]));
    if (ps.length) cands.push({ ...r, people: ps });
    else await q("UPDATE stories SET people_checked_at=now() WHERE id=$1", [r.id]);
  }
  stats.candidates = cands.length;
  const client = new Anthropic();
  for (let i = 0; i < cands.length; i += 10) {
    try {
      const r = await extractBatch(client, cands.slice(i, i + 10));
      stats.saved += r.saved;
      stats.direct_quotes += r.quotes;
      stats.dropped_unverified += r.dropped;
    } catch (e) {
      stats.failed_batches++;
      await logJobError(runId, `batch:${i}`, errMsg(e));
    }
  }
  await finishJob(runId, stats.failed_batches ? "partial" : "success", stats);
  return stats;
}

// ---------- 人物ごとの分析 ----------

export type PersonAnalysis = {
  recent_summary: { text: string; statement_ids: number[] }[];   // 事実：最近の発言の要約
  background: string;                                            // 分析：発言の背景
  vs_past: string;                                               // 事実ベース：過去の発言との比較
  vs_others: { text: string; statement_ids: number[] }[];        // 分析：他社の見解との違い
  industry_impact: string;                                       // 予測：業界への影響の可能性
  missing_info: string[];
};

const ANALYSIS_SYSTEM = `あなたはAI業界のアナリストです。指定した人物の発言を、経営者向けに日本語で分析します。
材料は「本人の発言一覧」「関連ニュース」「他の人物の発言」だけです。
- recent_summary は直近30日の発言の要点（事実）。各項目に根拠の発言IDを入れる。
- background は発言の背景（関連ニュースに基づく分析。推論と分かる表現で）。
- vs_past は、30日より前の発言と比べた変化。古い発言がなければ「比較できる過去の発言がまだ収集されていません」と書く。
- vs_others は、同じテーマでの他の人物の発言との違い（分析）。根拠の発言IDを入れる。該当がなければ空。
- industry_impact は今後の業界への影響の可能性（予測。断定しない）。
- 「報道」の発言は記者の要約であり本人の正確な言葉ではない点に注意し、直接引用と区別して扱う。
- 材料にない発言・数字・出来事を作らない。判断できない点は missing_info に書く。`;

const ANALYSIS_TOOL: Anthropic.Tool = {
  name: "save_person_analysis",
  description: "人物分析を保存する",
  input_schema: {
    type: "object",
    properties: {
      recent_summary: { type: "array", items: { type: "object", properties: { text: { type: "string" }, statement_ids: { type: "array", items: { type: "integer" } } }, required: ["text", "statement_ids"] } },
      background: { type: "string" },
      vs_past: { type: "string" },
      vs_others: { type: "array", items: { type: "object", properties: { text: { type: "string" }, statement_ids: { type: "array", items: { type: "integer" } } }, required: ["text", "statement_ids"] } },
      industry_impact: { type: "string" },
      missing_info: { type: "array", items: { type: "string" } },
    },
    required: ["recent_summary", "background", "vs_past", "vs_others", "industry_impact", "missing_info"],
  },
};

const fmtSt = (s: any) =>
  `[発言ID ${s.id}] ${s.said_at ? new Date(s.said_at).toISOString().slice(0, 10) : "日付不明"}｜${s.kind === "direct_quote" ? "直接引用" : "報道"}｜${s.topic ?? ""}｜${s.summary_ja}${s.quote ? `（原文: "${s.quote}"）` : ""}`;

export async function analyzePerson(client: Anthropic, person: Person) {
  const own = await q<any>("SELECT * FROM statements WHERE person_id=$1 ORDER BY said_at DESC NULLS LAST LIMIT 40", [person.id]);
  if (!own.length) return { status: "skipped" as const };
  const recentCut = Date.now() - 30 * 864e5;
  const recent = own.filter((s) => s.said_at && new Date(s.said_at).getTime() >= recentCut);
  if (!recent.length) return { status: "skipped" as const };
  const past = own.filter((s) => !recent.includes(s));
  const topics = [...new Set(recent.map((s) => s.topic))];
  const others = await q<any>(
    `SELECT st.*, p.name AS person_name FROM statements st JOIN people p ON p.id=st.person_id
      WHERE st.person_id <> $1 AND st.topic = ANY($2::text[]) AND st.said_at > now() - interval '60 days'
      ORDER BY st.said_at DESC LIMIT 25`,
    [person.id, topics],
  );
  const news = await q<any>(
    `SELECT coalesce(s.title_ja, s.representative_title) AS title, s.summary_ja FROM stories s
      WHERE s.id = ANY($1::int[])`,
    [recent.map((s) => s.story_id)],
  );
  const doc = [
    `■ 人物: ${person.name}（${person.role ?? "役職未設定"}）`,
    "", "■ 本人の発言（直近30日）", ...recent.map(fmtSt),
    "", "■ 本人の発言（30日より前）", ...(past.length ? past.map(fmtSt) : ["（なし）"]),
    "", "■ 関連ニュース", ...news.map((n) => `- ${n.title}${n.summary_ja ? `：${n.summary_ja.slice(0, 150)}` : ""}`),
    "", "■ 同じテーマでの他の人物の発言", ...(others.length ? others.map((o) => `${o.person_name} ${fmtSt(o)}`) : ["（なし）"]),
  ].join("\n");
  const res = await callClaude(client, "person-analysis", {
    model: ANALYSIS_MODEL,
    max_tokens: 8000,
    system: ANALYSIS_SYSTEM,
    tools: [ANALYSIS_TOOL],
    tool_choice: { type: "tool", name: "save_person_analysis" },
    messages: [{ role: "user", content: doc }],
  });
  const a = toolInput<PersonAnalysis>(res);
  const valid = new Set([...own, ...others].map((s) => s.id as number));
  let removed = 0;
  const clean = (ids: unknown) => {
    const arr = Array.isArray(ids) ? ids.map(Number) : [];
    const ok = [...new Set(arr.filter((i) => valid.has(i)))];
    removed += arr.length - arr.filter((i) => valid.has(i)).length;
    return ok;
  };
  const payload: PersonAnalysis = {
    ...a,
    recent_summary: (a.recent_summary ?? []).map((r) => ({ ...r, statement_ids: clean(r.statement_ids) })),
    vs_others: (a.vs_others ?? []).map((r) => ({ ...r, statement_ids: clean(r.statement_ids) })),
    missing_info: a.missing_info ?? [],
  };
  await q(
    "INSERT INTO analyses (kind, period_start, period_end, model, payload, check_note) VALUES ($1, now() - interval '30 days', now(), $2, $3, $4)",
    [`person:${person.slug}`, ANALYSIS_MODEL, JSON.stringify(payload), removed ? `材料にない発言ID ${removed}件を除外しました` : null],
  );
  return { status: "published" as const };
}

/** 直近7日に新しい発言があった人物だけ分析を更新（費用を抑える）。slug 指定時はその人物のみ */
export async function runPersonAnalyses(trigger = "manual", slug?: string) {
  const runId = await startJob("person-analysis", trigger);
  const stats = { target: 0, published: 0, skipped: 0, failed: 0 };
  if (!process.env.ANTHROPIC_API_KEY) {
    await finishJob(runId, "failed", stats);
    return stats;
  }
  const people = await q<Person>(
    slug
      ? "SELECT * FROM people WHERE slug=$1"
      : `SELECT p.* FROM people p WHERE p.is_tracked AND EXISTS (
           SELECT 1 FROM statements s WHERE s.person_id=p.id AND s.created_at > now() - interval '7 days') ORDER BY p.sort_order`,
    slug ? [slug] : [],
  );
  stats.target = people.length;
  const client = new Anthropic();
  for (const p of people) {
    try {
      const r = await analyzePerson(client, p);
      if (r.status === "published") stats.published++; else stats.skipped++;
    } catch (e) {
      stats.failed++;
      await logJobError(runId, `person:${p.slug}`, errMsg(e));
    }
  }
  await finishJob(runId, stats.failed ? (stats.published ? "partial" : "failed") : "success", stats);
  return stats;
}

// ---------- 表示用 ----------

export async function listPeople() {
  return q<any>(`
    SELECT p.*, c.name AS company_name,
      (SELECT count(*)::int FROM statements s WHERE s.person_id=p.id AND s.said_at > now() - interval '30 days') AS n30,
      (SELECT count(*)::int FROM statements s WHERE s.person_id=p.id AND s.kind='direct_quote') AS n_quotes,
      (SELECT row_to_json(x) FROM (SELECT s.summary_ja, s.kind, s.said_at, s.topic FROM statements s WHERE s.person_id=p.id ORDER BY s.said_at DESC NULLS LAST LIMIT 1) x) AS latest
    FROM people p LEFT JOIN companies c ON c.slug=p.company_slug
    WHERE p.is_tracked ORDER BY p.sort_order`);
}

export async function getPerson(slug: string) {
  const [p] = await q<any>("SELECT p.*, c.name AS company_name FROM people p LEFT JOIN companies c ON c.slug=p.company_slug WHERE p.slug=$1", [slug]);
  if (!p) return null;
  const statements = await q<any>(
    `SELECT st.*, coalesce(s.title_ja, s.representative_title) AS story_title,
            (SELECT a.url FROM articles a LEFT JOIN sources src ON src.id=a.source_id WHERE a.story_id=st.story_id ORDER BY (src.source_type='official') DESC LIMIT 1) AS url,
            (SELECT src.name FROM articles a JOIN sources src ON src.id=a.source_id WHERE a.story_id=st.story_id LIMIT 1) AS source_name
       FROM statements st JOIN stories s ON s.id=st.story_id
      WHERE st.person_id=$1 ORDER BY st.said_at DESC NULLS LAST LIMIT 100`,
    [p.id],
  );
  const [analysis] = await q<any>("SELECT * FROM analyses WHERE kind=$1 AND status='published' ORDER BY generated_at DESC LIMIT 1", [`person:${slug}`]);
  const topics = await q<any>("SELECT topic, count(*)::int AS n FROM statements WHERE person_id=$1 GROUP BY 1 ORDER BY 2 DESC", [p.id]);
  return { person: p, statements, analysis: analysis ?? null, topics };
}

/** 分析で参照された発言ID → 人物名・要約（他の人物の発言も含む） */
export async function statementsByIds(ids: number[]) {
  if (!ids.length) return new Map<number, any>();
  const rows = await q<any>(
    "SELECT st.id, st.summary_ja, st.kind, st.story_id, p.name AS person_name, p.slug FROM statements st JOIN people p ON p.id=st.person_id WHERE st.id = ANY($1::int[])",
    [ids],
  );
  return new Map(rows.map((r) => [r.id as number, r]));
}
