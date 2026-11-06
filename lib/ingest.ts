// ニュース収集ジョブ：有効な情報源のRSSを取得 → 正規化 → 重複統合 → 企業紐付け
import Parser from "rss-parser";
import { q } from "./db";
import { canonicalUrl, findMatchingStory, matchCompanies, normalizeTitle, toExcerpt, WINDOW_HOURS } from "./dedupe";
import { errMsg, finishJob, logJobError, startJob, withRetry } from "./jobs";

const USER_AGENT = "AI-Intel-Bot/0.1 (+RSS reader; respects robots and rate limits)";
const MAX_ITEMS_PER_FEED = 30;
const MAX_AGE_DAYS = 30;

type Source = { id: number; name: string; feed_url: string; source_type: string; company_id: number | null };

async function fetchFeed(url: string): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml" },
      signal: ctrl.signal,
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

export type IngestStats = { sources: number; ok: number; failed: number; fetched: number; added: number; merged: number; skipped: number };

export async function runIngest(trigger = "manual"): Promise<{ runId: number; stats: IngestStats }> {
  const runId = await startJob("ingest", trigger);
  const stats: IngestStats = { sources: 0, ok: 0, failed: 0, fetched: 0, added: 0, merged: 0, skipped: 0 };
  const parser = new Parser();
  const sources = await q<Source>("SELECT id,name,feed_url,source_type,company_id FROM sources WHERE is_active ORDER BY id");
  const companies = await q<{ id: number; keywords: string[] }>("SELECT id, keywords FROM companies WHERE is_tracked");
  stats.sources = sources.length;

  for (const src of sources) {
    try {
      const xml = await withRetry(() => fetchFeed(src.feed_url));
      const feed = await parser.parseString(xml);
      const items = (feed.items ?? []).slice(0, MAX_ITEMS_PER_FEED);
      stats.fetched += items.length;
      for (const item of items) {
        const r = await ingestItem(src, item, companies);
        stats[r]++;
      }
      stats.ok++;
      await q("UPDATE sources SET last_fetched_at=now(), last_status='ok', last_error=NULL WHERE id=$1", [src.id]);
    } catch (e) {
      stats.failed++;
      const msg = errMsg(e);
      await logJobError(runId, `source:${src.id} ${src.name}`, msg);
      await q("UPDATE sources SET last_fetched_at=now(), last_status='error', last_error=$2 WHERE id=$1", [src.id, msg]);
    }
  }

  const status = stats.failed === 0 ? "success" : stats.ok > 0 ? "partial" : "failed";
  await finishJob(runId, status, stats);
  return { runId, stats };
}

async function ingestItem(
  src: Source,
  item: Parser.Item,
  companies: { id: number; keywords: string[] }[],
): Promise<"added" | "merged" | "skipped"> {
  const link = item.link?.trim();
  const title = item.title?.trim();
  if (!link || !title) return "skipped";
  const url = canonicalUrl(link);
  const exists = await q("SELECT 1 FROM articles WHERE url=$1", [url]);
  if (exists.length) return "skipped";

  const pub = item.isoDate ? new Date(item.isoDate) : item.pubDate ? new Date(item.pubDate) : null;
  const publishedAt = pub && !isNaN(pub.getTime()) ? pub : null;
  if (publishedAt && Date.now() - publishedAt.getTime() > MAX_AGE_DAYS * 864e5) return "skipped";

  const excerpt = toExcerpt(item.contentSnippet || item.content || item.summary);

  // 近い期間のstoryと照合して統合
  const ref = publishedAt ?? new Date();
  const candidates = await q<{ id: number; representative_title: string; first_published_at: string | null }>(
    `SELECT id, representative_title, first_published_at FROM stories
     WHERE coalesce(first_published_at, created_at) BETWEEN $1 AND $2`,
    [new Date(ref.getTime() - WINDOW_HOURS * 36e5), new Date(ref.getTime() + WINDOW_HOURS * 36e5)],
  );
  const match = findMatchingStory(
    title,
    publishedAt,
    candidates.map((c) => ({ storyId: c.id, title: c.representative_title, publishedAt: c.first_published_at ? new Date(c.first_published_at) : null })),
  );

  let storyId: number;
  let result: "added" | "merged";
  if (match) {
    storyId = match.storyId;
    result = "merged";
    // 公式発表が加わったら検証状態を引き上げる。要約は統合後に作り直す（手動修正分は除く）
    await q(
      `UPDATE stories SET
         last_article_at = GREATEST(coalesce(last_article_at, $2), $2),
         first_published_at = LEAST(coalesce(first_published_at, $2), $2),
         verification = CASE WHEN $3 = 'official' THEN 'official'
                             WHEN verification = 'unconfirmed' THEN 'reported' ELSE verification END,
         summary_status = CASE WHEN manually_edited THEN summary_status ELSE 'pending' END,
         updated_at = now()
       WHERE id=$1`,
      [storyId, publishedAt ?? new Date(), src.source_type],
    );
  } else {
    const [s] = await q<{ id: number }>(
      `INSERT INTO stories (representative_title, first_published_at, last_article_at, verification)
       VALUES ($1,$2,$2,$3) RETURNING id`,
      [title, publishedAt, src.source_type === "official" ? "official" : "unconfirmed"],
    );
    storyId = s.id;
    result = "added";
  }

  await q(
    `INSERT INTO articles (story_id, source_id, url, title, norm_title, excerpt, published_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (url) DO NOTHING`,
    [storyId, src.id, url, title, normalizeTitle(title), excerpt, publishedAt],
  );

  const ids = new Set(matchCompanies(`${title} ${excerpt}`, companies));
  if (src.company_id) ids.add(src.company_id);
  for (const cid of ids) {
    await q("INSERT INTO story_companies (story_id, company_id) VALUES ($1,$2) ON CONFLICT DO NOTHING", [storyId, cid]);
  }
  return result;
}
