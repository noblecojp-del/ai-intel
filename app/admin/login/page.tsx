import { LoginForm } from "./form";

export const metadata = { title: "管理画面ログイン", robots: { index: false } };

export default function LoginPage() {
  return (
    <div className="mx-auto max-w-sm py-10">
      <h1 className="text-xl font-bold">管理画面ログイン</h1>
      <p className="mt-1 text-sm text-ink-soft">管理者のIDとパスワードを入力してください。</p>
      <LoginForm />
    </div>
  );
}
