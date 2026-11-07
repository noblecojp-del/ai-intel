// 画面確認用のデモデータ。実在の発表ではない。is_demo=true で保存され、画面上に「デモ」と明示される。
// 管理画面からいつでも一括削除できる。
import { q } from "./db";

const DEMO = [
  { co: ["openai"], cat: "モデル・製品発表", imp: 3, ver: "official", h: 5, n: 3,
    t: "【デモ】OpenAIが新しい推論モデルを発表した想定のサンプル", s: "これは画面確認用のデモ記事です。実在の発表ではありません。公式ブログと複数の報道が同一の発表を扱った場合に、1つのストーリーとして統合表示される様子を確認できます。" },
  { co: ["google-deepmind"], cat: "研究・技術", imp: 2, ver: "official", h: 20, n: 1,
    t: "【デモ】Google DeepMindが研究成果を公開した想定のサンプル", s: "画面確認用のデモ記事です。研究・技術カテゴリの表示例です。" },
  { co: ["nvidia", "microsoft"], cat: "インフラ・半導体", imp: 2, ver: "reported", h: 30, n: 2,
    t: "【デモ】NVIDIAとMicrosoftのインフラ提携に関する報道の想定サンプル", s: "画面確認用のデモ記事です。公式発表がなく複数メディアのみが報じている状態（複数報道）の表示例です。" },
  { co: ["anthropic"], cat: "安全性・倫理", imp: 2, ver: "official", h: 50, n: 1,
    t: "【デモ】Anthropicが安全性に関する方針を公開した想定のサンプル", s: "画面確認用のデモ記事です。安全性・倫理カテゴリの表示例です。" },
  { co: ["xai"], cat: "経営・資金調達", imp: 1, ver: "unconfirmed", h: 70, n: 1,
    t: "【デモ】xAIの資金調達に関する未確認報道の想定サンプル", s: "画面確認用のデモ記事です。単一メディアのみが報じ、公式に確認されていない状態（公式未確認）の表示例です。" },
  { co: ["mistral"], cat: "モデル・製品発表", imp: 1, ver: "official", h: 100, n: 1,
    t: "【デモ】Mistral AIがオープンウェイトモデルを公開した想定のサンプル", s: "画面確認用のデモ記事です。" },
  { co: [], cat: "規制・政策", imp: 2, ver: "reported", h: 130, n: 2,
    t: "【デモ】AI規制に関する政策動向の想定サンプル", s: "画面確認用のデモ記事です。特定企業に紐付かない業界ニュースの表示例です。" },
];

export async function seedDemo() {
  for (const [i, d] of DEMO.entries()) {
    const at = new Date(Date.now() - d.h * 36e5);
    const [s] = await q<{ id: number }>(
      `INSERT INTO stories (representative_title, title_ja, summary_ja, key_points, why_it_matters, category, importance,
         importance_reason, verification, first_published_at, last_article_at, summary_status, summary_model,
         summary_generated_at, summary_version, consistency, is_demo)
       VALUES ($1,$1,$2,$3,$4,$5,$6,$7,$8,$9,$9,'done','demo',now(),1,'ok',TRUE) RETURNING id`,
      [d.t, d.s, JSON.stringify(["デモ用の要点1", "デモ用の要点2"]),
       "（デモ）実データではAIがここに「なぜ重要か」の分析を推測表現で記載します。", d.cat, d.imp,
       "（デモ）重要度の判断根拠がここに入ります。", d.ver, at],
    );
    for (let k = 0; k < d.n; k++) {
      await q(
        `INSERT INTO articles (story_id, url, title, norm_title, excerpt, published_at, is_demo)
         VALUES ($1,$2,$3,$3,$4,$5,TRUE) ON CONFLICT (url) DO NOTHING`,
        [s.id, `https://example.com/demo/${i}-${k}-${s.id}`, `${d.t}（記事${k + 1}）`, "デモ用の抜粋です。", at],
      );
    }
    for (const slug of d.co) {
      await q(
        `INSERT INTO story_companies (story_id, company_id) SELECT $1, id FROM companies WHERE slug=$2 ON CONFLICT DO NOTHING`,
        [s.id, slug],
      );
    }
  }
  await seedDemoBrief();
}

/** BEST5 画面確認用のデモ（前日の日付・is_demo=true。実データの生成で上書きされる） */
export async function seedDemoBrief() {
  const stories = await q<{ id: number; title_ja: string }>("SELECT id, title_ja FROM stories WHERE is_demo ORDER BY id LIMIT 3");
  if (!stories.length) return;
  const date = new Date(Date.now() + 9 * 36e5 - 864e5).toISOString().slice(0, 10);
  const [b] = await q<{ id: number }>(
    `INSERT INTO daily_briefs (brief_date, status, window_start, window_end, candidate_count, model, published_at, is_demo)
     VALUES ($1,'published', now() - interval '48 hours', now() - interval '24 hours', 7, 'demo', now(), TRUE)
     ON CONFLICT (brief_date) DO NOTHING RETURNING id`,
    [date],
  );
  if (!b) return;
  const scores = [
    { industry: 22, innovation: 17, business: 17, competition: 13, japan: 6, buzz: 9 },
    { industry: 18, innovation: 12, business: 15, competition: 11, japan: 5, buzz: 7 },
    { industry: 15, innovation: 10, business: 14, competition: 9, japan: 6, buzz: 6 },
  ];
  for (const [i, s] of stories.entries()) {
    const total = Object.values(scores[i]).reduce((a, n) => a + n, 0);
    await q(
      `INSERT INTO brief_items (brief_id, rank, story_id, headline, total_score, scores, score_reason, analysis, confidence, confidence_note, check_status, model)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'medium',$9,'ok','demo')`,
      [b.id, i + 1, s.id, s.title_ja, total, JSON.stringify(scores[i]), "（デモ）ここにAIが評価した重要な理由が入ります。",
       JSON.stringify({
         overview: "（デモ）ここに記事から確認できた事実だけでまとめた概要が入ります。",
         key_facts: [{ text: "（デモ）確認できた事実1", source: 1 }, { text: "（デモ）確認できた事実2", source: 1 }],
         what_changed: "（デモ）今回何が変わったのかが入ります。",
         vs_past: "比較できる過去の情報がありません",
         why_important: "（デモ）なぜ重要かの分析が入ります。",
         competitors: "（デモ）競合企業への影響の分析が入ります。",
         industry: "（デモ）業界全体への影響の分析が入ります。",
         japan: "（デモ）日本企業への影響の分析が入ります。",
         exec_points: ["（デモ）注目ポイント1", "（デモ）注目ポイント2"],
         business_use: ["（デモ）活用方法1", "（デモ）活用方法2"],
         outlook: { short: "（デモ）短期予測", mid: "（デモ）中期予測", long: "（デモ）長期予測" },
         confidence: "medium", confidence_reason: "（デモ）確度の理由", missing_info: ["（デモ）情報不足の点"],
       }),
       "（デモ）確度の判断理由が入ります。"],
    );
  }
}

export async function deleteDemo() {
  await q("DELETE FROM daily_briefs WHERE is_demo");
  await q("DELETE FROM stories WHERE is_demo");
  await q("DELETE FROM articles WHERE is_demo");
}
