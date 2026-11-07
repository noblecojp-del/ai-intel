// YouTube：公式チャンネルの公開フィード（RSS）から動画情報を取得し、タイトルと概要欄だけを根拠に要約する。
// 字幕・音声は取得しない（他者の動画の字幕は公式APIでは取得できないため）。
import Anthropic from "@anthropic-ai/sdk";
import Parser from "rss-parser";
import { q } from "./db";
import { errMsg, finishJob, logJobError, startJob, withRetry } from "./jobs";
import { callClaude, toolInput } from "./usage";
import { SUMMARY_MODEL } from "./ai";
import { titleTokens, jaccard } from "./dedupe";

const FEED_BASE = process.env.YOUTUBE_FEED_BASE || "https://www.youtube.com/feeds/videos.xml?channel_id=";
const PAGE_BASE = process.env.YOUTUBE_PAGE_BASE || "https://www.youtube.com/";
const MAX_AGE_DAYS = 90;
export const VIDEO_THEMES = ["モデル・製品発表", "研究・技術", "経営者・インタビュー", "安全性・政策", "活用事例", "イベント・基調講演", "その他"] as const;

// ---------- 純粋関数（テスト対象） ----------

/** 入力（URL / @ハンドル / UC... のID）からチャンネルIDまたはハンドルを取り出す */
export function parseChannelInput(input: string): { channelId?: string; handle?: string } {
  const s = input.trim();
  const id = s.match(/(UC[A-Za-z0-9_-]{22})/);
  if (id) return { channelId: id[1] };
  const h = s.match(/@([A-Za-z0-9._-]+)/);
  if (h) return { handle: `@${h[1]}` };
  return {};
}

/** チャンネルページのHTMLからチャンネルIDを取り出す */
export function extractChannelIdFromHtml(html: string): string | null {
  const pats = [
    /<link rel="canonical" href="https:\/\/www\.youtube\.com\/channel\/(UC[A-Za-z0-9_-]{22})"/,
    /"externalId":"(UC[A-Za-z0-9_-]{22})"/,
    /"channelId":"(UC[A-Za-z0-9_-]{22})"/,
    /<meta itemprop="identifier" content="(UC[A-Za-z0-9_-]{22})"/,
  ];
  for (const p of pats) {
    const m = html.match(p);
    if (m) return m[1];
  }
  return null;
}

/** 動画に関連しそうなニュース：同じ企業・前後7日以内・タイトルの語の重なり */
export function relatedScore(videoTitle: string, storyTitle: string): number {
  return jaccard(titleTokens(videoTitle), titleTokens(storyTitle));
}

// ---------- 取得 ----------

async function fetchText(url: string): Promise<string> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch(url, { headers: { "User-Agent": "AI-Intel-Bot/0.1 (+RSS reader)", "Accept-Language": "en" }, signal: ctrl.signal, cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

/** ハンドルからチャンネルIDを解決。APIキーがあれば公式API、なければチャンネルページから読み取る */
export async function resolveChannelId(handle: string): Promise<string> {
  const key = process.env.YOUTUBE_API_KEY;
  if (key) {
    const r = JSON.parse(await fetchText(`https://www.googleapis.com/youtube/v3/channels?part=id&forHandle=${encodeURIComponent(handle)}&key=${key}`));
    const id = r.items?.[0]?.id;
    if (id) return id;
    throw new Error(`ハンドル ${handle} のチャンネルが見つかりません`);
  }
  const id = extractChannelIdFromHtml(await fetchText(`${PAGE_BASE}${handle}`));
  if (!id) throw new Error(`ハンドル ${handle} からチャンネルIDを読み取れませんでした（管理画面でUCから始まるIDを直接入力してください）`);
  return id;
}

type FeedItem = Parser.Item & { id?: string; "yt:videoId"?: string; videoId?: string; mediaGroup?: any };

const parser = new Parser<{}, FeedItem>({ customFields: { item: [["yt:videoId", "videoId"], ["media:group", "mediaGroup"]] } });

export async function fetchChannelVideos(channelId: string) {
  const feed = await parser.parseString(await withRetry(() => fetchText(`${FEED_BASE}${channelId}`)));
  return (feed.items ?? []).map((it) => {
    const vid = it.videoId || String(it.id ?? "").replace(/^yt:video:/, "");
    const g = it.mediaGroup ?? {};
    const desc = g["media:description"]?.[0] ?? "";
    const thumb = g["media:thumbnail"]?.[0]?.$?.url ?? `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`;
    return {
      video_id: vid,
      title: (it.title ?? "").trim(),
      description: String(typeof desc === "string" ? desc : desc?._ ?? "").slice(0, 2000),
      published_at: it.isoDate || it.pubDate || null,
      thumbnail_url: thumb,
      url: `https://www.youtube.com/watch?v=${vid}`,
    };
  }).filter((v) => v.video_id && v.title);
}

// ---------- 要約 ----------

const SYSTEM = `あなたはAI業界ニュースの編集者です。YouTube動画の「タイトルと概要欄」だけを根拠に、日本語で整理します。
動画の中身（字幕・音声）は見ていません。概要欄に書かれていないことを推測で補わないでください。
- is_ai_related: AI（モデル、研究、AIインフラ、AI活用、AI企業の経営）に関する動画なら true。ゲームや一般製品の宣伝など無関係なら false。
- title_ja: 日本語のタイトル（40字程度）。
- summary_ja: 概要欄から分かる内容の要約（120字程度）。概要欄が短い・空なら「概要欄に詳しい説明はありません」とし、タイトルから分かる範囲だけ書く。
- key_points: 概要欄に書かれている主な内容（チャプターや話題）を最大4件。なければ空。
- themes: ${VIDEO_THEMES.join("、")} から1〜2個。
- people: 登場が概要欄・タイトルで明示されている人物の人物ID（一覧にある人物のみ）。`;

const TOOL: Anthropic.Tool = {
  name: "save_videos",
  description: "動画の整理結果を保存する",
  input_schema: {
    type: "object",
    properties: {
      items: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "integer" },
            is_ai_related: { type: "boolean" },
            title_ja: { type: "string" },
            summary_ja: { type: "string" },
            key_points: { type: "array", items: { type: "string" } },
            themes: { type: "array", items: { type: "string", enum: [...VIDEO_THEMES] } },
            people: { type: "array", items: { type: "string" } },
          },
          required: ["id", "is_ai_related", "title_ja", "summary_ja", "key_points", "themes", "people"],
        },
      },
    },
    required: ["items"],
  },
};

