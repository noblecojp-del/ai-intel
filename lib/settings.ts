// 管理画面から変更できる設定値（DBの settings テーブル。未設定なら環境変数 → 既定値）
import { q } from "./db";

export async function getSetting(key: string): Promise<string | null> {
  const [r] = await q<{ value: string }>("SELECT value FROM settings WHERE key=$1", [key]);
  return r?.value ?? null;
}

export async function setSetting(key: string, value: string) {
  await q(
    "INSERT INTO settings (key, value, updated_at) VALUES ($1,$2,now()) ON CONFLICT (key) DO UPDATE SET value=$2, updated_at=now()",
    [key, value],
  );
}

/** TOP5の基準点（100点満点）。0〜100に丸める */
export async function getMinScore(): Promise<number> {
  const v = Number((await getSetting("brief_min_score")) ?? process.env.BRIEF_MIN_SCORE ?? 60);
  return Number.isFinite(v) ? Math.max(0, Math.min(100, Math.round(v))) : 60;
}
