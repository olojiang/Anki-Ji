"use client";
/**
 * Renders a card of a custom note type: template HTML (Markdown fields when the type wants it) → DOMPurify →
 * container with the type's CSS scoped to it (`.card` = the container), so templates can't restyle the app.
 * `contain: layout paint` keeps even position:fixed template content inside the card.
 */
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { renderNoteTypeCard } from "@/core/notetypes";
import { scopeCss } from "@/core/template";
import { markdownField, sanitizeCardHtml } from "@/lib/markdown";
import { tn } from "@/lib/i18n-notetypes";
import { useApp } from "./providers";
import { cx } from "./ui";
import type { RenderedCard } from "@/core/notes";
import { speakSegments, ttsSupported } from "@/lib/tts";
import { templateTtsSegments } from "@/core/tts";

const BASE_CSS = (s: string) => `
${s} { text-align: center; }
${s} .ak-tts { display: inline-flex; align-items: center; justify-content: center; width: 2.25rem; height: 2.25rem; border-radius: 9999px; font-size: 0; cursor: pointer; vertical-align: middle; background: rgb(var(--muted)); color: rgb(var(--primary)); }
${s} .ak-tts::before { content: "\\25B6"; font-size: 0.8rem; }
${s} .ak-hint { display: inline-block; margin: 0.4em 0; }
${s} .ak-hint summary { cursor: pointer; color: rgb(var(--primary)); font-size: 0.9em; min-height: 44px; display: inline-flex; align-items: center; }
${s} .ak-tpl-error { color: rgb(var(--danger)); font-family: monospace; font-size: 0.85em; }
${s} [data-ak-type] { display: block; margin: 1em auto; max-width: 28rem; }
${s} hr#answer { margin: 1.25em 0; }
${s} img { max-width: 100%; height: auto; }
`;

function useDark(): boolean {
  const { theme } = useApp();
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const read = () => setDark(document.documentElement.classList.contains("dark"));
    read();
    const mo = new MutationObserver(read);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-theme"] });
    return () => mo.disconnect();
  }, [theme]);
  return dark;
}

export function TemplateCard({ card, revealed, typeSlot, className }: {
  card: RenderedCard; revealed: boolean; typeSlot?: (revealed: boolean) => ReactNode; className?: string;
}) {
  const { locale } = useApp();
  const scope = "ak-tpl-" + useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const dark = useDark();
  const ref = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const p = card.custom;
  const html = useMemo(() => {
    if (!mounted) return "";
    const r = p
      ? renderNoteTypeCard(p.noteType, p.values, p.ord, { tags: p.tags, deck: p.deck, formatField: p.noteType.markdown ? markdownField : undefined, hintLabel: tn(locale, "hint") })
      : card;
    return sanitizeCardHtml(revealed ? r.back : r.front);
  }, [mounted, p, card, revealed, locale]);
  const css = useMemo(() => BASE_CSS(`.${scope}`) + scopeCss(p?.noteType.css ?? card.css ?? "", `.${scope}`, { adaptColors: true }), [scope, p, card.css]);

  const [slot, setSlot] = useState<Element | null>(null);
  useEffect(() => { setSlot(ref.current?.querySelector("[data-ak-type]") ?? null); }, [html]);

  const onClick = (e: React.MouseEvent) => {
    const el = (e.target as HTMLElement).closest(".ak-tts") as HTMLElement | null;
    if (!el || !ttsSupported()) return;
    // shared speech lib (feat/ai-tts): voice picking by language + stop/replace semantics like the study speaker
    void speakSegments(templateTtsSegments(el.textContent ?? "", el.dataset.ttsLang));
  };

  return (
    <>
      <style>{css}</style>
      <div ref={ref} onClick={onClick} data-testid="template-card"
        className={cx(scope, "prose-card ak-tpl text-[17px] sm:text-[19px] xl:text-[20px]", dark && "ak-night nightMode night_mode", className)}
        style={{ contain: "layout paint", isolation: "isolate", position: "relative" }}
        dangerouslySetInnerHTML={{ __html: html }} />
      {slot && typeSlot && createPortal(typeSlot(revealed), slot)}
    </>
  );
}
