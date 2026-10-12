import type { Metadata } from "next";
import { cookies } from "next/headers";
import "@fontsource-variable/inter";
import "katex/dist/katex.min.css";
import "./globals.css";
import { Providers } from "@/components/providers";

export const metadata: Metadata = { title: "Anki-ji · 间隔重复记忆卡片", description: "FSRS-6 spaced repetition flashcards" };

const themeScript = `try{var t=localStorage.getItem('ak-theme')||'light';var d=t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);if(d)document.documentElement.classList.add('dark')}catch(e){}`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = (await cookies()).get("ak-locale")?.value === "en" ? "en" : "zh";
  return (
    <html lang={locale === "zh" ? "zh-CN" : "en"} suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeScript }} /></head>
      <body className="min-h-screen font-sans text-[15px]">
        <Providers initialLocale={locale}>{children}</Providers>
      </body>
    </html>
  );
}
