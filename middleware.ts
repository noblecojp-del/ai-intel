// 管理画面(/admin)の保護：ログイン画面以外はログイン済みCookieが必要
import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_COOKIE, verifySession } from "@/lib/auth";

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname.startsWith("/admin/login")) return NextResponse.next();
  if (!process.env.ADMIN_PASSWORD && process.env.NODE_ENV !== "production") return NextResponse.next(); // ローカル開発のみ
  if (await verifySession(req.cookies.get(ADMIN_COOKIE)?.value)) return NextResponse.next();
  const url = req.nextUrl.clone();
  url.pathname = "/admin/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = { matcher: ["/admin", "/admin/:path*"] };
