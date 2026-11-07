// モデル比較の初期データ。2026-11-07 に各社の公式ページで確認した値のみ。
// 料金は標準料金（USD / 100万トークン）。変更があり得るため管理画面で更新すること。
const CHECKED = "2026-11-07";
const ANT = { url: "https://platform.claude.com/docs/en/about-claude/pricing", title: "Anthropic 公式：Pricing" };
const OAI = { url: "https://developers.openai.com/api/docs/pricing", title: "OpenAI 公式：Pricing" };
const OAI_CMP = { url: "https://developers.openai.com/api/docs/models/compare", title: "OpenAI 公式：Compare models" };
const GGL = { url: "https://ai.google.dev/gemini-api/docs/pricing", title: "Google 公式：Gemini Developer API pricing" };
const GGL_4 = { url: "https://ai.google.dev/gemini-api/docs/latest-model", title: "Google 公式：What's new in Gemini 4 Argon" };

type Fact = { field: string; num?: number; text?: string; unit?: string; cond?: string; src: { url: string; title: string } };
type M = { company: string; name: string; key: string; order: number; facts: Fact[] };

const price = (inp: number, out: number, src: Fact["src"], cond = "標準料金") : Fact[] => [
  { field: "price_in", num: inp, unit: "USD/100万トークン", cond, src },
  { field: "price_out", num: out, unit: "USD/100万トークン", cond, src },
];

export const SEED_MODELS: M[] = [
  { company: "anthropic", name: "Claude Fable 5.1", key: "claude-fable-5-1", order: 10, facts: [...price(10, 50, ANT), { field: "context", num: 1_000_000, unit: "トークン", src: ANT }] },
  { company: "anthropic", name: "Claude Opus 5.5", key: "claude-opus-5-5", order: 11, facts: [...price(4, 20, ANT), { field: "context", num: 1_000_000, unit: "トークン", src: ANT }] },
  { company: "anthropic", name: "Claude Sonnet 5.5", key: "claude-sonnet-5-5", order: 12, facts: [...price(2, 10, ANT), { field: "context", num: 1_000_000, unit: "トークン", src: ANT }] },
  { company: "anthropic", name: "Claude Haiku 5.5", key: "claude-haiku-5-5", order: 13, facts: [
    ...price(0.1, 0.5, ANT, "プロンプト10万トークン以下"),
    { field: "price_in", num: 0.5, unit: "USD/100万トークン", cond: "プロンプト10万トークン超", src: ANT },
    { field: "price_out", num: 2.5, unit: "USD/100万トークン", cond: "プロンプト10万トークン超", src: ANT },
  ] },
  { company: "openai", name: "GPT-6 Astra", key: "gpt-6-astra", order: 20, facts: [...price(10, 50, OAI), { field: "context", num: 1_050_000, unit: "トークン", src: OAI_CMP }, { field: "max_output", num: 128_000, unit: "トークン", src: OAI_CMP }] },
  { company: "openai", name: "GPT-6.1 Sol", key: "gpt-6.1-sol", order: 21, facts: [...price(2, 10, OAI), { field: "context", num: 1_050_000, unit: "トークン", src: OAI_CMP }, { field: "max_output", num: 128_000, unit: "トークン", src: OAI_CMP }] },
  { company: "openai", name: "GPT-6.1 Terra", key: "gpt-6.1-terra", order: 22, facts: [...price(1, 5, OAI)] },
  { company: "openai", name: "GPT-6 Luna", key: "gpt-6-luna", order: 23, facts: [...price(0.1, 0.5, OAI), { field: "context", num: 1_050_000, unit: "トークン", src: OAI_CMP }, { field: "max_output", num: 128_000, unit: "トークン", src: OAI_CMP }] },
  { company: "google-deepmind", name: "Gemini 4 Argon", key: "gemini-4-argon", order: 30, facts: [
    ...price(2, 10, GGL_4, "2026年11月30日まで（12月1日から入力4・出力20に改定予定）"),
    { field: "context", num: 1_048_576, unit: "トークン", cond: "入力・思考・出力の合計", src: GGL_4 },
  ] },
  { company: "google-deepmind", name: "Gemini 3.1 Pro (Preview)", key: "gemini-3.1-pro-preview", order: 31, facts: [
    ...price(2, 12, GGL, "プロンプト20万トークン以下"),
    { field: "price_in", num: 4, unit: "USD/100万トークン", cond: "プロンプト20万トークン超", src: GGL },
    { field: "price_out", num: 18, unit: "USD/100万トークン", cond: "プロンプト20万トークン超", src: GGL },
  ] },
  { company: "google-deepmind", name: "Gemini 3.5 Flash", key: "gemini-3.5-flash", order: 32, facts: [...price(1.5, 9, GGL)] },
];

export async function seedModels(query: (sql: string, p?: unknown[]) => Promise<any[]>) {
  const [{ n }] = await query("SELECT count(*)::int AS n FROM ai_models");
  if (n > 0) return;
  for (const m of SEED_MODELS) {
    const [row] = await query(
      "INSERT INTO ai_models (company_slug, name, model_key, sort_order) VALUES ($1,$2,$3,$4) ON CONFLICT (model_key) DO NOTHING RETURNING id",
      [m.company, m.name, m.key, m.order],
    );
    if (!row) continue;
    for (const f of m.facts) {
      await query(
        `INSERT INTO model_facts (model_id, field, value_num, value_text, unit, condition, source_url, source_title, checked_on)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [row.id, f.field, f.num ?? null, f.text ?? null, f.unit ?? null, f.cond ?? null, f.src.url, f.src.title, CHECKED],
      );
    }
  }
}
