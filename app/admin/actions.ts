"use server";
// 管理画面の操作。/admin 配下はmiddlewareのBasic認証で保護されている。
import Anthropic from "@anthropic-ai/sdk";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { q } from "@/lib/db";
import { runIngest } from "@/lib/ingest";
import { runSummarize, saveSummary, summarizeStory, SUMMARY_MODEL } from "@/lib/ai";
import { deleteDemo, seedDemo } from "@/lib/demo";
import { runBrief } from "@/lib/brief";
import { setSetting } from "@/lib/settings";
import { runLandscape } from "@/lib/landscape";
import { runTagging } from "@/lib/tagging";
import { runPersonAnalyses, runStatements } from "@/lib/people";
import { cookies } from "next/headers";
import { ADMIN_COOKIE, verifySession } from "@/lib/auth";

/** サーバーアクションは画面外から直接呼ばれる可能性があるため、毎回ログインを確認する */
async function requireAdmin() {
  if (!process.env.ADMIN_PASSWORD && process.env.NODE_ENV !== "production") return;
  if (!(await verifySession((await cookies()).get(ADMIN_COOKIE)?.value))) redirect("/admin/login");
}

const MAX_TRACKED = 20;
const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

export async function actionIngest() {
  await requireAdmin();
  await runIngest("manual");
  await runSummarize("manual");
  await runTagging("manual", 100);
  revalidatePath("/", "layout");
}

export async function actionSummarize() {
  await requireAdmin();
  await runSummarize("manual");
  revalidatePath("/", "layout");
}

export async function actionSeedDemo() {
  await requireAdmin();
  await seedDemo();
  revalidatePath("/", "layout");
}

export async function actionDeleteDemo() {
  await requireAdmin();
  await deleteDemo();
  revalidatePath("/", "layout");
}

export async function actionAddSource(f: FormData) {
  await requireAdmin();
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
  await requireAdmin();
  await q("UPDATE sources SET is_active = NOT is_active WHERE id=$1", [Number(f.get("id"))]);
  revalidatePath("/admin");
}

export async function actionDeleteSource(f: FormData) {
  await requireAdmin();
  await q("DELETE FROM sources WHERE id=$1", [Number(f.get("id"))]);
  revalidatePath("/admin");
}

export async function actionSaveCompany(f: FormData) {
  await requireAdmin();
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
  await requireAdmin();
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
  await requireAdmin();
  const id = Number(f.get("id"));
  if (!process.env.ANTHROPIC_API_KEY) redirect(`/admin/stories/${id}?error=nokey`);
  await q("UPDATE stories SET manually_edited=FALSE WHERE id=$1", [id]);
  await summarizeStory(new Anthropic(), id);
  revalidatePath("/", "layout");
  redirect(`/admin/stories/${id}?regenerated=${encodeURIComponent(SUMMARY_MODEL)}`);
}

export async function actionBrief() {
  await requireAdmin();
  const r = await runBrief("manual", { force: true });
  revalidatePath("/", "layout");
  redirect(`/admin?brief=${encodeURIComponent(r.status)}`);
}

export async function actionSaveMinScore(f: FormData) {
  await requireAdmin();
  const v = Math.max(0, Math.min(100, Math.round(Number(f.get("min_score")))));
  if (!Number.isFinite(v)) redirect("/admin?tab=brief&error=invalid");
  await setSetting("brief_min_score", String(v));
  if (f.get("rebuild") === "1") {
    const r = await runBrief("manual", { force: true, reuseScores: true });
    revalidatePath("/", "layout");
    redirect(`/admin?tab=brief&saved=1&brief=${encodeURIComponent(r.status)}&items=${r.items}`);
  }
  redirect("/admin?tab=brief&saved=1");
}

export async function actionLandscape() {
  await requireAdmin();
  const r = await runLandscape("manual");
  revalidatePath("/compare");
  redirect(`/admin?landscape=${encodeURIComponent(r.status)}`);
}

