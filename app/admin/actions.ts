"use server";
// 管理画面の操作。/admin 配下はmiddlewareのBasic認証で保護されている。
import Anthropic from "@anthropic-ai/sdk";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { q } from "@/lib/db";
import { runIngest } from "@/lib/ingest";
import { runSummarize, saveSummary, summarizeStory, SUMMARY_MODEL } from "@/lib/ai";
import { deleteDemo, seedDemo } from "@/lib/demo";

const MAX_TRACKED = 20;
const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

export async function actionIngest() {
  await runIngest("manual");
  await runSummarize("manual");
  revalidatePath("/", "layout");
}

export async function actionSummarize() {
  await runSummarize("manual");
  revalidatePath("/", "layout");
}

export async function actionSeedDemo() {
  await seedDemo();
  revalidatePath("/", "layout");
}

export async function actionDeleteDemo() {
  await deleteDemo();
  revalidatePath("/", "layout");
}

export async function actionAddSource(f: FormData) {
  const name = str(f, "name");
  const feed = str(f, "feed_url");
  if (!name || !/^https?:\/\//.test(feed)) return;
  const company = str(f, "company_id");
  await q(
    `INSERT INTO sources (name, feed_url, site_url, source_type, company_id) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (feed_url) DO NOTHING`,
    [name, feed, str(f, "site_url") || null, str(f, "source_type") === "official" ? "official" : "media", company ? Number(company) : null],
  );
  revalidatePath("/admin");
}

export async function actionToggleSource(f: FormData) {
  await q("UPDATE sources SET is_active = NOT is_active WHERE id=$1", [Number(f.get("id"))]);
  revalidatePath("/admin");
}

export async function actionDeleteSource(f: FormData) {
  await q("DELETE FROM sources WHERE id=$1", [Number(f.get("id"))]);
  revalidatePath("/admin");
}

export async function actionSaveCompany(f: FormData) {
  const id = str(f, "id");
  const tracked = f.get("is_tracked") === "on";
  if (tracked) {
    const [{ n }] = await q<{ n: number }>("SELECT count(*)::int AS n FROM companies WHERE is_tracked AND id <> $1", [Number(id) || 0]);
    if (n >= MAX_TRACKED) redirect("/admin?tab=companies&error=max");
  }
  const vals = [
    str(f, "name"), str(f, "description") || null, str(f, "website") || null, f.get("is_listed") === "on",
    str(f, "ticker") || null, str(f, "ir_url") || null,
    str(f, "keywords").split(/[,、\n]/).map((s) => s.trim()).filter(Boolean), tracked, Number(str(f, "sort_order")) || 100,
  ];
  if (id) {
    await q(
      `UPDATE companies SET name=$1, description=$2, website=$3, is_listed=$4, ticker=$5, ir_url=$6, keywords=$7, is_tracked=$8, sort_order=$9 WHERE id=$10`,
      [...vals, Number(id)],
    );
  } else {
    const slug = str(f, "slug").toLowerCase().replace(/[^a-z0-9-]/g, "-");
    if (!slug || !vals[0]) return;
    await q(
      `INSERT INTO companies (name, description, website, is_listed, ticker, ir_url, keywords, is_tracked, sort_order, slug)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (slug) DO NOTHING`,
      [...vals, slug],
    );
  }
  revalidatePath("/", "layout");
  redirect("/admin?tab=companies&saved=1");
}

export async function actionEditStory(f: FormData) {
  const id = Number(f.get("id"));
  const importance = Number(str(f, "importance"));
  await saveSummary(
    id,
    {
      title_ja: str(f, "title_ja"),
      summary_ja: str(f, "summary_ja"),
      key_points: str(f, "key_points").split("\n").map((s) => s.trim()).filter(Boolean),
      why_it_matters: str(f, "why_it_matters"),
      category: str(f, "category"),
      importance: ([1, 2, 3].includes(importance) ? importance : 1) as 1 | 2 | 3,
      importance_reason: str(f, "importance_reason"),
    },
    null,
    "admin",
    { status: "ok", note: "編集者が確認・修正" },
  );
  await q("UPDATE stories SET verification=$2 WHERE id=$1", [id, str(f, "verification") || "unconfirmed"]);
  revalidatePath("/", "layout");
  redirect(`/admin/stories/${id}?saved=1`);
}

export async function actionRegenerate(f: FormData) {
  const id = Number(f.get("id"));
  if (!process.env.ANTHROPIC_API_KEY) redirect(`/admin/stories/${id}?error=nokey`);
  await q("UPDATE stories SET manually_edited=FALSE WHERE id=$1", [id]);
  await summarizeStory(new Anthropic(), id);
  revalidatePath("/", "layout");
  redirect(`/admin/stories/${id}?regenerated=${encodeURIComponent(SUMMARY_MODEL)}`);
}
