// BEST5 表示用の読み取りクエリ
import { q } from "./db";
import type { BriefAnalysis } from "./brief";
import type { Scores } from "./brief-logic";
import { jstDate } from "./brief-logic";

export type Brief = {
  id: number; brief_date: string; status: string; candidate_count: number; model: string | null; note: string | null;
  generated_at: string; published_at: string | null; window_start: string | null; window_end: string | null; is_demo: boolean;
};

export type BriefItem = {
  id: number; rank: number; story_id: number | null; headline: string; total_score: number; scores: Scores;
  score_reason: string | null; analysis: BriefAnalysis | null; confidence: string | null; confidence_note: string | null;
  check_status: string; check_note: string | null; model: string | null; created_at: string;
  companies: { slug: string; name: string }[]; verification: string | null; summary_ja: string | null;
};

const dateStr = (v: unknown) => (v instanceof Date ? jstDate(v) : String(v).slice(0, 10));

function normBrief(b: any): Brief {
  return { ...b, brief_date: dateStr(b.brief_date) };
}

/** 今日の分（あれば）と、表示に使う最新の公開分 */
export async function getHomeBrief() {
  const today = jstDate();
  const [todayRow] = await q<any>("SELECT * FROM daily_briefs WHERE brief_date=$1 ORDER BY is_demo LIMIT 1", [today]);
  const [latest] = await q<any>(
    "SELECT * FROM daily_briefs WHERE status IN ('published','empty') ORDER BY brief_date DESC, is_demo LIMIT 1",
  );
  const shown = latest ? normBrief(latest) : null;
  return {
    today,
    todayBrief: todayRow ? normBrief(todayRow) : null,
    brief: shown,
    items: shown ? await getBriefItems(shown.id) : [],
  };
}

export async function getBriefByDate(date: string) {
  const [b] = await q<any>("SELECT * FROM daily_briefs WHERE brief_date=$1 ORDER BY is_demo LIMIT 1", [date]);
  if (!b) return null;
  return { brief: normBrief(b), items: await getBriefItems(b.id) };
}

export async function getBriefItems(briefId: number): Promise<BriefItem[]> {
  return q<BriefItem>(
    `SELECT bi.*, s.verification, s.summary_ja,
       coalesce((SELECT json_agg(json_build_object('slug',c.slug,'name',c.name) ORDER BY c.sort_order)
                 FROM story_companies sc JOIN companies c ON c.id=sc.company_id WHERE sc.story_id=bi.story_id), '[]'::json) AS companies
     FROM brief_items bi LEFT JOIN stories s ON s.id=bi.story_id
     WHERE bi.brief_id=$1 ORDER BY bi.rank`,
    [briefId],
  );
}

export async function getItemSources(storyId: number) {
  return q<any>(
    `SELECT a.url, a.title, a.published_at, a.fetched_at, src.name AS source_name, src.source_type
       FROM articles a LEFT JOIN sources src ON src.id=a.source_id
      WHERE a.story_id=$1 ORDER BY (src.source_type='official') DESC, a.published_at ASC LIMIT 6`,
    [storyId],
  );
}

export async function listBriefs(limit = 60) {
  const rows = await q<any>(
    `SELECT b.*, (SELECT count(*)::int FROM brief_items bi WHERE bi.brief_id=b.id) AS item_count,
            (SELECT bi.headline FROM brief_items bi WHERE bi.brief_id=b.id AND bi.rank=1) AS top_headline
       FROM daily_briefs b ORDER BY b.brief_date DESC, b.is_demo LIMIT $1`,
    [limit],
  );
  return rows.map((r) => ({ ...normBrief(r), item_count: r.item_count as number, top_headline: r.top_headline as string | null }));
}

export async function usageSummary() {
  const [r] = await q<any>(`
    SELECT
      coalesce(sum(cost_usd) FILTER (WHERE created_at >= date_trunc('day', now() AT TIME ZONE 'Asia/Tokyo') AT TIME ZONE 'Asia/Tokyo'), 0)::float AS today_usd,
      coalesce(sum(cost_usd) FILTER (WHERE created_at >= date_trunc('month', now() AT TIME ZONE 'Asia/Tokyo') AT TIME ZONE 'Asia/Tokyo'), 0)::float AS month_usd,
      count(*) FILTER (WHERE created_at >= date_trunc('month', now() AT TIME ZONE 'Asia/Tokyo') AT TIME ZONE 'Asia/Tokyo')::int AS month_calls,
      coalesce(sum(input_tokens) FILTER (WHERE created_at >= date_trunc('month', now() AT TIME ZONE 'Asia/Tokyo') AT TIME ZONE 'Asia/Tokyo'), 0)::bigint AS month_in,
      coalesce(sum(output_tokens) FILTER (WHERE created_at >= date_trunc('month', now() AT TIME ZONE 'Asia/Tokyo') AT TIME ZONE 'Asia/Tokyo'), 0)::bigint AS month_out,
      coalesce(sum(cost_usd) FILTER (WHERE created_at > now() - interval '7 days'), 0)::float AS week_usd
    FROM api_usage`);
  const byJob = await q<any>(`
    SELECT job, model, count(*)::int AS calls, sum(input_tokens)::bigint AS input_tokens, sum(output_tokens)::bigint AS output_tokens,
           coalesce(sum(cost_usd),0)::float AS cost_usd
      FROM api_usage WHERE created_at >= date_trunc('month', now() AT TIME ZONE 'Asia/Tokyo') AT TIME ZONE 'Asia/Tokyo'
     GROUP BY job, model ORDER BY cost_usd DESC`);
  // 直近7日の平均から月額を試算
  const projected_month_usd = (r.week_usd / 7) * 30;
  return { ...r, projected_month_usd, byJob };
}