export async function actionAddModel(f: FormData) {
  await requireAdmin();
  const name = str(f, "name");
  const key = str(f, "model_key");
  if (!name || !key) return;
  await q("INSERT INTO ai_models (name, model_key, company_slug, sort_order) VALUES ($1,$2,$3,$4) ON CONFLICT (model_key) DO NOTHING",
    [name, key, str(f, "company_slug") || null, Number(str(f, "sort_order")) || 100]);
  revalidatePath("/compare");
  redirect("/admin?tab=models");
}

export async function actionAddFact(f: FormData) {
  await requireAdmin();
  const raw = str(f, "value");
  const url = str(f, "source_url");
  const checked = str(f, "checked_on");
  if (!raw || !/^https?:\/\//.test(url) || !/^\d{4}-\d{2}-\d{2}$/.test(checked)) redirect("/admin?tab=models&error=invalid");
  const num = Number(raw.replace(/[,$]/g, ""));
  await q(
    `INSERT INTO model_facts (model_id, field, label, value_num, value_text, unit, condition, source_url, source_title, checked_on)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [Number(f.get("model_id")), str(f, "field"), str(f, "label") || null, Number.isFinite(num) ? num : null, Number.isFinite(num) ? null : raw,
     str(f, "unit") || null, str(f, "condition") || null, url, new URL(url).hostname, checked],
  );
  revalidatePath("/compare");
  redirect("/admin?tab=models");
}

export async function actionDeleteFact(f: FormData) {
  await requireAdmin();
  await q("DELETE FROM model_facts WHERE id=$1", [Number(f.get("id"))]);
  revalidatePath("/compare");
  redirect("/admin?tab=models");
}

export async function actionToggleModel(f: FormData) {
  await requireAdmin();
  await q("UPDATE ai_models SET status = CASE WHEN status='hidden' THEN 'published' ELSE 'hidden' END WHERE id=$1", [Number(f.get("id"))]);
  revalidatePath("/compare");
  redirect("/admin?tab=models");
}

export async function actionTagging() {
  await requireAdmin();
  const r = await runTagging("manual", 200);
  revalidatePath("/", "layout");
  redirect(`/admin?tagging=${r.done}-${r.changed}-${r.target}`);
}

export async function actionStatements() {
  await requireAdmin();
  const r = await runStatements("manual", 300);
  revalidatePath("/people", "layout");
  redirect(`/admin?tab=people&extracted=${r.saved}-${r.direct_quotes}-${r.candidates}`);
}

export async function actionPersonAnalyses(f: FormData) {
  await requireAdmin();
  const slug = str(f, "slug") || undefined;
  const r = await runPersonAnalyses("manual", slug);
  revalidatePath("/people", "layout");
  redirect(`/admin?tab=people&analyzed=${r.published}-${r.target}`);
}

export async function actionSavePerson(f: FormData) {
  await requireAdmin();
  const id = Number(str(f, "id")) || null;
  const aliases = str(f, "aliases").split(/[,、\n]/).map((s) => s.trim()).filter(Boolean);
  const vals = [str(f, "name"), str(f, "name_ja") || null, str(f, "role") || null, str(f, "role_checked_on") || null,
    str(f, "company_slug") || null, aliases, f.get("is_tracked") === "on", Number(str(f, "sort_order")) || 100];
  if (id) {
    await q("UPDATE people SET name=$1, name_ja=$2, role=$3, role_checked_on=$4, company_slug=$5, aliases=$6, is_tracked=$7, sort_order=$8 WHERE id=$9", [...vals, id]);
  } else {
    const slug = str(f, "slug").toLowerCase().replace(/[^a-z0-9-]/g, "-");
    if (!slug || !vals[0]) redirect("/admin?tab=people&error=invalid");
    await q("INSERT INTO people (name, name_ja, role, role_checked_on, company_slug, aliases, is_tracked, sort_order, slug) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (slug) DO NOTHING", [...vals, slug]);
    // 新しい人物を過去記事からも探せるよう、確認済みフラグをリセット
    await q("UPDATE stories SET people_checked_at=NULL WHERE coalesce(first_published_at, created_at) > now() - interval '60 days'");
  }
  revalidatePath("/people", "layout");
  redirect("/admin?tab=people&saved=1");
}
