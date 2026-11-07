"use client";
import { useActionState } from "react";
import { login } from "./actions";

export function LoginForm() {
  const [state, action, pending] = useActionState(login, {});
  return (
    <form action={action} className="card mt-5 space-y-4 p-5">
      <div><label className="label" htmlFor="user">ID</label><input id="user" name="user" autoComplete="username" defaultValue="admin" className="input" required /></div>
      <div><label className="label" htmlFor="password">パスワード</label><input id="password" name="password" type="password" autoComplete="current-password" className="input" required /></div>
      {state?.error && <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
      <button className="btn-primary w-full" disabled={pending}>{pending ? "確認中…" : "ログイン"}</button>
    </form>
  );
}
