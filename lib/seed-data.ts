// 初期データ。管理画面から追加・変更できる。
// 上場区分は 2026年11月時点の想定。変化があり得るため管理画面で確認・修正すること。

export type SeedCompany = {
  slug: string;
  name: string;
  name_ja: string;
  description: string;
  website: string;
  is_listed: boolean;
  ticker?: string;
  keywords: string[];
  sort_order: number;
};

export const SEED_COMPANIES: SeedCompany[] = [
  { slug: "openai", name: "OpenAI", name_ja: "OpenAI", description: "ChatGPT・GPTシリーズを開発する米国のAI企業。", website: "https://openai.com", is_listed: false, keywords: ["OpenAI", "ChatGPT", "GPT-", "Sora", "Codex", "Sam Altman"], sort_order: 1 },
  { slug: "google-deepmind", name: "Google DeepMind", name_ja: "Google DeepMind", description: "Alphabet傘下のAI研究組織。Geminiシリーズを開発。", website: "https://deepmind.google", is_listed: true, ticker: "GOOGL（Alphabet）", keywords: ["DeepMind", "Gemini", "Google AI", "Demis Hassabis", "Alphabet"], sort_order: 2 },
  { slug: "anthropic", name: "Anthropic", name_ja: "Anthropic", description: "Claudeシリーズを開発する米国のAI企業。", website: "https://www.anthropic.com", is_listed: false, keywords: ["Anthropic", "Claude", "Dario Amodei"], sort_order: 3 },
  { slug: "meta", name: "Meta", name_ja: "Meta", description: "Llamaシリーズなどを手がける。Facebook・Instagramの運営企業。", website: "https://ai.meta.com", is_listed: true, ticker: "META", keywords: ["Meta AI", "Llama", "Mark Zuckerberg", "Meta "], sort_order: 4 },
  { slug: "microsoft", name: "Microsoft", name_ja: "マイクロソフト", description: "Copilot・Azure AIを展開。", website: "https://www.microsoft.com/ai", is_listed: true, ticker: "MSFT", keywords: ["Microsoft", "Copilot", "Azure", "Satya Nadella"], sort_order: 5 },
  { slug: "nvidia", name: "NVIDIA", name_ja: "エヌビディア", description: "AI向けGPU・ソフトウェア基盤の大手。", website: "https://www.nvidia.com", is_listed: true, ticker: "NVDA", keywords: ["NVIDIA", "Nvidia", "CUDA", "Blackwell", "Jensen Huang"], sort_order: 6 },
  { slug: "xai", name: "xAI", name_ja: "xAI", description: "Grokシリーズを開発するAI企業。", website: "https://x.ai", is_listed: false, keywords: ["xAI", "Grok", "Elon Musk"], sort_order: 7 },
  { slug: "amazon", name: "Amazon", name_ja: "アマゾン", description: "AWS（Bedrock等）やNovaモデルを展開。", website: "https://aws.amazon.com/ai/", is_listed: true, ticker: "AMZN", keywords: ["Amazon", "AWS", "Bedrock", "Alexa"], sort_order: 8 },
  { slug: "apple", name: "Apple", name_ja: "アップル", description: "Apple Intelligenceを展開。", website: "https://machinelearning.apple.com", is_listed: true, ticker: "AAPL", keywords: ["Apple", "Apple Intelligence", "Siri"], sort_order: 9 },
  { slug: "mistral", name: "Mistral AI", name_ja: "Mistral AI", description: "フランスのAI企業。オープンウェイトモデルも公開。", website: "https://mistral.ai", is_listed: false, keywords: ["Mistral"], sort_order: 10 },
];

export type SeedSource = {
  name: string;
  feed_url: string;
  site_url: string;
  source_type: "official" | "media";
  company_slug?: string;
  note?: string;
};

// フィードURLは2026年11月に公開情報で存在を確認したもの。
// Anthropic・Meta AI は公式RSSが提供されていないため未登録（第2段階で取得方法を検討）。
export const SEED_SOURCES: SeedSource[] = [
  { name: "OpenAI News", feed_url: "https://openai.com/news/rss.xml", site_url: "https://openai.com/news", source_type: "official", company_slug: "openai" },
  { name: "Google DeepMind Blog", feed_url: "https://deepmind.google/blog/rss.xml", site_url: "https://deepmind.google/blog", source_type: "official", company_slug: "google-deepmind" },
  { name: "Google AI（The Keyword）", feed_url: "https://blog.google/innovation-and-ai/technology/ai/rss/", site_url: "https://blog.google/technology/ai/", source_type: "official", company_slug: "google-deepmind" },
  { name: "Microsoft Source（AI）", feed_url: "https://news.microsoft.com/source/topics/ai/feed/", site_url: "https://news.microsoft.com/source/topics/ai/", source_type: "official", company_slug: "microsoft" },
  { name: "NVIDIA Blog", feed_url: "https://blogs.nvidia.com/feed/", site_url: "https://blogs.nvidia.com", source_type: "official", company_slug: "nvidia", note: "NVIDIAのRSS利用条件（非商用目的）を確認すること" },
  { name: "NVIDIA Newsroom", feed_url: "https://nvidianews.nvidia.com/releases.xml", site_url: "https://nvidianews.nvidia.com", source_type: "official", company_slug: "nvidia", note: "NVIDIAのRSS利用条件（非商用目的）を確認すること" },
  { name: "Mistral AI News", feed_url: "https://mistral.ai/news/rss", site_url: "https://mistral.ai/news", source_type: "official", company_slug: "mistral" },
  { name: "Hugging Face Blog", feed_url: "https://huggingface.co/blog/feed.xml", site_url: "https://huggingface.co/blog", source_type: "official" },
  { name: "Ars Technica AI", feed_url: "https://arstechnica.com/ai/feed/", site_url: "https://arstechnica.com/ai/", source_type: "media" },
  { name: "The Decoder", feed_url: "https://the-decoder.com/feed/", site_url: "https://the-decoder.com", source_type: "media" },
];

export const CATEGORIES = [
  "モデル・製品発表",
  "研究・技術",
  "経営・資金調達",
  "提携・買収",
  "規制・政策",
  "インフラ・半導体",
  "安全性・倫理",
  "その他",
] as const;
