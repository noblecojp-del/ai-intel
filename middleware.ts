// 管理画面(/admin)をBasic認証で保護。ADMIN_PASSWORD 未設定時は本番ではアクセス不可。
import { NextResponse, type NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  const user = process.env.ADMIN_USER || "admin";
  const pass = process.env.ADMIN_PASSWORD;
  if (!pass) {
    if (process.env.NODE_ENV === "production") {
      return new NextResponse("ADMIN_PASSWORD が未設定のため管理画面は無効です", { status: 503 });
    }
    return NextResponse.next(); // ローカル開発時のみ認証なし
  }
  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Basic ")) {
    const [u, p] = atob(auth.slice(6)).split(":");
    if (u === user && p === pass) return NextResponse.next();
  }
  return new NextResponse("認証が必要です", { status: 401, headers: { "WWW-Authenticate": 'Basic realm="admin"' } });
}

export const config = { matcher: ["/admin/:path*"] };
