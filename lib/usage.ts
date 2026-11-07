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

// 強制ツール呼び出し（tool_choice: tool）に対応していないモデルを記録しておき、以後は自動選択＋指示で呼ぶ
const noForcedTool = new Set<string>();

async function record(job: string, model: string, res: Anthropic.Message) {
  const inTok = (res.usage?.input_tokens ?? 0) + (res.usage?.cache_read_input_tokens ?? 0) + (res.usage?.cache_creation_input_tokens ?? 0);
  const outTok = res.usage?.output_tokens ?? 0;
  try {
    await q("INSERT INTO api_usage (job, model, input_tokens, output_tokens, cost_usd) VALUES ($1,$2,$3,$4,$5)", [
      job, model, inTok, outTok, estimateCostUsd(model, inTok, outTok),
    ]);
  } catch {
    // 記録失敗で本処理を止めない
  }
}

export async function callClaude(
  client: Anthropic,
  job: string,
  params: Anthropic.MessageCreateParamsNonStreaming,
): Promise<Anthropic.Message> {
  const forced = params.tool_choice?.type === "tool" ? params.tool_choice.name : null;
  if (forced && !noForcedTool.has(params.model)) {
    try {
      const res = await withRetry(() => client.messages.create(params));
      await record(job, params.model, res);
      return res;
    } catch (e: any) {
      if (!(e?.status === 400 && String(e?.message ?? "").includes("tool_choice"))) throw e;
      noForcedTool.add(params.model);
    }
  }
  if (!forced) {
    const res = await withRetry(() => client.messages.create(params));
    await record(job, params.model, res);
    return res;
  }
  // 自動選択モード：ツールを使うよう明示し、使われなければ1回だけやり直す
  const auto: Anthropic.MessageCreateParamsNonStreaming = {
    ...params,
    tool_choice: { type: "auto" },
    system: `${typeof params.system === "string" ? params.system : ""}\n\n回答は必ず ${forced} ツールを1回だけ呼び出して返してください。ツール以外の文章は書かないでください。`,
  };
  let res = await withRetry(() => client.messages.create(auto));
  await record(job, params.model, res);
  if (!res.content.some((b) => b.type === "tool_use")) {
    res = await withRetry(() => client.messages.create(auto));
    await record(job, params.model, res);
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