async function summarizeBatch(client: Anthropic, rows: any[], people: { slug: string; name: string }[]) {
  const doc = rows.map((r) => `[ID ${r.id}] チャンネル: ${r.channel}\nタイトル: ${r.title}\n概要欄: ${(r.description || "（なし）").slice(0, 1500)}`).join("\n\n");
  const res = await callClaude(client, "videos", {
    model: SUMMARY_MODEL,
    max_tokens: 6000,
    system: SYSTEM,
    tools: [TOOL],
    tool_choice: { type: "tool", name: "save_videos" },
    messages: [{ role: "user", content: `■ 人物一覧（ID: 名前）\n${people.map((p) => `${p.slug}: ${p.name}`).join("\n")}\n\n■ 動画（${rows.length}件。すべて答えてください）\n${doc}` }],
  });
  const { items } = toolInput<{ items: any[] }>(res);
  const allowedPeople = new Set(people.map((p) => p.slug));
  const allowedThemes = new Set<string>(VIDEO_THEMES);
  let done = 0;
  for (const it of Array.isArray(items) ? items : []) {
    const row = rows.find((r) => r.id === Number(it.id));
    if (!row) continue;
    await q(
      `UPDATE videos SET is_ai_related=$2, title_ja=$3, summary_ja=$4, key_points=$5, themes=$6, people_slugs=$7, summary_model=$8, summarized_at=now() WHERE id=$1`,
      [row.id, !!it.is_ai_related, String(it.title_ja ?? "").slice(0, 120), String(it.summary_ja ?? "").slice(0, 400),
       JSON.stringify((Array.isArray(it.key_points) ? it.key_points : []).slice(0, 4).map(String)),
       (Array.isArray(it.themes) ? it.themes : []).filter((t: string) => allowedThemes.has(t)).slice(0, 2),
       (Array.isArray(it.people) ? it.people : []).map((s: string) => String(s).toLowerCase()).filter((s: string) => allowedPeople.has(s)),
       SUMMARY_MODEL],
    );
    done++;
  }
  return done;
}

// ---------- ジョブ ----------

