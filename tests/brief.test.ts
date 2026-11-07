import { describe, expect, it } from "vitest";
import { decideConfidence, jstDate, normalizeScore, selectTop, verifyAnalysis } from "../lib/brief-logic";
import { estimateCostUsd } from "../lib/usage";

const s = (id: number, v: number) => ({ story_id: id, reason: "r", industry: v, innovation: v, business: v, competition: v, japan: v, buzz: v });

describe("採点", () => {
  it("各項目を上限内に丸めて合計（100点満点）", () => {
    const r = normalizeScore({ story_id: 1, reason: "x", industry: 99, innovation: -5, business: 20, competition: 15, japan: 10, buzz: 10 });
    expect(r.scores.industry).toBe(25);
    expect(r.scores.innovation).toBe(0);
    expect(r.total).toBe(80);
    expect(normalizeScore(s(1, 100)).total).toBe(100);
  });
  it("最低点未満は掲載せず、5件未満でも埋めない", () => {
    const top = selectTop([s(1, 100), s(2, 2), s(3, 12)], new Set([1, 2, 3]), 60);
    expect(top.map((t) => t.story_id)).toEqual([1, 3]);
  });
  it("候補外ID・重複を除外し、最大5件・点数順", () => {
    const raw = [s(9, 100), s(1, 5), s(1, 100), s(2, 20), s(3, 20), s(4, 20), s(5, 20), s(6, 20)];
    const top = selectTop(raw, new Set([1, 2, 3, 4, 5, 6]), 0);
    expect(top).toHaveLength(5);
    expect(top[0].story_id).toBe(1); // 重複は高い方（100点）を採用
    expect(top.some((t) => t.story_id === 9)).toBe(false);
    expect(top.filter((t) => t.story_id === 1)).toHaveLength(1);
  });
});

describe("確度と検証", () => {
  it("公式発表がなければAIが高と言っても高にしない", () => {
    expect(decideConfidence("unconfirmed", 1, "high")).toBe("low");
    expect(decideConfidence("reported", 2, "high")).toBe("medium");
    expect(decideConfidence("official", 1, "high")).toBe("high");
    expect(decideConfidence("official", 1, "low")).toBe("low");
  });
  it("出典番号と数値の整合性を確認", () => {
    const src = ["OpenAI releases model with 40% lower price"];
    expect(verifyAnalysis([{ text: "価格が40%下がった", source: 1 }], "概要", src).status).toBe("ok");
    expect(verifyAnalysis([{ text: "価格が50%下がった", source: 1 }], "概要", src).status).toBe("warn");
    expect(verifyAnalysis([{ text: "事実", source: 3 }], "概要", src).notes[0]).toContain("出典番号");
  });
  it("日本時間の日付", () => {
    expect(jstDate(new Date("2026-11-07T15:30:00Z"))).toBe("2026-11-08");
    expect(jstDate(new Date("2026-11-07T14:59:00Z"))).toBe("2026-11-07");
  });
});

describe("推定コスト", () => {
  it("公開単価から計算", () => {
    expect(estimateCostUsd("claude-sonnet-5-5", 1_000_000, 100_000)).toBeCloseTo(3);
    expect(estimateCostUsd("claude-haiku-5-5", 1000, 1000)).toBeCloseTo(0.0006);
    expect(estimateCostUsd("unknown", 1, 1)).toBeNull();
  });
});

import { parseScoreItems } from "../lib/brief";
describe("採点結果の読み取り", () => {
  it("文字列化JSON・別名キー・ID表記を吸収", () => {
    const row = { industry: 20, innovation: 10, business: 10, competition: 5, japan: 5, buzz: 5 };
    expect(parseScoreItems({ items: [{ story_id: 3, ...row }] })[0].story_id).toBe(3);
    expect(parseScoreItems({ items: JSON.stringify([{ story_id: "ID 7", ...row }]) })[0].story_id).toBe(7);
    expect(parseScoreItems({ scores: [{ id: 9, ...row }] })[0].story_id).toBe(9);
    expect(parseScoreItems({ foo: 1 })).toEqual([]);
  });
});

import { sanitizeLandscape } from "../lib/landscape";
describe("競争状況分析の根拠検証", () => {
  it("材料にない根拠IDを除外して件数を数える", () => {
    const l: any = { headline: "h", overview: "o", competitive_dynamics: "", tech_impact: "", changes_vs_last_week: "",
      company_moves: [{ company: "A", moves: [{ text: "t", story_ids: [1, 99, 1] }] }],
      japan_use_cases: [{ title: "u", description: "d", story_ids: [2, "3"] }], watch_next: [], missing_info: [] };
    const { landscape, removed } = sanitizeLandscape(l, new Set([1, 2, 3]));
    expect(landscape.company_moves[0].moves[0].story_ids).toEqual([1]);
    expect(landscape.japan_use_cases[0].story_ids).toEqual([2, 3]);
    expect(removed).toBe(1);
  });
});

import { decideTags } from "../lib/tagging";
describe("企業の紐付け判定", () => {
  const allowed = new Set(["openai", "anthropic", "nvidia"]);
  it("追跡外を捨て、公式の発信元は主役、両方にある企業は主役のみ", () => {
    expect(decideTags({ subjects: ["OpenAI", "perplexity"], mentioned: ["anthropic", "openai"] }, allowed)).toEqual({ subjects: ["openai"], mentioned: ["anthropic"] });
    expect(decideTags({ subjects: [], mentioned: ["nvidia"] }, allowed, "openai")).toEqual({ subjects: ["openai"], mentioned: ["nvidia"] });
    expect(decideTags(undefined, allowed)).toEqual({ subjects: [], mentioned: [] });
  });
});

import { mentionsPerson, quoteFoundIn } from "../lib/people";
describe("人物の発言", () => {
  it("直接引用は原文に含まれる場合だけ認める（引用符・空白・末尾句読点の違いは許容）", () => {
    const src = `Altman said, “We are going to build a lot more compute than people expect.” He added more.`;
    expect(quoteFoundIn('"We are going to build a lot more compute than people expect"', src)).toBe(true);
    expect(quoteFoundIn("We are going to build   a lot more compute than people expect.", src)).toBe(true);
    expect(quoteFoundIn("We will build ten times more compute", src)).toBe(false);
    expect(quoteFoundIn("compute", src)).toBe(false); // 短すぎる
  });
  it("人物名の表記で記事をふるい分け（部分一致しない）", () => {
    expect(mentionsPerson("Sam Altman says AGI is near", ["Sam Altman", "Altman"])).toBe(true);
    expect(mentionsPerson("Altmanized workflows", ["Altman"])).toBe(false);
    expect(mentionsPerson("アルトマン氏が講演", ["アルトマン"])).toBe(true);
  });
});
