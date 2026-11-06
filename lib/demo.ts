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
}

export async function deleteDemo() {
  await q("DELETE FROM stories WHERE is_demo");
  await q("DELETE FROM articles WHERE is_demo");
}
