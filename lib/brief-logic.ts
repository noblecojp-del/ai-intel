// BEST5 の採点・選定・検証ロジック（API不要の純粋関数。tests/brief.test.ts でテスト）

export const SCORE_CRITERIA = [
  { key: "industry", label: "AI業界全体への影響", max: 25 },
  { key: "innovation", label: "技術的な革新性", max: 20 },
  { key: "business", label: "ビジネスへの影響", max: 20 },
  { key: "competition", label: "競合企業への影響", max: 15 },
  { key: "japan", label: "日本企業への影響", max: 10 },
  { key: "buzz", label: "話題性", max: 10 },
] as const;

export type ScoreKey = (typeof SCORE_CRITERIA)[number]["key"];
export type Scores = Record<ScoreKey, number>;
export type RawScore = { story_id: number; reason: string } & Partial<Record<ScoreKey, number>>;
export type ScoredStory = { story_id: number; reason: string; scores: Scores; total: number };

/** AIの採点を上限内に丸めて合計を出す（不正値・範囲外は0〜上限に収める） */
export function normalizeScore(raw: RawScore): ScoredStory {
  const scores = {} as Scores;
  let total = 0;
  for (const c of SCORE_CRITERIA) {
    const v = Number(raw[c.key]);
    const n = Number.isFinite(v) ? Math.max(0, Math.min(c.max, Math.round(v))) : 0;
    scores[c.key] = n;
    total += n;
  }
  return { story_id: raw.story_id, reason: String(raw.reason ?? "").trim(), scores, total };
}

/**
 * 上位を選定。候補に存在しないIDや重複を除き、最低点を満たすものだけを最大 limit 件。
 * 重要ニュースが少ない日は 5 件未満になる（無理に埋めない）。
 */
export function selectTop(raw: RawScore[], validIds: Set<number>, minScore: number, limit = 5): ScoredStory[] {
  const seen = new Set<number>();
  return raw
    .filter((r) => validIds.has(Number(r.story_id)))
    .map((r) => normalizeScore({ ...r, story_id: Number(r.story_id) }))
    .sort((a, b) => b.total - a.total)
    .filter((s) => (seen.has(s.story_id) ? false : (seen.add(s.story_id), true))) // 重複は高い方を残す
    .filter((s) => s.total >= minScore)
    .slice(0, limit);
}

export type Confidence = "high" | "medium" | "low";
const RANK: Record<Confidence, number> = { low: 0, medium: 1, high: 2 };

/**
 * 情報の確度：情報源の状況（公式/複数報道/未確認）を上限とし、AIの自己評価がそれより低ければ低い方を採用。
 * AIが「高い」と言っても公式発表がなければ高にはしない。
 */
export function decideConfidence(verification: string, sourceCount: number, aiConfidence: string | undefined): Confidence {
  const cap: Confidence = verification === "official" ? "high" : verification === "reported" || sourceCount >= 2 ? "medium" : "low";
  const ai: Confidence = aiConfidence === "high" || aiConfidence === "medium" || aiConfidence === "low" ? aiConfidence : "medium";
  return RANK[ai] < RANK[cap] ? ai : cap;
}

export type Fact = { text: string; source: number };

/**
 * 深掘り分析の検証：
 * - 「事実」に付いた出典番号が実在する記事を指しているか
 * - 事実・概要に出てくる数値が原文（タイトル・抜粋）に存在するか
 */
export function verifyAnalysis(
  facts: Fact[],
  overview: string,
  sourceTexts: string[],
): { status: "ok" | "warn"; notes: string[] } {
  const notes: string[] = [];
  const bad = facts.filter((f) => !Number.isInteger(f.source) || f.source < 1 || f.source > sourceTexts.length);
  if (bad.length) notes.push(`出典番号が不正な事実 ${bad.length} 件`);
  const nums = (s: string) => (s.normalize("NFKC").match(/\d+(?:[.,]\d+)?/g) ?? []).map((n) => n.replace(/,/g, ""));
  const src = new Set(nums(sourceTexts.join(" ")));
  const missing = [...new Set(nums([overview, ...facts.map((f) => f.text)].join(" ")).filter((n) => !src.has(n)))];
  if (missing.length) notes.push(`原文に見当たらない数値: ${missing.join(", ")}`);
  return { status: notes.length ? "warn" : "ok", notes };
}

/** 日本時間の日付（YYYY-MM-DD） */
export function jstDate(d = new Date()): string {
  return new Date(d.getTime() + 9 * 36e5).toISOString().slice(0, 10);
}
