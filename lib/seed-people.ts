// 追跡する人物の初期データ。役職は 2026-11-07 に報道で確認（変更があり得るため管理画面で更新すること）。
const CHECKED = "2026-11-07";

export const SEED_PEOPLE = [
  { slug: "sam-altman", name: "Sam Altman", name_ja: "サム・アルトマン", role: "OpenAI CEO", company: "openai", aliases: ["Sam Altman", "Altman", "アルトマン"], order: 1 },
  { slug: "dario-amodei", name: "Dario Amodei", name_ja: "ダリオ・アモデイ", role: "Anthropic CEO", company: "anthropic", aliases: ["Dario Amodei", "Amodei", "アモデイ"], order: 2 },
  { slug: "demis-hassabis", name: "Demis Hassabis", name_ja: "デミス・ハサビス", role: "Alphabet チーフサイエンティスト、Google DeepMind 会長（2026年8月にCEOから移行）", company: "google-deepmind", aliases: ["Demis Hassabis", "Hassabis", "ハサビス"], order: 3 },
  { slug: "koray-kavukcuoglu", name: "Koray Kavukcuoglu", name_ja: "コライ・カヴクチュオール", role: "Google DeepMind の運営責任者（2026年8月就任）", company: "google-deepmind", aliases: ["Koray Kavukcuoglu", "Kavukcuoglu"], order: 4 },
  { slug: "jensen-huang", name: "Jensen Huang", name_ja: "ジェンスン・フアン", role: "NVIDIA CEO", company: "nvidia", aliases: ["Jensen Huang", "Huang", "ジェンスン"], order: 5 },
  { slug: "satya-nadella", name: "Satya Nadella", name_ja: "サティア・ナデラ", role: "Microsoft CEO", company: "microsoft", aliases: ["Satya Nadella", "Nadella", "ナデラ"], order: 6 },
  { slug: "mark-zuckerberg", name: "Mark Zuckerberg", name_ja: "マーク・ザッカーバーグ", role: "Meta CEO", company: "meta", aliases: ["Mark Zuckerberg", "Zuckerberg", "ザッカーバーグ"], order: 7 },
  { slug: "elon-musk", name: "Elon Musk", name_ja: "イーロン・マスク", role: "xAI 創業者", company: "xai", aliases: ["Elon Musk", "Musk", "イーロン・マスク"], order: 8 },
];

export async function seedPeople(query: (sql: string, p?: unknown[]) => Promise<any[]>) {
  const [{ n }] = await query("SELECT count(*)::int AS n FROM people");
  if (n > 0) return;
  for (const p of SEED_PEOPLE) {
    await query(
      `INSERT INTO people (slug, name, name_ja, role, role_checked_on, company_slug, aliases, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (slug) DO NOTHING`,
      [p.slug, p.name, p.name_ja, p.role, CHECKED, p.company, p.aliases, p.order],
    );
  }
}
