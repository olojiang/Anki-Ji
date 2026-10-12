"use client";
import { useEffect, useState } from "react";
import { renderMarkdown } from "@/lib/markdown";
import { cx } from "./ui";

export function Markdown({ text, className }: { text: string; className?: string }) {
  const [html, setHtml] = useState("");
  useEffect(() => { setHtml(renderMarkdown(text)); }, [text]);
  return <div className={cx("prose-card", className)} dangerouslySetInnerHTML={{ __html: html }} />;
}
