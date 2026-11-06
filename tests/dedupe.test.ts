import { describe, expect, it } from "vitest";
import { canonicalUrl, findMatchingStory, matchCompanies, toExcerpt } from "../lib/dedupe";
import { checkConsistency } from "../lib/ai";

describe("canonicalUrl", () => {
  it("トラッキング引数・www・末尾スラッシュ・#を除去", () => {
    expect(canonicalUrl("http://www.Example.com/news/a/?utm_source=x&id=3#top")).toBe("https://example.com/news/a?id=3");
  });
});

describe("findMatchingStory", () => {
  const now = new Date("2026-11-01T00:00:00Z");
  const cands = [
    { storyId: 1, title: "OpenAI launches GPT-6 with improved reasoning", publishedAt: now },
    { storyId: 2, title: "NVIDIA reports record data center revenue", publishedAt: now },
  ];
  it("同じ発表の別表現を統合", () => {
    const m = findMatchingStory("OpenAI unveils GPT-6, its new reasoning model", new Date(now.getTime() + 3 * 36e5), cands);
    expect(m?.storyId).toBe(1);
  });
  it("別の話題は統合しない", () => {
    expect(findMatchingStory("Mistral releases open-weight model", now, cands)).toBeNull();
  });
  it("期間外は統合しない", () => {
    expect(findMatchingStory("OpenAI launches GPT-6 with improved reasoning", new Date(now.getTime() + 10 * 864e5), cands)).toBeNull();
  });
});

describe("matchCompanies", () => {
  const cos = [{ id: 1, keywords: ["OpenAI", "ChatGPT"] }, { id: 2, keywords: ["Meta AI", "Llama"] }, { id: 3, keywords: ["xAI", "Grok"] }];
  it("キーワード一致で紐付け、部分語は誤検出しない", () => {
    expect(matchCompanies("ChatGPT gets new features", cos)).toEqual([1]);
    expect(matchCompanies("Llama 5 released by Meta AI", cos)).toEqual([2]);
    expect(matchCompanies("The maxAImum effect", cos)).toEqual([]);
  });
});

describe("toExcerpt / checkConsistency", () => {
  it("HTMLを除去して短縮", () => {
    expect(toExcerpt("<p>Hello&nbsp;<b>world</b></p>")).toBe("Hello world");
  });
  it("原文に無い数値を警告", () => {
    expect(checkConsistency({ summary_ja: "価格は20%下がった", key_points: [] }, "price cut by 20%").status).toBe("ok");
    expect(checkConsistency({ summary_ja: "売上は500億ドル", key_points: [] }, "record revenue").status).toBe("warn");
  });
});
