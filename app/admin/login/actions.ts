"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ADMIN_COOKIE, checkCredentials, createSession, SESSION_DAYS } from "@/lib/auth";

export async function login(_: unknown, f: FormData): Promise<{ error?: string }> {
  if (!process.env.ADMIN_PASSWORD) return { error: "ADMIN_PASSWORD が設定されていないため、ログインできません。" };
  // 総当たり対策として少し待たせる
  await new Promise((r) => setTimeout(r, 400));
  if (!checkCredentials(String(f.get("user") ?? ""), String(f.get("password") ?? ""))) {
    return { error: "IDまたはパスワードが違います。" };
  }
  (await cookies()).set(ADMIN_COOKIE, await createSession(), {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: SESSION_DAYS * 86400,
  });
  redirect("/admin");
}

export async function logout() {
  (await cookies()).delete(ADMIN_COOKIE);
  redirect("/admin/login");
}