export async function runVideos(trigger = "manual") {
  const runId = await startJob("videos", trigger);
  const stats = { channels: 0, ok: 0, failed: 0, fetched: 0, added: 0, summarized: 0 };
  const channels = await q<any>("SELECT * FROM video_channels WHERE is_active ORDER BY id");
  stats.channels = channels.length;
  for (const ch of channels) {
    try {
      let cid = ch.channel_id as string | null;
      if (!cid && ch.handle) {
        cid = await resolveChannelId(ch.handle);
        await q("UPDATE video_channels SET channel_id=$2 WHERE id=$1", [ch.id, cid]);
      }
      if (!cid) throw new Error("チャンネルIDが未設定です");
      const vids = await fetchChannelVideos(cid);
      stats.fetched += vids.length;
      for (const v of vids) {
        if (v.published_at && Date.now() - new Date(v.published_at).getTime() > MAX_AGE_DAYS * 864e5) continue;
        const r = await q(
          `INSERT INTO videos (channel_ref, video_id, title, description, published_at, thumbnail_url, url)
           VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (video_id) DO NOTHING RETURNING id`,
          [ch.id, v.video_id, v.title, v.description, v.published_at, v.thumbnail_url, v.url],
        );
        if (r.length) stats.added++;
      }
      stats.ok++;
      await q("UPDATE video_channels SET last_fetched_at=now(), last_status='ok', last_error=NULL WHERE id=$1", [ch.id]);
    } catch (e) {
      stats.failed++;
      await logJobError(runId, `channel:${ch.id} ${ch.name}`, errMsg(e));
      await q("UPDATE video_channels SET last_fetched_at=now(), last_status='error', last_error=$2 WHERE id=$1", [ch.id, errMsg(e).slice(0, 500)]);
    }
  }
  if (process.env.ANTHROPIC_API_KEY) {
    const people = await q<{ slug: string; name: string }>("SELECT slug, name FROM people WHERE is_tracked ORDER BY sort_order");
    const rows = await q<any>(
      `SELECT v.id, v.title, v.description, c.name AS channel FROM videos v JOIN video_channels c ON c.id=v.channel_ref
        WHERE v.summarized_at IS NULL ORDER BY v.published_at DESC NULLS LAST LIMIT 60`,
    );
    const client = new Anthropic();
    for (let i = 0; i < rows.length; i += 12) {
      try {
        stats.summarized += await summarizeBatch(client, rows.slice(i, i + 12), people);
      } catch (e) {
        await logJobError(runId, `summary:${i}`, errMsg(e));
      }
    }
  }
  await finishJob(runId, stats.failed === 0 ? "success" : stats.ok > 0 ? "partial" : "failed", stats);
  return stats;
}

// ---------- 表示用 ----------

const VIDEO_SELECT = `
  SELECT v.*, c.name AS channel_name, c.kind AS channel_kind, c.company_slug, co.name AS company_name
    FROM videos v JOIN video_channels c ON c.id=v.channel_ref LEFT JOIN companies co ON co.slug=c.company_slug`;

export async function listVideos(f: { company?: string; theme?: string; person?: string; limit?: number } = {}) {
  const where = ["coalesce(v.is_ai_related, TRUE)"];
  const p: unknown[] = [];
  if (f.company) { p.push(f.company); where.push(`c.company_slug = $${p.length}`); }
  if (f.theme) { p.push(f.theme); where.push(`$${p.length} = ANY(v.themes)`); }
  if (f.person) { p.push(f.person); where.push(`$${p.length} = ANY(v.people_slugs)`); }
  p.push(f.limit ?? 60);
  return q<any>(`${VIDEO_SELECT} WHERE ${where.join(" AND ")} ORDER BY v.published_at DESC NULLS LAST LIMIT $${p.length}`, p);
}

export async function getVideo(id: number) {
  const [v] = await q<any>(`${VIDEO_SELECT} WHERE v.id=$1`, [id]);
  if (!v) return null;
  // 関連ニュース：同じ企業（または登場人物の企業）で前後7日、タイトルの語が重なるもの
  const companySlugs = [v.company_slug, ...(await q<any>("SELECT company_slug FROM people WHERE slug = ANY($1::text[])", [v.people_slugs])).map((r) => r.company_slug)].filter(Boolean);
  const cands = v.published_at
    ? await q<any>(
        `SELECT DISTINCT s.id, coalesce(s.title_ja, s.representative_title) AS title, s.representative_title, s.first_published_at
           FROM stories s JOIN story_companies sc ON sc.story_id=s.id JOIN companies c ON c.id=sc.company_id
          WHERE NOT s.is_demo AND c.slug = ANY($1::text[])
            AND s.first_published_at BETWEEN $2::timestamptz - interval '7 days' AND $2::timestamptz + interval '7 days'
          LIMIT 80`,
        [companySlugs, v.published_at],
      )
    : [];
  const related = cands
    .map((s) => ({ ...s, score: Math.max(relatedScore(v.title, s.representative_title), relatedScore(v.title_ja ?? "", s.title)) }))
    .filter((s) => s.score >= 0.12)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
  const sameTheme = v.themes?.length
    ? await q<any>(`${VIDEO_SELECT} WHERE v.id <> $1 AND v.themes && $2::text[] AND coalesce(v.is_ai_related, TRUE) ORDER BY v.published_at DESC LIMIT 6`, [id, v.themes])
    : [];
  const people = v.people_slugs?.length ? await q<any>("SELECT slug, name FROM people WHERE slug = ANY($1::text[])", [v.people_slugs]) : [];
  return { video: v, related, sameTheme, people };
}

export async function videosByIds(ids: number[]) {
  if (!ids.length) return [];
  return q<any>(`${VIDEO_SELECT} WHERE v.id = ANY($1::int[]) ORDER BY v.published_at DESC`, [ids]);
}
