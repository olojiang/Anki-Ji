import type { Metadata } from "next";
import { cookies } from "next/headers";
import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";
import "katex/dist/katex.min.css";
import "./globals.css";
import { Providers } from "@/components/providers";
import { themeBootScript } from "@/lib/themes";

export const metadata: Metadata = { title: "Anki-ji · 间隔重复记忆卡片", description: "FSRS-6 spaced repetition flashcards" };


export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = (await cookies()).get("ak-locale")?.value === "en" ? "en" : "zh";
  return (
    <html lang={locale === "zh" ? "zh-CN" : "en"} data-theme="light" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeBootScript }} /></head>
      <body className="min-h-screen font-sans text-[15px]">
        <Providers initialLocale={locale}>{children}</Providers>
      </body>
    </html>
  );
}
