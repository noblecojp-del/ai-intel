// 重複検出・統合ロジック（純粋関数。tests/dedupe.test.ts でテスト）

const TRACKING_PARAMS = /^(utm_|fbclid|gclid|mc_cid|mc_eid|ref$|ref_src|source$|cmpid|ncid)/i;

/** URLを正規化（トラッキング引数・末尾スラッシュ・#以降・www を除去） */
export function canonicalUrl(raw: string): string {
  try {
    const u = new URL(raw.trim());
    u.hash = "";
    u.hostname = u.hostname.toLowerCase().replace(/^www\./, "");
    u.protocol = "https:";
    for (const k of [...u.searchParams.keys()]) if (TRACKING_PARAMS.test(k)) u.searchParams.delete(k);
    if (u.pathname.length > 1 && u.pathname.endsWith("/")) u.pathname = u.pathname.replace(/\/+$/, "");
    return u.toString();
  } catch {
    return raw.trim();
  }
}

const STOP = new Set([
  "the", "a", "an", "and", "or", "of", "to", "in", "on", "for", "with", "at", "by", "from", "is", "are", "its",
  "new", "how", "what", "why", "we", "our", "you", "your", "this", "that", "as", "be", "now", "into", "about",
  // 発表系の動詞は媒体ごとに言い換えられるため比較から除外
  "introducing", "introduces", "announcing", "announces", "announced", "unveils", "unveiled", "launches", "launched",
  "launch", "releases", "released", "release", "debuts", "rolls", "out", "says", "today",
]);

/** タイトルを比較用に正規化 */
export function normalizeTitle(title: string): string {
  return title
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[“”"'’‘`]/g, "")
    .replace(/[^\p{L}\p{N}\s.-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function titleTokens(title: string): Set<string> {
  const n = normalizeTitle(title);
  const words = n.split(" ").filter((w) => w.length > 1 && !STOP.has(w));
  // 日本語など空白で区切られない言語用に文字バイグラムも加える
  const cjk = n.replace(/[a-z0-9\s.-]/g, "");
  const grams: string[] = [];
  for (let i = 0; i < cjk.length - 1; i++) grams.push(cjk.slice(i, i + 2));
  return new Set([...words, ...grams]);
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

export type Candidate = { storyId: number; title: string; publishedAt: Date | null };

export const SIMILARITY_THRESHOLD = 0.5;
export const WINDOW_HOURS = 72;

/**
 * 新しい記事が既存storyと同一の発表を扱っているか判定する。
 * 公開日時が近く（±72時間）、タイトルの語の重なりが閾値以上なら同一とみなす。
 * 固有名詞（モデル名・数字入りの語）が一致すると閾値を下げる。
 */
export function findMatchingStory(
  title: string,
  publishedAt: Date | null,
  candidates: Candidate[],
): { storyId: number; score: number } | null {
  const t = titleTokens(title);
  let best: { storyId: number; score: number } | null = null;
  for (const c of candidates) {
    if (publishedAt && c.publishedAt) {
      const diffH = Math.abs(publishedAt.getTime() - c.publishedAt.getTime()) / 36e5;
      if (diffH > WINDOW_HOURS) continue;
    }
    const ct = titleTokens(c.title);
    let score = jaccard(t, ct);
    const strong = [...t].filter((w) => /\d/.test(w) && w.length >= 3 && ct.has(w));
    if (strong.length > 0) score += 0.25; // モデル名など数字入りの固有語が一致
    if (score >= SIMILARITY_THRESHOLD && (!best || score > best.score)) best = { storyId: c.storyId, score };
  }
  return best;
}

/** 記事のタイトル・抜粋から関連企業を推定（キーワード一致のみ。推論はしない） */
export function matchCompanies(
  text: string,
  companies: { id: number; keywords: string[] }[],
): number[] {
  const hay = ` ${text} `;
  return companies
    .filter((c) =>
      c.keywords.some((k) => {
        const key = k.trim();
        if (!key) return false;
        if (/^[A-Za-z0-9 .\-]+$/.test(key)) {
          const esc = key.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          return new RegExp(`(^|[^A-Za-z0-9])${esc}`, key === key.toUpperCase() ? "" : "i").test(hay);
        }
        return hay.includes(key);
      }),
    )
    .map((c) => c.id);
}

/** HTMLタグを除去し長さを制限（全文は保存しない＝著作権配慮） */
export function toExcerpt(html: string | undefined, max = 600): string {
  if (!html) return "";
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
  return text.length > max ? text.slice(0, max) + "…" : text;
}
