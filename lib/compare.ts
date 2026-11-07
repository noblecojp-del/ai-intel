// 企業・モデル比較用の読み取りクエリ（すべて当サイトが収集したデータ、または出典つきの公式値）
import { q } from "./db";

export type CompanyCompare = {
  id: number; slug: string; name: string; is_listed: boolean;
  n7: number; prev7: number; n30: number; prev30: number; official30: number;
  categories: { category: string; n: number }[];
  latest: { id: number; title: string; at: string | null; importance: number | null; verification: string } | null;
};

const at = "coalesce(s.first_published_at, s.created_at)";

/**
 * 比較できる期間の開始点。収集は「初回取得時点から30日前まで」の記事を取り込むため、
 * 最初の取得日時 − 30日 より前の期間は件数0でも「データなし」であって「減った」わけではない。
 */
export async function coverageStart(): Promise<Date | null> {
  const [r] = await q<{ first: string | null }>("SELECT min(fetched_at) AS first FROM articles WHERE NOT is_demo");
  return r?.first ? new Date(new Date(r.first).getTime() - 30 * 864e5) : null;
}

export async function companyComparison(): Promise<CompanyCompare[]> {
  const rows = await q<any>(`
    SELECT c.id, c.slug, c.name, c.is_listed, c.sort_order,
      count(*) FILTER (WHERE ${at} > now() - interval '7 days')::int AS n7,
      count(*) FILTER (WHERE ${at} <= now() - interval '7 days' AND ${at} > now() - interval '14 days')::int AS prev7,
      count(*) FILTER (WHERE ${at} > now() - interval '30 days')::int AS n30,
      count(*) FILTER (WHERE ${at} <= now() - interval '30 days' AND ${at} > now() - interval '60 days')::int AS prev30,
      count(*) FILTER (WHERE ${at} > now() - interval '30 days' AND s.verification = 'official')::int AS official30
    FROM companies c
    LEFT JOIN story_companies sc ON sc.company_id = c.id
    LEFT JOIN stories s ON s.id = sc.story_id AND NOT s.is_demo
    WHERE c.is_tracked
    GROUP BY c.id ORDER BY c.sort_order, c.name`);
  const cats = await q<any>(`
    SELECT sc.company_id, coalesce(s.category, '未分類') AS category, count(*)::int AS n
      FROM story_companies sc JOIN stories s ON s.id = sc.story_id
     WHERE NOT s.is_demo AND ${at} > now() - interval '30 days'
     GROUP BY 1, 2`);
  const latest = await q<any>(`
    SELECT DISTINCT ON (sc.company_id) sc.company_id, s.id, coalesce(s.title_ja, s.representative_title) AS title,
           ${at} AS at, s.importance, s.verification
      FROM story_companies sc JOIN stories s ON s.id = sc.story_id
     WHERE NOT s.is_demo AND ${at} > now() - interval '30 days'
     ORDER BY sc.company_id, coalesce(s.importance, 0) DESC, ${at} DESC`);
  return rows.map((r) => ({
    ...r,
    categories: cats.filter((c) => c.company_id === r.id).sort((a, b) => b.n - a.n).map(({ category, n }) => ({ category, n })),
    latest: latest.find((l) => l.company_id === r.id) ?? null,
  }));
}

export type TimelineEvent = { company_id: number; id: number; title: string; at: string; importance: number | null; verification: string; category: string | null };

/** 直近 days 日の主な発表（重要度「注目」以上、または公式発表） */
export async function companyTimeline(days = 90): Promise<TimelineEvent[]> {
  return q<TimelineEvent>(`
    SELECT sc.company_id, s.id, coalesce(s.title_ja, s.representative_title) AS title, ${at} AS at,
           s.importance, s.verification, s.category
      FROM story_companies sc JOIN stories s ON s.id = sc.story_id
      JOIN companies c ON c.id = sc.company_id AND c.is_tracked
     WHERE NOT s.is_demo AND ${at} > now() - ($1 || ' days')::interval
       AND (coalesce(s.importance, 0) >= 2 OR s.verification = 'official')
     ORDER BY ${at} DESC`, [String(days)]);
}

export type ModelRow = {
  id: number; company_slug: string | null; company_name: string | null; name: string; model_key: string; note: string | null;
  facts: { id: number; field: string; label: string | null; value_num: number | null; value_text: string | null; unit: string | null;
    condition: string | null; source_url: string; source_title: string | null; checked_on: string }[];
};

export async function listModels(includeHidden = false): Promise<ModelRow[]> {
  const rows = await q<any>(`
    SELECT m.*, c.name AS company_name,
      coalesce((SELECT json_agg(json_build_object('id', f.id, 'field', f.field, 'label', f.label, 'value_num', f.value_num,
                 'value_text', f.value_text, 'unit', f.unit, 'condition', f.condition, 'source_url', f.source_url,
                 'source_title', f.source_title, 'checked_on', f.checked_on::text) ORDER BY f.id)
                FROM model_facts f WHERE f.model_id = m.id), '[]'::json) AS facts
    FROM ai_models m LEFT JOIN companies c ON c.slug = m.company_slug
    ${includeHidden ? "" : "WHERE m.status = 'published'"}
    ORDER BY m.sort_order, m.name`);
  return rows.map((r) => ({ ...r, facts: r.facts.map((f: any) => ({ ...f, value_num: f.value_num == null ? null : Number(f.value_num) })) }));
}

export async function latestAnalysis(kind = "landscape") {
  const [a] = await q<any>("SELECT * FROM analyses WHERE kind=$1 AND status='published' ORDER BY generated_at DESC LIMIT 1", [kind]);
  return a ?? null;
}

export async function storiesByIds(ids: number[]) {
  if (!ids.length) return new Map<number, { id: number; title: string }>();
  const rows = await q<any>(
    "SELECT id, coalesce(title_ja, representative_title) AS title FROM stories WHERE id = ANY($1::int[])",
    [ids],
  );
  return new Map(rows.map((r) => [r.id as number, r]));
}
