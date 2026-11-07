import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "AI Intel｜世界のAI動向を日本語で", template: "%s｜AI Intel" },
  description: "世界のAI企業の公式発表・ニュースを自動収集し、日本語で要約・整理する情報プラットフォーム",
};

const NAV = [
  { href: "/", label: "ダッシュボード" },
  { href: "/briefs", label: "TOP5" },
  { href: "/news", label: "ニュース" },
  { href: "/companies", label: "企業" },
  { href: "/compare", label: "比較" },
  { href: "/roadmap", label: "人物・動画", soon: true },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700&display=swap" rel="stylesheet" />
      </head>
      <body className="min-h-screen font-sans">
        <header className="sticky top-0 z-30 border-b border-line bg-white/95 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3">
            <Link href="/" className="shrink-0 text-[17px] font-bold tracking-tight">
              AI Intel<span className="ml-2 hidden text-xs font-medium text-ink-faint sm:inline">世界のAI動向を日本語で</span>
            </Link>
            <nav className="-mx-1 flex flex-1 gap-1 overflow-x-auto text-sm">
              {NAV.map((n) => (
                <Link key={n.href} href={n.href} className="whitespace-nowrap rounded px-2 py-1 text-ink-soft hover:bg-slate-100 hover:text-ink">
                  {n.label}
                  {n.soon && <span className="ml-1 text-[10px] text-ink-faint">準備中</span>}
                </Link>
              ))}
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-6 sm:py-8">{children}</main>
        <footer className="mt-12 border-t border-line bg-white">
          <div className="mx-auto max-w-6xl space-y-2 px-4 py-6 text-xs leading-relaxed text-ink-faint">
            <p>要約・分析はAIが生成したものです。正確な内容は必ず原文（各記事のリンク先）でご確認ください。「なぜ重要か」はAIによる分析であり、事実の記述ではありません。</p>
            <p>情報の取得は各情報源の公開フィードで検知できた範囲に限られ、リアルタイム性は保証しません。記事本文は保存せず、タイトル・抜粋・リンクのみを扱います。</p>
          </div>
        </footer>
      </body>
    </html>
  );
}
