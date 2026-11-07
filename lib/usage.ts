// Claude API 呼び出しの共通窓口：使用トークンと推定コストを api_usage に記録する
import type Anthropic from "@anthropic-ai/sdk";
import { q } from "./db";
import { withRetry } from "./jobs";

// 単価（USD / 100万トークン）。2026年11月時点の公開価格。変更時は環境変数で上書き可能
// 例: AI_PRICE_OVERRIDES='{"claude-sonnet-5-5":{"in":2,"out":10}}'
const DEFAULT_PRICES: Record<string, { in: number; out: number; longIn?: number; longOut?: number; longFrom?: number }> = {
  "claude-haiku-5-5": { in: 0.1, out: 0.5, longIn: 0.5, longOut: 2.5, longFrom: 100_000 },
  "claude-sonnet-5-5": { in: 2, out: 10 },
};

function prices() {
  try {
    return { ...DEFAULT_PRICES, ...(process.env.AI_PRICE_OVERRIDES ? JSON.parse(process.env.AI_PRICE_OVERRIDES) : {}) };
  } catch {
    return DEFAULT_PRICES;
  }
}

export function estimateCostUsd(model: string, inputTokens: number, outputTokens: number): number | null {
  const p = prices()[model];
  if (!p) return null;
  const long = p.longFrom && inputTokens > p.longFrom;
  const pin = long ? p.longIn ?? p.in : p.in;
  const pout = long ? p.longOut ?? p.out : p.out;
  return (inputTokens * pin + outputTokens * pout) / 1_000_000;
}

export async function callClaude(
  client: Anthropic,
  job: string,
  params: Anthropic.MessageCreateParamsNonStreaming,
): Promise<Anthropic.Message> {
  const res = await withRetry(() => client.messages.create(params));
  const inTok = (res.usage?.input_tokens ?? 0) + (res.usage?.cache_read_input_tokens ?? 0) + (res.usage?.cache_creation_input_tokens ?? 0);
  const outTok = res.usage?.output_tokens ?? 0;
  try {
    await q("INSERT INTO api_usage (job, model, input_tokens, output_tokens, cost_usd) VALUES ($1,$2,$3,$4,$5)", [
      job, params.model, inTok, outTok, estimateCostUsd(params.model, inTok, outTok),
    ]);
  } catch {
    // 記録失敗で本処理を止めない
  }
  return res;
}

/** tool_choice で強制したツール呼び出しの入力を取り出す */
export function toolInput<T>(res: Anthropic.Message): T {
  const block = res.content.find((b) => b.type === "tool_use");
  if (!block || block.type !== "tool_use") throw new Error(`AIの出力形式が不正です（stop_reason: ${res.stop_reason}）`);
  if (res.stop_reason === "max_tokens") throw new Error("AIの出力が上限で途切れました");
  return block.input as T;
}
