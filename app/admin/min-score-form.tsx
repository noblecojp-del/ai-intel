"use client";
// 基準点の入力に応じて、今日の候補のうち何件が掲載されるかをその場で表示する
import { useState } from "react";
import { SubmitButton } from "./submit-button";

type Item = { story_id: number; title: string; total: number; reason: string };

export function MinScoreForm({
  current, items, action, hasScores,
}: { current: number; items: Item[]; action: (f: FormData) => void; hasScores: boolean }) {
  const [v, setV] = useState(current);
  const sorted = [...items].sort((a, b) => b.total - a.total);
  const pass = sorted.filter((i) => i.total >= v).slice(0, 5);
  return (
    <form action={action} className="space-y-5">
      <div className="card p-4">
        <label htmlFor="min_score" className="label">TOP5の基準点（100点満点）</label>
        <div className="flex flex-wrap items-center gap-3">
          <input id="min_score" name="min_score" type="range" min={0} max={100} step={1} value={v}
            onChange={(e) => setV(Number(e.target.value))} className="w-56 accent-ink" />
          <input type="number" min={0} max={100} value={v} onChange={(e) => setV(Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
            className="input w-20 tabular-nums" aria-label="基準点" />
          <span className="text-sm text-ink-soft">点以上を掲載（現在の設定：{current}点）</span>
        </div>
        <p className="mt-3 text-sm">
          この基準だと本日分は <strong className="tabular-nums">{pass.length}件</strong> 掲載されます
          {sorted.length > 5 && sorted.filter((i) => i.total >= v).length > 5 && "（上限5件）"}。
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <SubmitButton className="btn" pending="保存中…">保存（明日以降に反映）</SubmitButton>
          <button type="submit" name="rebuild" value="1" className="btn-primary" disabled={!items.length}>
            保存して本日分を作り直す
          </button>
        </div>
        <p className="mt-2 text-xs text-ink-faint">
          {hasScores
            ? "作り直しは保存済みの採点結果を使うため、採点の費用はかかりません。新しく掲載されるニュースの深掘り分析だけ実行します（1件あたり約5円）。"
            : "本日分は以前の形式で保存されているため、作り直す際は採点からやり直します（約10円）。"}
        </p>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-bold">本日の候補と点数<span className="ml-2 font-normal text-ink-faint">AIによる評価・{items.length}件</span></h3>
        <ul className="card divide-y divide-line">
          {sorted.map((i, idx) => {
            const inTop = pass.includes(i);
            return (
              <li key={i.story_id} className={`flex gap-3 px-4 py-2.5 text-sm ${inTop ? "" : "opacity-55"}`}>
                <span className="w-12 shrink-0 text-right font-bold tabular-nums">{i.total}点</span>
                <span className={`badge h-fit shrink-0 ${inTop ? "bg-emerald-50 text-emerald-800 ring-emerald-200" : "bg-white text-ink-faint ring-line"}`}>{inTop ? `掲載 ${pass.indexOf(i) + 1}位` : idx < 5 && i.total < v ? "基準未満" : "対象外"}</span>
                <div className="min-w-0"><div className="font-medium">{i.title}</div><div className="text-xs text-ink-faint">{i.reason}</div></div>
              </li>
            );
          })}
          {!items.length && <li className="px-4 py-3 text-sm text-ink-faint">本日分はまだ採点されていません（毎朝7時台に自動実行）</li>}
        </ul>
      </div>
    </form>
  );
}
