// 表示用の読み取りクエリ
import { q } from "./db";

export type StoryRow = {
  id: number;
  title_ja: string | null;
  representative_title: string;
  summary_ja: string | null;
  category: string | null;
  importance: number | null;
  verification: string;
  first_published_at: string | null;
  summary_status: string;
  is_demo: boolean;
  article_count: number;
  companies: { slug: string; name: string }[];
};

const STORY_SELECT = `
  SELECT s.id, s.title_ja, s.representative_title, s.summary_ja, s.category, s.importance, s.verification,
         s.first_published_at, s.summary_status, s.is_demo,
         (SELECT count(*)::int FROM articles a WHERE a.story_id=s.id) AS article_count,
         coalesce((SELECT json_agg(json_build_object('slug',c.slug,'name',c.name) ORDER BY c.sort_order)
                   FROM story_companies sc JOIN companies c ON c.id=sc.company_id WHERE sc.story_id=s.id), '[]'::json) AS companies
  FROM stories s`;

export type StoryFilter = { q?: string; category?: string; company?: string; verification?: string; importance?: number; limit?: number; offset?: number };

export async function listStories(f: StoryFilter = {}): Promise<StoryRow[]> {
  const where: string[] = [];
  const p: unknown[] = [];
  if (f.q) {
    p.push(`%${f.q}%`);
    where.push(`(s.title_ja ILIKE $${p.length} OR s.summary_ja ILIKE $${p.length} OR s.representative_title ILIKE $${p.length}
      OR EXISTS (SELECT 1 FROM articles a WHERE a.story_id=s.id AND a.title ILIKE $${p.length}))`);
  }
  if (f.category) { p.push(f.category); where.push(`s.category = $${p.length}`); }
  if (f.verification) { p.push(f.verification); where.push(`s.verification = $${p.length}`); }
  if (f.importance) { p.push(f.importance); where.push(`s.importance >= $${p.length}`); }
  if (f.company) {
    p.push(f.company);
    where.push(`EXISTS (SELECT 1 FROM story_companies sc JOIN companies c ON c.id=sc.company_id WHERE sc.story_id=s.id AND c.slug=$${p.length})`);
  }
  p.push(f.limit ?? 30, f.offset ?? 0);
  return q<StoryRow>(
    `${STORY_SELECT} ${where.length ? "WHERE " + where.join(" AND ") : ""}
     ORDER BY coalesce(s.first_published_at, s.created_at) DESC LIMIT $${p.length - 1} OFFSET $${p.length}`,
    p,
  );
}

export async function topStories(days = 7, limit = 5): Promise<StoryRow[]> {
  return q<StoryRow>(
    `${STORY_SELECT} WHERE coalesce(s.first_published_at, s.created_at) > now() - ($1 || ' days')::interval
     ORDER BY coalesce(s.importance,0) DESC, (SELECT count(*) FROM articles a WHERE a.story_id=s.id) DESC,
              coalesce(s.first_published_at, s.created_at) DESC LIMIT $2`,
    [String(days), limit],
  );
}

export async function getStory(id: number) {
  const [story] = await q<any>(`${STORY_SELECT.replace("SELECT s.id,", "SELECT s.*, s.id,")} WHERE s.id=$1`, [id]);
  if (!story) return null;
  const articles = await q<any>(
    `SELECT a.*, src.name AS source_name, src.source_type, src.site_url
       FROM articles a LEFT JOIN sources src ON src.id=a.source_id
      WHERE a.story_id=$1 ORDER BY (src.source_type='official') DESC, a.published_at ASC`,
    [id],
  );
  const versions = await q<any>("SELECT version, model, author, created_at FROM summary_versions WHERE story_id=$1 ORDER BY version DESC", [id]);
  const mentions = await q<{ slug: string; name: string }>(
    "SELECT c.slug, c.name FROM story_mentions m JOIN companies c ON c.id=m.company_id WHERE m.story_id=$1 ORDER BY c.sort_order",
    [id],
  );
  return { story, articles, versions, mentions };
}

export async function relatedStories(id: number, limit = 5): Promise<StoryRow[]> {
  return q<StoryRow>(
    `${STORY_SELECT} WHERE s.id <> $1 AND EXISTS (
        SELECT 1 FROM story_companies a JOIN story_companies b ON a.company_id=b.company_id
        WHERE a.story_id=s.id AND b.story_id=$1)
     ORDER BY coalesce(s.first_published_at, s.created_at) DESC LIMIT $2`,
    [id, limit],
  );
}

export type CompanyRow = {
  id: number; slug: string; name: string; name_ja: string | null; description: string | null; website: string | null;
  is_listed: boolean; ticker: string | null; ir_url: string | null; keywords: string[]; is_tracked: boolean; sort_order: number;
  story_count_30d: number; last_story_at: string | null;
};

export async function listCompanies(includeUntracked = false): Promise<CompanyRow[]> {
  return q<CompanyRow>(
    `SELECT c.*,
       (SELECT count(*)::int FROM story_companies sc JOIN stories s ON s.id=sc.story_id
         WHERE sc.company_id=c.id AND coalesce(s.first_published_at,s.created_at) > now() - interval '30 days') AS story_count_30d,
       (SELECT max(coalesce(s.first_published_at,s.created_at)) FROM story_companies sc JOIN stories s ON s.id=sc.story_id
         WHERE sc.company_id=c.id) AS last_story_at
     FROM companies c ${includeUntracked ? "" : "WHERE c.is_tracked"} ORDER BY c.sort_order, c.name`,
  );
}

export async function getCompany(slug: string) {
  const [c] = await q<CompanyRow>("SELECT *, 0 AS story_count_30d, NULL AS last_story_at FROM companies WHERE slug=$1", [slug]);
  if (!c) return null;
  const categories = await q<{ category: string; n: number }>(
    `SELECT coalesce(s.category,'未分類') AS category, count(*)::int AS n
       FROM story_companies sc JOIN stories s ON s.id=sc.story_id
      WHERE sc.company_id=$1 AND coalesce(s.first_published_at,s.created_at) > now() - interval '90 days'
      GROUP BY 1 ORDER BY 2 DESC`,
    [c.id],
  );
  const sources = await q<any>("SELECT name, site_url, feed_url, last_status FROM sources WHERE company_id=$1 AND is_active", [c.id]);
  return { company: c, categories, sources };
}

export async function dashboardStats() {
  const [r] = await q<any>(`
    SELECT
      (SELECT count(*)::int FROM stories WHERE coalesce(first_published_at,created_at) > now() - interval '24 hours') AS stories_24h,
      (SELECT count(*)::int FROM stories WHERE coalesce(first_published_at,created_at) > now() - interval '7 days') AS stories_7d,
      (SELECT count(*)::int FROM stories WHERE verification='official' AND coalesce(first_published_at,created_at) > now() - interval '7 days') AS official_7d,
      (SELECT count(*)::int FROM sources WHERE is_active) AS sources_active,
      (SELECT max(finished_at) FROM job_runs WHERE job='ingest') AS last_ingest,
      (SELECT count(*)::int FROM stories WHERE is_demo) AS demo_count`);
  const byCategory = await q<{ category: string; n: number }>(`
    SELECT coalesce(category,'未分類') AS category, count(*)::int AS n FROM stories
     WHERE coalesce(first_published_at,created_at) > now() - interval '7 days' GROUP BY 1 ORDER BY 2 DESC`);
  return { ...r, byCategory };
}
