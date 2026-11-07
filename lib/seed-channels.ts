// 初期チャンネル。channel_id は 2026-11-07 に公開情報で確認できたもののみ記入し、他はハンドルから自動解決する。
export const SEED_CHANNELS = [
  { name: "OpenAI", handle: "@OpenAI", channel_id: null, company: "openai", kind: "official" },
  { name: "Anthropic", handle: "@anthropic-ai", channel_id: null, company: "anthropic", kind: "official" },
  { name: "Google DeepMind", handle: "@GoogleDeepMind", channel_id: "UCP7jMXSY2xbc3KCAE0MHQ-A", company: "google-deepmind", kind: "official" },
  { name: "NVIDIA", handle: "@NVIDIA", channel_id: "UCHuiy8bXnmK5nisYHUd1J5g", company: "nvidia", kind: "official" },
  { name: "Lex Fridman", handle: "@lexfridman", channel_id: null, company: null, kind: "interview" },
];

export async function seedChannels(query: (sql: string, p?: unknown[]) => Promise<any[]>) {
  const [{ n }] = await query("SELECT count(*)::int AS n FROM video_channels");
  if (n > 0) return;
  for (const c of SEED_CHANNELS) {
    await query(
      "INSERT INTO video_channels (name, handle, channel_id, company_slug, kind) VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING",
      [c.name, c.handle, c.channel_id, c.company, c.kind],
    );
  }
}
