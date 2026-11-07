// 管理画面のログイン（Cookie + HMAC署名）。middleware（Edge）とサーバーの両方で動くよう Web Crypto を使う
export const ADMIN_COOKIE = "ai_intel_admin";
export const SESSION_DAYS = 30;

function secret() {
  return `${process.env.ADMIN_PASSWORD ?? ""}::${process.env.CRON_SECRET ?? ""}::ai-intel-admin`;
}

async function hmac(data: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret()), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** 有効期限つきトークン: "<期限ms>.<署名>" */
export async function createSession(): Promise<string> {
  const exp = Date.now() + SESSION_DAYS * 864e5;
  return `${exp}.${await hmac(`admin:${exp}`)}`;
}

export async function verifySession(token: string | undefined): Promise<boolean> {
  if (!token || !process.env.ADMIN_PASSWORD) return false;
  const [expStr, sig] = token.split(".");
  const exp = Number(expStr);
  if (!exp || exp < Date.now() || !sig) return false;
  const expected = await hmac(`admin:${exp}`);
  if (expected.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0;
}

export function checkCredentials(user: string, pass: string): boolean {
  const u = process.env.ADMIN_USER || "admin";
  const p = process.env.ADMIN_PASSWORD;
  return !!p && user === u && pass === p;
}
