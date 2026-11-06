import Link from "next/link";
export default function NotFound() {
  return <div className="py-20 text-center"><h1 className="text-xl font-bold">ページが見つかりません</h1><Link href="/" className="mt-4 inline-block text-accent">ダッシュボードへ</Link></div>;
}
